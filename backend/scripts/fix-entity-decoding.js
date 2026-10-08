/**
 * Corrective pass: re-derive QuestionTranslation/OptionTranslation text from
 * the restored legacy source tables using the fixed stripHtml (which now
 * decodes named entities like &rsquo; &mdash; etc.), and update in place only
 * where the text actually changes. No new rows, no touching isCorrect/order/
 * tags/status -- purely fixes the decoded text.
 */
const { PrismaClient } = require('@prisma/client');
const { connectLegacyDatabase } = require('./legacy-mysql');

const prisma = new PrismaClient();

const NAMED_ENTITIES = {
  nbsp: ' ', quot: '"', amp: '&', lt: '<', gt: '>', apos: "'",
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  mdash: '—', ndash: '–', hellip: '…',
  copy: '©', reg: '®', trade: '™', deg: '°',
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
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseOptions(optionsJson) {
  let obj;
  try { obj = JSON.parse(optionsJson); } catch { return []; }
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

async function main() {
  const conn = await connectLegacyDatabase();

  try {
    const [[{ total }]] = await conn.query('SELECT COUNT(*) as total FROM questions');
    console.log(`Rechecking ${total} legacy rows for entity-decoding fixes...`);

    let updatedQuestions = 0;
    let updatedOptions = 0;
    const BATCH_SIZE = 500;

    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const [rows] = await conn.query(
        'SELECT qId, question, options, qHint FROM questions ORDER BY qId LIMIT ? OFFSET ?',
        [BATCH_SIZE, offset],
      );

      for (const row of rows) {
        const questionId = `legacy_question_${row.qId}`;
        const correctText = stripHtml(row.question);
        const correctExplanation = stripHtml(row.qHint) || null;
        const language = languageFor(correctText);

        const translations = await prisma.questionTranslation.findMany({
          where: { questionId },
        });
        const translation =
          translations.find((item) => item.language === language) ?? translations[0];
        if (translation && (translation.text !== correctText || translation.explanation !== correctExplanation)) {
          await prisma.questionTranslation.update({
            where: { id: translation.id },
            data: { text: correctText, explanation: correctExplanation },
          });
          updatedQuestions++;
        }

        const options = parseOptions(row.options);
        for (const opt of options) {
          const optionId = `${questionId}_opt_${opt.num}`;
          const optTranslations = await prisma.optionTranslation.findMany({
            where: { optionId },
          });
          const optTranslation =
            optTranslations.find((item) => item.language === language) ?? optTranslations[0];
          if (optTranslation && optTranslation.text !== opt.text) {
            await prisma.optionTranslation.update({
              where: { id: optTranslation.id },
              data: { text: opt.text },
            });
            updatedOptions++;
          }
        }
      }

      console.log(`Progress: ${Math.min(offset + BATCH_SIZE, total)}/${total} (questions fixed: ${updatedQuestions}, options fixed: ${updatedOptions})`);
    }

    console.log(`Done. Questions fixed: ${updatedQuestions}, Options fixed: ${updatedOptions}`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
