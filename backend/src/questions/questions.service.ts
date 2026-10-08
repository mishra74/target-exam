import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Language,
  Prisma,
  QuestionServingEligibility,
  QuestionStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  PaginationDto,
  buildPaginationMeta,
} from '../common/dto/pagination.dto';
import {
  CreateQuestionDto,
  ImportQuestionRowDto,
  UpdateQuestionDto,
} from './dto/question.dto';

interface QuestionListFilters extends PaginationDto {
  subjectId?: string;
  topicId?: string;
  tagId?: string;
  fullyEligible?: boolean;
}

const FULL_INCLUDE = {
  translations: true,
  options: {
    include: { translations: true },
    orderBy: { order: 'asc' as const },
  },
  subject: true,
  topic: true,
  tagAssignments: { include: { questionTag: true } },
};

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: QuestionListFilters) {
    const { page, limit, search, subjectId, topicId, tagId, fullyEligible } =
      filters;
    const where = {
      deletedAt: null,
      ...(fullyEligible
        ? { servingEligibility: QuestionServingEligibility.FULLY_ELIGIBLE }
        : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(topicId ? { topicId } : {}),
      ...(tagId ? { tagAssignments: { some: { questionTagId: tagId } } } : {}),
      ...(search
        ? { translations: { some: { text: { contains: search } } } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.question.findMany({
        where,
        include: FULL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.question.count({ where }),
    ]);

    return { items, ...buildPaginationMeta(total, page, limit) };
  }

  findOne(id: string) {
    return this.prisma.question.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: FULL_INCLUDE,
    });
  }

  private validate(
    dto: CreateQuestionDto | UpdateQuestionDto,
    requireOptions: boolean,
  ) {
    if ('textEn' in dto && !dto.textEn && !dto.textHi && requireOptions) {
      throw new BadRequestException(
        'Provide the question text in at least one language',
      );
    }
    if (dto.options) {
      if (dto.options.length < 2) {
        throw new BadRequestException('A question needs at least two options');
      }
      if (!dto.options.some((o) => o.isCorrect)) {
        throw new BadRequestException('Mark at least one option as correct');
      }
      for (const option of dto.options) {
        if (!option.textEn && !option.textHi) {
          throw new BadRequestException(
            'Provide each option text in at least one language',
          );
        }
      }
    }
  }

  async create(dto: CreateQuestionDto, createdById: string) {
    this.validate(dto, true);

    return this.prisma.$transaction((tx) =>
      this.createInTransaction(tx, dto, createdById),
    );
  }

  async importMany(rows: ImportQuestionRowDto[], createdById: string) {
    const invalidRows: { rowNumber: number; message: string }[] = [];
    const validRows: ImportQuestionRowDto[] = [];

    for (const row of rows) {
      try {
        this.validate(row, true);
        validRows.push(row);
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        invalidRows.push({
          rowNumber: row.rowNumber,
          message: error.message,
        });
      }
    }

    const imported = await this.prisma.$transaction(
      async (tx) => {
        const result: { rowNumber: number; id: string }[] = [];
        for (const row of validRows) {
          const question = await this.createInTransaction(tx, row, createdById);
          result.push({ rowNumber: row.rowNumber, id: question.id });
        }
        return result;
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    return { imported, invalidRows };
  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    dto: CreateQuestionDto,
    createdById: string,
  ) {
    const question = await tx.question.create({
      data: {
        examId: dto.examId,
        examCycleId: dto.examCycleId,
        syllabusVersionId: dto.syllabusVersionId,
        subjectId: dto.subjectId,
        topicId: dto.topicId,
        subTopicId: dto.subTopicId,
        source: dto.source,
        sourceReference: dto.sourceReference,
        type: dto.type,
        difficulty: dto.difficulty,
        marks: dto.marks,
        negativeMarks: dto.negativeMarks,
        createdById,
      },
    });

    await this.writeTranslations(tx, question.id, dto);
    await this.writeOptions(tx, question.id, dto.options);
    if (dto.tagIds) {
      await this.writeTags(tx, question.id, dto.tagIds);
    }
    await this.recomputeLanguageStatus(tx, question.id);

    return tx.question.findUniqueOrThrow({
      where: { id: question.id },
      include: FULL_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateQuestionDto) {
    this.validate(dto, false);

    return this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id },
        data: {
          examId: dto.examId,
          examCycleId: dto.examCycleId,
          syllabusVersionId: dto.syllabusVersionId,
          subjectId: dto.subjectId,
          topicId: dto.topicId,
          subTopicId: dto.subTopicId,
          source: dto.source,
          sourceReference: dto.sourceReference,
          type: dto.type,
          difficulty: dto.difficulty,
          marks: dto.marks,
          negativeMarks: dto.negativeMarks,
        },
      });

      await this.writeTranslations(tx, id, dto);
      if (dto.options) {
        await tx.questionOption.deleteMany({ where: { questionId: id } });
        await this.writeOptions(tx, id, dto.options);
      }
      if (dto.tagIds) {
        await this.writeTags(tx, id, dto.tagIds);
      }
      await this.recomputeLanguageStatus(tx, id);

      return tx.question.findUniqueOrThrow({
        where: { id },
        include: FULL_INCLUDE,
      });
    });
  }

  /**
   * The only path by which a question becomes PUBLISHED. Hard-gated: both
   * languages must be complete on the question, every option, and the
   * explanation (if either language has one). The correct-answer mapping
   * cannot diverge between languages by construction — `isCorrect` lives on
   * the shared QuestionOption row, not per-translation, so EN and HI always
   * agree on which option is correct.
   */
  async publish(id: string) {
    const question = await this.prisma.question.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: FULL_INCLUDE,
    });

    const status = this.evaluateLanguageStatus(question);
    if (status !== QuestionStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Cannot publish: bilingual content is incomplete (${status}). Every question, option, and explanation-if-present must exist in both English and Hindi before publishing.`,
      );
    }

    return this.prisma.question.update({
      where: { id },
      data: {
        status: QuestionStatus.PUBLISHED,
        servingEligibility: QuestionServingEligibility.FULLY_ELIGIBLE,
      },
      include: FULL_INCLUDE,
    });
  }

  reject(id: string) {
    return this.prisma.question.update({
      where: { id },
      data: {
        status: QuestionStatus.REJECTED,
        servingEligibility: QuestionServingEligibility.NOT_ELIGIBLE,
      },
    });
  }

  archive(id: string) {
    return this.prisma.question.update({
      where: { id },
      data: {
        status: QuestionStatus.ARCHIVED,
        servingEligibility: QuestionServingEligibility.NOT_ELIGIBLE,
      },
    });
  }

  /**
   * Migration progress tracking (Stage 2, rule 7): real, queried counts —
   * never estimated. `legacyGrandfathered` / `legacyRemaining` specifically
   * answer "how much of the temporarily-allowed legacy backlog is left,"
   * which is the number that should trend to zero over time.
   */
  async stats() {
    const [byStatus, bySourceLegacy, legacyRemaining, legacyReviewed] =
      await Promise.all([
        this.prisma.question.groupBy({
          by: ['status'],
          where: { deletedAt: null },
          _count: true,
        }),
        this.prisma.question.groupBy({
          by: ['servingEligibility'],
          where: { deletedAt: null },
          _count: true,
        }),
        this.prisma.question.count({
          where: {
            deletedAt: null,
            isLegacyGrandfathered: true,
            servingEligibility: QuestionServingEligibility.LEGACY_TEMPORARY,
          },
        }),
        this.prisma.question.count({
          where: {
            deletedAt: null,
            isLegacyGrandfathered: true,
            status: QuestionStatus.PUBLISHED,
          },
        }),
      ]);

    const totalLegacy = await this.prisma.question.count({
      where: { deletedAt: null, isLegacyGrandfathered: true },
    });

    return {
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      byServingEligibility: Object.fromEntries(
        bySourceLegacy.map((r) => [r.servingEligibility, r._count]),
      ),
      totalLegacy,
      legacyStillPendingReview: legacyRemaining,
      legacyMovedToPublished: legacyReviewed,
    };
  }

  remove(id: string) {
    return this.prisma.question.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async writeTranslations(
    tx: Prisma.TransactionClient,
    questionId: string,
    dto: {
      textEn?: string;
      textHi?: string;
      explanationEn?: string;
      explanationHi?: string;
    },
  ) {
    if (dto.textEn !== undefined) {
      await tx.questionTranslation.upsert({
        where: { questionId_language: { questionId, language: Language.EN } },
        create: {
          questionId,
          language: Language.EN,
          text: dto.textEn,
          explanation: dto.explanationEn,
        },
        update: { text: dto.textEn, explanation: dto.explanationEn },
      });
    }
    if (dto.textHi !== undefined) {
      await tx.questionTranslation.upsert({
        where: { questionId_language: { questionId, language: Language.HI } },
        create: {
          questionId,
          language: Language.HI,
          text: dto.textHi,
          explanation: dto.explanationHi,
        },
        update: { text: dto.textHi, explanation: dto.explanationHi },
      });
    }
  }

  private async writeOptions(
    tx: Prisma.TransactionClient,
    questionId: string,
    options: CreateQuestionDto['options'],
  ) {
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const created = await tx.questionOption.create({
        data: {
          questionId,
          order: option.order ?? i,
          isCorrect: !!option.isCorrect,
        },
      });

      if (option.textEn) {
        await tx.optionTranslation.create({
          data: {
            optionId: created.id,
            language: Language.EN,
            text: option.textEn,
          },
        });
      }
      if (option.textHi) {
        await tx.optionTranslation.create({
          data: {
            optionId: created.id,
            language: Language.HI,
            text: option.textHi,
          },
        });
      }
    }
  }

  private async writeTags(
    tx: Prisma.TransactionClient,
    questionId: string,
    tagIds: string[],
  ) {
    await tx.questionTagAssignment.deleteMany({ where: { questionId } });
    if (tagIds.length === 0) return;
    await tx.questionTagAssignment.createMany({
      data: tagIds.map((questionTagId) => ({ questionId, questionTagId })),
      skipDuplicates: true,
    });
  }

  /**
   * Pure evaluation of a question's current bilingual completeness. Called
   * after every create/update (auto, non-destructive — it only ever adjusts
   * DRAFT, MISSING_ENGLISH, MISSING_HINDI, LANGUAGE_REVIEW_REQUIRED, or
   * PENDING_REVIEW) and by `publish()` as the hard gate. Never auto-transitions
   * to PUBLISHED, REJECTED, or ARCHIVED — those are explicit admin actions only.
   */
  private evaluateLanguageStatus(
    question: Prisma.QuestionGetPayload<{ include: typeof FULL_INCLUDE }>,
  ): QuestionStatus {
    const hasText = (lang: Language) =>
      !!question.translations.find((t) => t.language === lang)?.text?.trim();
    const explanationFor = (lang: Language) =>
      question.translations.find((t) => t.language === lang)?.explanation;

    const hasEn = hasText(Language.EN);
    const hasHi = hasText(Language.HI);

    if (!hasEn && !hasHi) return QuestionStatus.DRAFT;
    if (!hasEn) return QuestionStatus.MISSING_ENGLISH;
    if (!hasHi) return QuestionStatus.MISSING_HINDI;

    if (question.options.length === 0) {
      return QuestionStatus.LANGUAGE_REVIEW_REQUIRED;
    }
    for (const option of question.options) {
      const optHasEn = !!option.translations
        .find((t) => t.language === Language.EN)
        ?.text?.trim();
      const optHasHi = !!option.translations
        .find((t) => t.language === Language.HI)
        ?.text?.trim();
      if (!optHasEn || !optHasHi) {
        return QuestionStatus.LANGUAGE_REVIEW_REQUIRED;
      }
    }

    const explanationEn = explanationFor(Language.EN);
    const explanationHi = explanationFor(Language.HI);
    const explanationExists =
      !!explanationEn?.trim() || !!explanationHi?.trim();
    if (
      explanationExists &&
      (!explanationEn?.trim() || !explanationHi?.trim())
    ) {
      return QuestionStatus.LANGUAGE_REVIEW_REQUIRED;
    }

    return QuestionStatus.PENDING_REVIEW;
  }

  /**
   * `servingEligibility` is a separate concept from `status` (rule 4): it
   * never changes what `status` truthfully says, it only answers "can this
   * be shown to a student right now." Only pre-existing rows explicitly
   * marked `isLegacyGrandfathered` (set once, only by the backfill script)
   * get the temporary LEGACY_TEMPORARY carve-out — a brand-new question with
   * identical incomplete content is always NOT_ELIGIBLE, per the strict gate
   * for new content (rule 2/3).
   */
  private evaluateServingEligibility(
    status: QuestionStatus,
    isLegacyGrandfathered: boolean,
  ): QuestionServingEligibility {
    if (status === QuestionStatus.PUBLISHED) {
      return QuestionServingEligibility.FULLY_ELIGIBLE;
    }
    if (
      isLegacyGrandfathered &&
      status !== QuestionStatus.REJECTED &&
      status !== QuestionStatus.ARCHIVED
    ) {
      return QuestionServingEligibility.LEGACY_TEMPORARY;
    }
    return QuestionServingEligibility.NOT_ELIGIBLE;
  }

  private async recomputeLanguageStatus(
    tx: Prisma.TransactionClient,
    questionId: string,
  ) {
    const question = await tx.question.findUniqueOrThrow({
      where: { id: questionId },
      include: FULL_INCLUDE,
    });

    // Never downgrade a question a human already explicitly published,
    // rejected, or archived just because a later edit temporarily looks
    // incomplete mid-save — those are explicit-action-only states.
    if (
      question.status === QuestionStatus.PUBLISHED ||
      question.status === QuestionStatus.REJECTED ||
      question.status === QuestionStatus.ARCHIVED
    ) {
      return;
    }

    const status = this.evaluateLanguageStatus(question);
    const servingEligibility = this.evaluateServingEligibility(
      status,
      question.isLegacyGrandfathered,
    );
    if (
      status !== question.status ||
      servingEligibility !== question.servingEligibility
    ) {
      await tx.question.update({
        where: { id: questionId },
        data: { status, servingEligibility },
      });
    }
  }
}
