'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Tag as TagIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { ConfirmDeleteButton } from '@/components/shared/confirm-delete-button';
import { QuestionFormDialog } from '@/components/shared/question-form-dialog';
import { QuestionImportDialog } from '@/components/shared/question-import-dialog';
import { QuestionTagManagerDialog } from '@/components/shared/question-tag-manager-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { questionsService } from '@/services/questions.service';
import { questionTagsService } from '@/services/question-tags.service';
import { subjectsService } from '@/services/catalog.service';
import { ApiError } from '@/lib/api';
import type { QuestionFull, QuestionTag, Subject } from '@/types';

const ALL = '__all__';

export default function QuestionBankPage() {
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<QuestionFull[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tags, setTags] = useState<QuestionTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState(ALL);
  const [tagId, setTagId] = useState(ALL);

  const loadStatic = async () => {
    if (!accessToken) return;
    const [s, t] = await Promise.all([subjectsService.list(accessToken), questionTagsService.list(accessToken)]);
    setSubjects(s);
    setTags(t);
  };

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await questionsService.list(accessToken, {
        page,
        limit: 25,
        search: search || undefined,
        subjectId: subjectId === ALL ? undefined : subjectId,
        tagId: tagId === ALL ? undefined : tagId,
      });
      setRows(res.items);
      setTotalPages(res.totalPages);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, page, search, subjectId, tagId]);

  const columns: Column<QuestionFull>[] = [
    {
      header: 'Question',
      cell: (r) => {
        const text = r.translations.find((t) => t.language === 'EN')?.text
          || r.translations.find((t) => t.language === 'HI')?.text
          || '(no text)';
        return <span className="line-clamp-2 max-w-md font-medium">{text}</span>;
      },
    },
    {
      header: 'Tags',
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {(r.tagAssignments ?? []).map((a) => (
            <Badge key={a.questionTag.id} variant="secondary">{a.questionTag.nameEn}</Badge>
          ))}
        </div>
      ),
    },
    { header: 'Difficulty', cell: (r) => <Badge variant="outline">{r.difficulty}</Badge> },
    {
      header: '',
      cell: (r) => (
        <div className="flex items-center gap-1">
          <QuestionFormDialog
            subjects={subjects}
            tags={tags}
            existing={r}
            trigger={<Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>}
            onSubmit={async (input) => {
              if (!accessToken) return;
              await questionsService.update(accessToken, r.id, input);
              toast.success('Question updated');
              load();
            }}
          />
          <ConfirmDeleteButton
            onConfirm={async () => {
              if (!accessToken) return;
              await questionsService.remove(accessToken, r.id);
              load();
            }}
          />
        </div>
      ),
      className: 'w-24',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Question Bank"
        description={`${total.toLocaleString()} question${total === 1 ? '' : 's'} · the master question pool, independent of any test`}
        action={
          accessToken && (
            <div className="flex items-center gap-2">
              <QuestionImportDialog
                subjects={subjects}
                tags={tags}
                onImported={load}
              />
              <QuestionTagManagerDialog
                tags={tags}
                trigger={<Button variant="outline" size="sm"><TagIcon className="h-4 w-4" /> Manage tags</Button>}
                onChanged={loadStatic}
              />
              <QuestionFormDialog
                subjects={subjects}
                tags={tags}
                onSubmit={async (input) => {
                  await questionsService.create(accessToken, input);
                  toast.success('Question created');
                  load();
                }}
              />
            </div>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search question text..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
        <Select value={subjectId} onValueChange={(v) => { setSubjectId(v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All subjects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All subjects</SelectItem>
            {subjects.filter((s) => s.id).map((s, index) => <SelectItem key={`${s.id}-${index}`} value={s.id}>{s.nameEn}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tagId} onValueChange={(v) => { setTagId(v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All tags" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tags</SelectItem>
            {tags.filter((t) => t.id).map((t, index) => <SelectItem key={`${t.id}-${index}`} value={t.id}>{t.nameEn}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} emptyTitle="No questions match these filters" />

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
