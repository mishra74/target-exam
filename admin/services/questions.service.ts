import { apiFetch } from '@/lib/api';
import type { Paginated, QuestionFull, QuestionTag } from '@/types';

export interface QuestionOptionInput {
  id?: string;
  textEn?: string;
  textHi?: string;
  isCorrect?: boolean;
  order?: number;
}

export interface QuestionInput {
  subjectId?: string;
  topicId?: string;
  type?: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  marks?: number;
  negativeMarks?: number;
  textEn?: string;
  textHi?: string;
  explanationEn?: string;
  explanationHi?: string;
  options: QuestionOptionInput[];
  tagIds?: string[];
}

export interface QuestionListOptions {
  page?: number;
  limit?: number;
  subjectId?: string;
  topicId?: string;
  tagId?: string;
  search?: string;
  fullyEligible?: boolean;
}

export interface QuestionImportResult {
  imported: { rowNumber: number; id: string }[];
  invalidRows: { rowNumber: number; message: string }[];
}

export const questionsService = {
  list: (token: string, opts: QuestionListOptions = {}) => {
    const { page = 1, limit = 20, subjectId, topicId, tagId, search, fullyEligible } = opts;
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (subjectId) params.set('subjectId', subjectId);
    if (topicId) params.set('topicId', topicId);
    if (tagId) params.set('tagId', tagId);
    if (search) params.set('search', search);
    if (fullyEligible) params.set('fullyEligible', 'true');
    return apiFetch<Paginated<QuestionFull>>(`/questions?${params}`, { token });
  },
  get: (token: string, id: string) => apiFetch<QuestionFull>(`/questions/${id}`, { token }),
  create: (token: string, data: QuestionInput) =>
    apiFetch<QuestionFull>('/questions', { method: 'POST', token, body: data }),
  importMany: (token: string, questions: (QuestionInput & { rowNumber: number })[]) =>
    apiFetch<QuestionImportResult>('/questions/import', {
      method: 'POST',
      token,
      body: { questions },
    }),
  update: (token: string, id: string, data: Partial<QuestionInput>) =>
    apiFetch<QuestionFull>(`/questions/${id}`, { method: 'PATCH', token, body: data }),
  remove: (token: string, id: string) => apiFetch<void>(`/questions/${id}`, { method: 'DELETE', token }),
};
