'use client';

import { useRef, useState } from 'react';
import type { CellValue } from 'exceljs';
import { Download, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';
import { questionsService, type QuestionInput } from '@/services/questions.service';
import type { QuestionTag, Subject } from '@/types';

const MAX_ROWS = 100;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const OPTION_COUNT = 5;
const HEADERS = [
  'questionEn',
  'questionHi',
  'explanationEn',
  'explanationHi',
  'subject',
  'topic',
  'tags',
  'difficulty',
  'marks',
  'negativeMarks',
  'type',
  'correctOption',
  ...Array.from({ length: OPTION_COUNT }, (_, index) => [
    `option${index + 1}En`,
    `option${index + 1}Hi`,
  ]).flat(),
];

interface ParsedRow {
  rowNumber: number;
  input?: QuestionInput & { rowNumber: number };
  errors: string[];
}

function cellText(value: CellValue): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value && typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
    if ('result' in value) return cellText(value.result as CellValue);
  }
  return '';
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function namedMatches<T extends { nameEn: string; nameHi?: string | null }>(
  items: T[],
  name: string,
) {
  const target = normalized(name);
  return items.filter(
    (item) => normalized(item.nameEn) === target || normalized(item.nameHi ?? '') === target,
  );
}

function parseRow(
  cells: Record<string, string>,
  rowNumber: number,
  subjects: Subject[],
  tags: QuestionTag[],
): ParsedRow {
  const errors: string[] = [];
  const addError = (message: string) => errors.push(message);
  const textEn = cells.questionen || '';
  const textHi = cells.questionhi || '';
  if (!textEn && !textHi) addError('Enter question text in English or Hindi.');

  const options: NonNullable<QuestionInput['options']> = [];
  for (let index = 1; index <= OPTION_COUNT; index++) {
    const optionEn = cells[`option${index}en`] || '';
    const optionHi = cells[`option${index}hi`] || '';
    if (optionEn || optionHi) {
      options.push({
        textEn: optionEn || undefined,
        textHi: optionHi || undefined,
        isCorrect: false,
        order: index - 1,
      });
    }
  }
  if (options.length < 2) addError('Enter at least two options.');

  const rawCorrect = cells.correctoption || '';
  const correctIndexes = rawCorrect
    .split(/[,;|]/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= OPTION_COUNT);
  if (correctIndexes.length === 0 || rawCorrect.split(/[,;|]/).some((v) => !v.trim() || !/^\d+$/.test(v.trim()))) {
    addError('Correct option must contain option number(s), such as 2 or 1,3.');
  }

  const type = (cells.type || 'SINGLE_CHOICE').toUpperCase();
  if (type !== 'SINGLE_CHOICE' && type !== 'MULTIPLE_CHOICE') {
    addError('Type must be SINGLE_CHOICE or MULTIPLE_CHOICE.');
  } else if (type === 'SINGLE_CHOICE' && correctIndexes.length !== 1) {
    addError('A single-choice question must have exactly one correct option.');
  } else if (type === 'MULTIPLE_CHOICE' && correctIndexes.length < 2) {
    addError('A multiple-choice question must have at least two correct options.');
  }
  for (const index of correctIndexes) {
    const option = options.find((item) => item.order === index - 1);
    if (!option) addError(`Correct option ${index} has no option text.`);
    else option.isCorrect = true;
  }

  const difficulty = (cells.difficulty || 'MEDIUM').toUpperCase();
  if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) {
    addError('Difficulty must be EASY, MEDIUM, or HARD.');
  }

  const parseMark = (value: string, name: string, fallback: number) => {
    if (!value) return fallback;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      addError(`${name} must be a non-negative number.`);
      return fallback;
    }
    return number;
  };
  const marks = parseMark(cells.marks || '', 'Marks', 1);
  const negativeMarks = parseMark(cells.negativemarks || '', 'Negative marks', 0);

  let subjectId: string | undefined;
  let topicId: string | undefined;
  const subjectName = cells.subject || '';
  if (subjectName) {
    const matches = namedMatches(subjects, subjectName);
    if (matches.length !== 1) addError(`Subject "${subjectName}" does not match exactly one existing subject.`);
    else subjectId = matches[0].id;
  }

  const topicName = cells.topic || '';
  if (topicName) {
    const possibleTopics = subjects
      .filter((subject) => !subjectId || subject.id === subjectId)
      .flatMap((subject) => (subject.topics ?? []).map((topic) => ({ ...topic, subjectId: subject.id })));
    const topicMatches = possibleTopics.filter(
      (topic) => normalized(topic.nameEn) === normalized(topicName) ||
        normalized(topic.nameHi ?? '') === normalized(topicName),
    );
    if (topicMatches.length !== 1) addError(`Topic "${topicName}" does not match exactly one topic for the selected subject.`);
    else {
      topicId = topicMatches[0].id;
      subjectId = subjectId ?? topicMatches[0].subjectId;
    }
  }

  const tagIds: string[] = [];
  for (const tagName of (cells.tags || '').split(',').map((value) => value.trim()).filter(Boolean)) {
    const matches = namedMatches(tags, tagName);
    if (matches.length !== 1) addError(`Tag "${tagName}" does not match exactly one existing tag.`);
    else if (!tagIds.includes(matches[0].id)) tagIds.push(matches[0].id);
  }

  if (options.some((option) => !option.textEn && !option.textHi)) {
    addError('Every option must have English or Hindi text.');
  }

  if (errors.length > 0) return { rowNumber, errors };
  return {
    rowNumber,
    errors,
    input: {
      rowNumber,
      textEn: textEn || undefined,
      textHi: textHi || undefined,
      explanationEn: cells.explanationen || undefined,
      explanationHi: cells.explanationhi || undefined,
      subjectId,
      topicId,
      tagIds,
      difficulty: difficulty as QuestionInput['difficulty'],
      type: type as QuestionInput['type'],
      marks,
      negativeMarks,
      options,
    },
  };
}

export function QuestionImportDialog({
  subjects,
  tags,
  onImported,
}: {
  subjects: Subject[];
  tags: QuestionTag[];
  onImported: () => void;
}) {
  const { accessToken } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setFileName('');
    setRows([]);
    if (fileInput.current) fileInput.current.value = '';
  };

  const downloadTemplate = async () => {
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Questions');
      worksheet.addRow(HEADERS);
      worksheet.getRow(1).font = { bold: true };
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.addRow([
        'What is 2 + 2?',
        '2 + 2 कितना होता है?',
        '',
        '',
        '',
        '',
        '',
        'MEDIUM',
        1,
        0,
        'SINGLE_CHOICE',
        2,
        '1',
        '१',
        '4',
        '४',
        '3',
        '३',
        '2',
        '२',
        '',
        '',
      ]);
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'question-import-template.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the Excel template');
    }
  };

  const readFile = async (file?: File) => {
    reset();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Choose an .xlsx Excel workbook.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Excel file must be 10 MB or smaller.');
      return;
    }

    setReading(true);
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];
      if (!worksheet || worksheet.rowCount < 2) {
        throw new Error('The first worksheet must contain a header row and at least one question.');
      }

      const headerRow = worksheet.getRow(1);
      const headers = new Map<string, number>();
      headerRow.eachCell((cell, columnNumber) => {
        const header = normalized(cellText(cell.value));
        if (!header) return;
        if (headers.has(header)) throw new Error(`Duplicate column header "${header}".`);
        headers.set(header, columnNumber);
      });
      const requiredHeaders = [
        'questionen',
        'questionhi',
        'correctoption',
        'option1en',
        'option1hi',
        'option2en',
        'option2hi',
      ];
      const missingHeaders = requiredHeaders.filter((header) => !headers.has(header));
      if (missingHeaders.length > 0) {
        throw new Error(`Missing required columns: ${missingHeaders.join(', ')}.`);
      }

      const parsed: ParsedRow[] = [];
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const cells: Record<string, string> = {};
        for (const [header, column] of headers) {
          cells[header] = cellText(row.getCell(column).value);
        }
        if (Object.values(cells).every((value) => !value)) continue;
        parsed.push(parseRow(cells, rowNumber, subjects, tags));
      }

      if (parsed.length === 0) throw new Error('The worksheet contains no question rows.');
      if (parsed.length > MAX_ROWS) {
        throw new Error(`Import up to ${MAX_ROWS} questions at a time; this sheet has ${parsed.length}.`);
      }
      setFileName(file.name);
      setRows(parsed);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read the Excel workbook');
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const importQuestions = async () => {
    if (!accessToken) return;
    const validRows = rows.filter((row): row is ParsedRow & { input: QuestionInput & { rowNumber: number } } =>
      Boolean(row.input),
    );
    if (validRows.length === 0) return;

    setImporting(true);
    try {
      const result = await questionsService.importMany(
        accessToken,
        validRows.map((row) => row.input),
      );
      const count = result.imported.length;
      toast.success(`${count} question${count === 1 ? '' : 's'} imported.`);
      if (result.invalidRows.length > 0) {
        toast.warning(`${result.invalidRows.length} row(s) were rejected by server validation.`);
      }
      onImported();
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not import questions');
    } finally {
      setImporting(false);
    }
  };

  const validCount = rows.filter((row) => row.input).length;
  const invalidRows = rows.filter((row) => row.errors.length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><FileUp className="h-4 w-4" /> Import Excel</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import questions from Excel</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Upload an .xlsx file with one question per row. Import up to {MAX_ROWS} questions at a time.
          </p>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4" /> Download template
          </Button>
          <Button variant="outline" size="sm" disabled={reading} onClick={() => fileInput.current?.click()}>
            <FileUp className="h-4 w-4" /> Choose .xlsx file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
          {reading && <span className="text-sm text-muted-foreground">Reading workbook...</span>}
          {fileName && <span className="truncate text-sm text-muted-foreground">{fileName}</span>}
        </div>

        <div className="space-y-2 rounded-lg border border-border p-3 text-sm text-muted-foreground">
          <p>Use the downloaded template headers. Options 1–5 can be entered in English, Hindi, or both.</p>
          <p>
            Correct option uses its option number; enter multiple numbers separated by commas for
            MULTIPLE_CHOICE. Subjects, topics, and comma-separated tags must match existing names.
            Missing type/difficulty/marks default to SINGLE_CHOICE/MEDIUM/1.
          </p>
          <p>Imported questions are saved as drafts/review-required until an admin completes and publishes them.</p>
        </div>

        {rows.length > 0 && (
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
            <p className="font-medium">
              {fileName}: {validCount} ready, {invalidRows.length} with errors
            </p>
            {invalidRows.map((row) => (
              <div key={row.rowNumber} className="text-sm text-destructive">
                Row {row.rowNumber}: {row.errors.join(' ')}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button disabled={importing || reading || validCount === 0} onClick={() => void importQuestions()}>
            {importing ? 'Importing...' : `Import ${validCount} question${validCount === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
