'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ListPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { questionsService } from '@/services/questions.service';
import { ApiError } from '@/lib/api';
import type { QuestionFull, QuestionTag, Subject } from '@/types';

const ALL = '__all__';

/**
 * The paginated, search+tag-filterable "add existing questions from the
 * Question Bank" picker (never forces creating a new question). Selection is
 * kept in a Set that survives page/search/tag changes until Save, per the
 * Test Builder spec's pagination-must-not-clear-selection requirement.
 */
export function QuestionSelectorDialog({
  subjects,
  tags,
  trigger,
  bilingualRequired = true,
  onSave,
}: {
  subjects: Subject[];
  tags: QuestionTag[];
  trigger?: React.ReactNode;
  bilingualRequired?: boolean;
  onSave: (questionIds: string[]) => Promise<{
    added: string[];
    alreadyInTest: { questionId: string; message: string }[];
  }>;
}) {
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<QuestionFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [tagId, setTagId] = useState<string>(ALL);
  const [subjectId, setSubjectId] = useState<string>(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !accessToken) return;
    setLoading(true);
    questionsService
      .list(accessToken, {
        page,
        limit: 20,
        search: search || undefined,
        tagId: tagId === ALL ? undefined : tagId,
        subjectId: subjectId === ALL ? undefined : subjectId,
      })
      .then((res) => {
        setItems(res.items);
        setTotalPages(res.totalPages);
        setTotal(res.total);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Could not load questions'))
      .finally(() => setLoading(false));
  }, [open, accessToken, page, search, tagId, subjectId, bilingualRequired]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setPage(1);
      setSearch('');
      setTagId(ALL);
      setSubjectId(ALL);
    }
  }, [open]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await onSave([...selected]);
      if (result.alreadyInTest.length > 0) {
        toast.warning(
          `${result.added.length} added, ${result.alreadyInTest.length} already in this test (skipped).`,
        );
      } else {
        toast.success(`${result.added.length} question(s) added.`);
      }
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add questions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <ListPlus className="h-4 w-4" /> Add existing questions
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add questions from the Question Bank</DialogTitle>
          {bilingualRequired && (
            <p className="text-sm text-muted-foreground">
              All questions can be selected. To save questions that are not fully bilingual
              validated, turn off the bilingual requirement on the test first.
            </p>
          )}
          {!bilingualRequired && (
            <p className="text-sm text-muted-foreground">
              All questions are shown, including legacy and single-language questions.
            </p>
          )}
        </DialogHeader>

        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Search question text..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
          <Select value={tagId} onValueChange={(v) => { setTagId(v); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All tags" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tags</SelectItem>
              {tags.filter((t) => t.id).map((t, index) => <SelectItem key={`${t.id}-${index}`} value={t.id}>{t.nameEn}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={subjectId} onValueChange={(v) => { setSubjectId(v); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All subjects" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All subjects</SelectItem>
              {subjects.filter((s) => s.id).map((s, index) => <SelectItem key={`${s.id}-${index}`} value={s.id}>{s.nameEn}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="ml-auto self-center text-sm text-muted-foreground">
            {total.toLocaleString()} question{total === 1 ? '' : 's'} available
          </span>
        </div>

        <div className="max-h-[45vh] min-h-[200px] space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading...</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No questions match these filters.</p>
          ) : (
            items.map((q, index) => {
              const text = q.translations.find((t) => t.language === 'EN')?.text
                || q.translations.find((t) => t.language === 'HI')?.text
                || '(no text)';
              const checked = selected.has(q.id);
              const eligible = q.servingEligibility === 'FULLY_ELIGIBLE';
              return (
                <label
                  key={`${q.id || 'question'}-${index}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm hover:bg-secondary ${checked ? 'bg-primary/5' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(q.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{text}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {eligible ? 'Bilingual validated' : `Not eligible: ${q.status}`}
                    </span>
                    {q.tagAssignments && q.tagAssignments.length > 0 && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {q.tagAssignments.map((a) => a.questionTag.nameEn).join(', ')}
                      </span>
                    )}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
          <span className="font-medium">Selected: {selected.size}</span>
        </div>

        <DialogFooter>
          <Button disabled={saving || selected.size === 0} onClick={save}>
            {saving ? 'Saving...' : `Save ${selected.size} question${selected.size === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
