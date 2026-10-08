'use client';

import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { QuestionFormDialog } from '@/components/shared/question-form-dialog';
import { QuestionSelectorDialog } from '@/components/shared/question-selector-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';
import { testsService } from '@/services/test-series.service';
import { testSectionsService } from '@/services/test-sections.service';
import { questionsService } from '@/services/questions.service';
import { questionTagsService } from '@/services/question-tags.service';
import { subjectsService } from '@/services/catalog.service';
import { ApiError } from '@/lib/api';
import type { QuestionTag, Subject, Test, TestQuestionRow, TestSection } from '@/types';

export default function TestQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accessToken } = useAuth();
  const [test, setTest] = useState<Test | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tags, setTags] = useState<QuestionTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [updatingBilingualRequirement, setUpdatingBilingualRequirement] = useState(false);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [t, s, tg] = await Promise.all([
        testsService.get(accessToken, id),
        subjectsService.list(accessToken),
        questionTagsService.list(accessToken),
      ]);
      setTest(t);
      setSubjects(s);
      setTags(tg);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load test');
    } finally {
      setLoading(false);
    }
  };

  const setBilingualRequired = async (required: boolean) => {
    if (!accessToken) return;
    setUpdatingBilingualRequirement(true);
    try {
      await testsService.update(accessToken, id, { bilingualRequired: required });
      toast.success(
        required
          ? 'Only fully bilingual-validated questions can be added'
          : 'Legacy and single-language questions can now be added',
      );
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update bilingual requirement');
    } finally {
      setUpdatingBilingualRequirement(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, id]);

  if (loading || !test) {
    return <div className="py-20 text-center text-muted-foreground">Loading...</div>;
  }

  const questions = test.testQuestions ?? [];
  const sections = test.sections ?? [];
  const sectioned = sections.map((sec) => ({
    section: sec,
    questions: questions.filter((q) => q.sectionId === sec.id).sort((a, b) => a.order - b.order),
  }));
  const ungrouped = questions.filter((q) => !q.sectionId).sort((a, b) => a.order - b.order);

  const createSection = async () => {
    if (!accessToken || !newSectionTitle.trim()) return;
    await testSectionsService.create(accessToken, id, { titleEn: newSectionTitle.trim() });
    setNewSectionTitle('');
    toast.success('Section created');
    load();
  };

  const removeSection = async (sectionId: string) => {
    if (!accessToken) return;
    await testSectionsService.remove(accessToken, sectionId);
    toast.success('Section removed (its questions stay in the test)');
    load();
  };

  return (
    <div>
      <PageHeader
        title={test.titleEn}
        description={`${questions.length} question${questions.length === 1 ? '' : 's'} · ${test.durationMinutes} min · +${test.marksPerQuestion}/-${test.negativeMarks}`}
        action={
          accessToken && (
            <div className="flex items-center gap-2">
              <QuestionSelectorDialog
                subjects={subjects}
                tags={tags}
                bilingualRequired={test.bilingualRequired ?? true}
                trigger={<Button size="sm"><Plus className="h-4 w-4" /> Add existing questions</Button>}
                onSave={(questionIds) => testsService.addQuestionsBulk(accessToken, id, questionIds).then((r) => { load(); return r; })}
              />
              <QuestionFormDialog
                subjects={subjects}
                tags={tags}
                trigger={<Button size="sm" variant="outline">New question</Button>}
                onSubmit={async (input) => {
                  const created = await questionsService.create(accessToken, input);
                  await testsService.addQuestion(accessToken, id, created.id);
                  toast.success('Question created and added');
                  load();
                }}
              />
            </div>
          )
        }
      />

      <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-border p-4">
        <div className="space-y-1">
          <Label htmlFor="bilingual-required" className="font-medium">
            Require fully bilingual-validated questions
          </Label>
          <p className="text-sm text-muted-foreground">
            When enabled, only published questions with complete English and Hindi content can be added.
            Turn this off only for tests that intentionally use legacy or single-language questions.
          </p>
        </div>
        <Switch
          id="bilingual-required"
          checked={test.bilingualRequired ?? true}
          disabled={updatingBilingualRequirement}
          onCheckedChange={setBilingualRequired}
          aria-label="Require fully bilingual-validated questions"
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3">
        <span className="text-sm font-medium text-muted-foreground">Sections:</span>
        {sections.map((sec) => (
          <Badge key={sec.id} variant="outline" className="gap-1.5 py-1 pl-2.5 pr-1">
            {sec.titleEn} ({sec._count?.testQuestions ?? 0})
            <button onClick={() => removeSection(sec.id)} className="rounded-full p-0.5 hover:bg-destructive/10">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          placeholder="New section name (e.g. Indian Polity)"
          value={newSectionTitle}
          onChange={(e) => setNewSectionTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createSection()}
          className="h-8 max-w-56"
        />
        <Button size="sm" variant="outline" disabled={!newSectionTitle.trim()} onClick={createSection}>
          <Plus className="h-3.5 w-3.5" /> Section
        </Button>
      </div>

      {questions.length === 0 ? (
        <EmptyState title="No questions yet" description="Add questions from the Question Bank, or create a new one." />
      ) : (
        <div className="space-y-6">
          {sectioned.map(({ section, questions: sectionQuestions }) => (
            <div key={section.id}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">{section.titleEn}</h3>
                <QuestionSelectorDialog
                  subjects={subjects}
                  tags={tags}
                  bilingualRequired={test.bilingualRequired ?? true}
                  trigger={<Button size="sm" variant="ghost">+ Add to section</Button>}
                  onSave={(questionIds) => testSectionsService.addQuestions(accessToken!, section.id, questionIds).then((r) => { load(); return r; })}
                />
              </div>
              {sectionQuestions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No questions in this section yet.</p>
              ) : (
                <QuestionList
                  rows={sectionQuestions}
                  subjects={subjects}
                  tags={tags}
                  accessToken={accessToken}
                  onEdited={load}
                  onRemove={async (questionId) => {
                    if (!accessToken) return;
                    await testsService.removeQuestion(accessToken, id, questionId);
                    load();
                  }}
                />
              )}
            </div>
          ))}

          {(ungrouped.length > 0 || sections.length === 0) && (
            <div>
              {sections.length > 0 && <h3 className="mb-2 font-semibold text-muted-foreground">Ungrouped</h3>}
              {ungrouped.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No questions yet.</p>
              ) : (
                <QuestionList
                  rows={ungrouped}
                  subjects={subjects}
                  tags={tags}
                  accessToken={accessToken}
                  onEdited={load}
                  onRemove={async (questionId) => {
                    if (!accessToken) return;
                    await testsService.removeQuestion(accessToken, id, questionId);
                    load();
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionList({
  rows,
  subjects,
  tags,
  accessToken,
  onEdited,
  onRemove,
}: {
  rows: TestQuestionRow[];
  subjects: Subject[];
  tags: QuestionTag[];
  accessToken: string | null;
  onEdited: () => void;
  onRemove: (questionId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {rows.map((tq, index) => {
        const en = tq.question.translations.find((t) => t.language === 'EN');
        const hi = tq.question.translations.find((t) => t.language === 'HI');
        return (
          <Card key={tq.id}>
            <CardContent className="flex items-start justify-between gap-4 pt-5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-muted-foreground">Q{index + 1}</p>
                <p className="mt-1 font-medium">{en?.text || hi?.text}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tq.question.options.map((o) => (
                    <Badge key={o.id} variant={o.isCorrect ? 'success' : 'outline'}>
                      {o.translations.find((t) => t.language === 'EN')?.text ||
                        o.translations.find((t) => t.language === 'HI')?.text}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <QuestionFormDialog
                  subjects={subjects}
                  tags={tags}
                  existing={tq.question}
                  trigger={<Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>}
                  onSubmit={async (input) => {
                    if (!accessToken) return;
                    await questionsService.update(accessToken, tq.question.id, input);
                    toast.success('Question updated');
                    onEdited();
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => onRemove(tq.question.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
