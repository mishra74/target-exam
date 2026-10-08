/**
 * Idempotent import of the legacy `questions`/`questiontags` tables, restored
 * into a separate scratch MySQL database, into the existing Question Bank:
 * Question (by its stable `legacy_question_<qId>` id) + QuestionTranslation
 * + QuestionOption + OptionTranslation + QuestionTag + QuestionTagAssignment.
 *
 * No new question table, no parallel answer system, no copy of question
 * content into a second place — this only populates the child rows the
 * existing Question Bank / Test Builder / exam engine already read from.
 */
const { PrismaClient, QuestionStatus, QuestionServingEligibility, QuestionSourceType } = require('@prisma/client');
const { connectLegacyDatabase } = require('./legacy-mysql');

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

const NAMED_ENTITIES = {
  nbsp: ' ',
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
};

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m;
    });
}

function stripHtml(html) {
  if (!html) return '';
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseOptions(optionsJson) {
  let obj;
  try {
    obj = JSON.parse(optionsJson);
  } catch {
    return [];
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.keys(obj)
    .filter((k) => /^option\d+$/.test(k))
    .sort((a, b) => Number(a.replace('option', '')) - Number(b.replace('option', '')))
    .map((k) => ({ num: Number(k.replace('option', '')), text: stripHtml(obj[k]) }))
    .filter((o) => o.text.length > 0);
}

function languageFor(text) {
  return /[\u0900-\u097f]/.test(text) ? 'HI' : 'EN';
}

async function importTags(conn) {
  const [rows] = await conn.query('SELECT qtId, qtName FROM questiontags');
  const map = new Map();
  for (const row of rows) {
    const nameEn = row.qtName?.trim() || `Tag ${row.qtId}`;
    const tag = await prisma.questionTag.upsert({
      where: { legacyTagId: row.qtId },
      update: {},
      create: { nameEn, legacyTagId: row.qtId },
    });
    map.set(row.qtId, tag.id);
  }
  console.log(`Tags imported/verified: ${map.size}`);
  return map;
}

async function main() {
  const conn = await connectLegacyDatabase();

  try {
    const tagMap = await importTags(conn);
    const [[{ total: rawTotal }]] = await conn.query('SELECT COUNT(*) as total FROM questions');
    const fullTotal = Number(rawTotal);
    if (!Number.isSafeInteger(fullTotal)) {
      throw new Error('The legacy question count is outside the supported range.');
    }
    const limit = process.env.IMPORT_LIMIT === undefined ? fullTotal : Number(process.env.IMPORT_LIMIT);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error('IMPORT_LIMIT must be a positive integer.');
    }
    const total = Math.min(limit, fullTotal);
    console.log(`Total legacy questions to process: ${total} (of ${fullTotal})`);

    let processed = 0;
    let created = 0;
    let skipped = 0;

    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const [rows] = await conn.query(
        'SELECT qId, qtId, question, marks, neg_marks, totalOptions, options, qType, correctAns, qHint FROM questions ORDER BY qId LIMIT ? OFFSET ?',
        [Math.min(BATCH_SIZE, total - offset), offset],
      );

      const questionIds = rows.map((row) => `legacy_question_${row.qId}`);
      const existing = await prisma.questionTranslation.findMany({
        where: { questionId: { in: questionIds } },
        select: { questionId: true },
      });
      const alreadyDone = new Set(existing.map((item) => item.questionId));

      for (const row of rows) {
        processed++;
        const questionId = `legacy_question_${row.qId}`;
        if (alreadyDone.has(questionId)) {
          skipped++;
          continue;
        }

        const questionText = stripHtml(row.question);
        const explanation = stripHtml(row.qHint) || null;
        const options = parseOptions(row.options);
        const correctNum = Number(row.correctAns);
        const language = languageFor(questionText);
        if (
          !questionText ||
          options.length < 2 ||
          options.length !== Number(row.totalOptions) ||
          String(row.qType).trim().toLowerCase() !== 'radio' ||
          !Number.isInteger(correctNum) ||
          !options.some((option) => option.num === correctNum)
        ) {
          console.warn(
            `Skipped legacy question ${row.qId}: invalid text, option count, question type, or correct answer.`,
          );
          skipped++;
          continue;
        }

        try {
          await prisma.$transaction(async (tx) => {
            await tx.question.upsert({
              where: { id: questionId },
              update: {},
              create: {
                id: questionId,
                marks: row.marks,
                negativeMarks: row.neg_marks ?? 0,
                status: language === 'HI' ? QuestionStatus.MISSING_ENGLISH : QuestionStatus.MISSING_HINDI,
                source: QuestionSourceType.IMPORTED,
                sourceReference: `legacy_qid:${row.qId}`,
                isLegacyGrandfathered: true,
                servingEligibility: QuestionServingEligibility.LEGACY_TEMPORARY,
              },
            });

            await tx.questionTranslation.create({
              data: { questionId, language, text: questionText, explanation },
            });

            for (const opt of options) {
              const optionId = `${questionId}_opt_${opt.num}`;
              await tx.questionOption.create({
                data: {
                  id: optionId,
                  questionId,
                  order: opt.num - 1,
                  isCorrect: opt.num === correctNum,
                },
              });
              await tx.optionTranslation.create({
                data: { optionId, language, text: opt.text },
              });
            }

            const tagId = tagMap.get(row.qtId);
            if (tagId) {
              await tx.questionTagAssignment.create({
                data: { questionId, questionTagId: tagId },
              });
            } else {
              console.warn(`Legacy question ${row.qId} references missing question tag ${row.qtId}.`);
            }
          });
          created++;
        } catch (e) {
          console.error(`Failed on legacy question ${row.qId}:`, e.message);
          skipped++;
        }
      }

      console.log(`Progress: ${processed}/${total} (created ${created}, skipped ${skipped})`);
    }

    console.log(`Done. Created: ${created}, Skipped: ${skipped}, Total processed: ${processed}`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
