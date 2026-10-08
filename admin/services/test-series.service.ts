import { apiFetch } from '@/lib/api';
import type { Paginated, Test, TestSeries, TestVolume } from '@/types';

export interface TestSeriesInput {
  courseId?: string;
  titleEn: string;
  titleHi?: string;
  descriptionEn?: string;
  descriptionHi?: string;
  thumbnailUrl?: string;
  validityDays?: number;
  isFree?: boolean;
  price?: number;
  isPublished?: boolean;
}

export const testSeriesService = {
  list: (token: string, page = 1, limit = 50) =>
    apiFetch<Paginated<TestSeries>>(`/test-series/admin?page=${page}&limit=${limit}`, { token }),
  get: (token: string, id: string) => apiFetch<TestSeries>(`/test-series/admin/${id}`, { token }),
  create: (token: string, data: TestSeriesInput) =>
    apiFetch<TestSeries>('/test-series', { method: 'POST', token, body: data }),
  update: (token: string, id: string, data: Partial<TestSeriesInput>) =>
    apiFetch<TestSeries>(`/test-series/${id}`, { method: 'PATCH', token, body: data }),
  remove: (token: string, id: string) => apiFetch<void>(`/test-series/${id}`, { method: 'DELETE', token }),
};

export interface TestVolumeInput {
  testSeriesId: string;
  titleEn: string;
  titleHi?: string;
  order?: number;
}

export const testVolumesService = {
  list: (token: string, testSeriesId: string) =>
    apiFetch<TestVolume[]>(`/test-volumes?testSeriesId=${testSeriesId}`, { token }),
  create: (token: string, data: TestVolumeInput) =>
    apiFetch<TestVolume>('/test-volumes', { method: 'POST', token, body: data }),
  update: (token: string, id: string, data: Partial<TestVolumeInput>) =>
    apiFetch<TestVolume>(`/test-volumes/${id}`, { method: 'PATCH', token, body: data }),
  remove: (token: string, id: string) => apiFetch<void>(`/test-volumes/${id}`, { method: 'DELETE', token }),
};

export interface TestInput {
  testVolumeId: string;
  titleEn: string;
  titleHi?: string;
  instructionsEn?: string;
  instructionsHi?: string;
  type?: 'LIVE' | 'PRACTICE' | 'PDF';
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  durationMinutes?: number;
  marksPerQuestion?: number;
  negativeMarks?: number;
  isFree?: boolean;
  price?: number;
  bilingualRequired?: boolean;
}

export const testsService = {
  listByVolume: (token: string, testVolumeId: string) =>
    apiFetch<Test[]>(`/tests/admin?testVolumeId=${testVolumeId}`, { token }),
  listAll: (token: string) => apiFetch<Test[]>('/tests/admin', { token }),
  get: (token: string, id: string) => apiFetch<Test>(`/tests/admin/${id}`, { token }),
  create: (token: string, data: TestInput) => apiFetch<Test>('/tests', { method: 'POST', token, body: data }),
  update: (token: string, id: string, data: Partial<TestInput>) =>
    apiFetch<Test>(`/tests/${id}`, { method: 'PATCH', token, body: data }),
  remove: (token: string, id: string) => apiFetch<void>(`/tests/${id}`, { method: 'DELETE', token }),
  addQuestion: (token: string, testId: string, questionId: string, order?: number) =>
    apiFetch(`/tests/${testId}/questions`, { method: 'POST', token, body: { questionId, order } }),
  addQuestionsBulk: (token: string, testId: string, questionIds: string[]) =>
    apiFetch<{ added: string[]; alreadyInTest: { questionId: string; message: string }[] }>(
      `/tests/${testId}/questions/bulk`,
      { method: 'POST', token, body: { questionIds } },
    ),
  removeQuestion: (token: string, testId: string, questionId: string) =>
    apiFetch<void>(`/tests/${testId}/questions/${questionId}`, { method: 'DELETE', token }),
};
