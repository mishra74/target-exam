import { Loader2 } from 'lucide-react';
import { EmptyState } from './empty-state';

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyTitle = 'Nothing here yet',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {columns.map((col) => (
              <th key={col.header} className={`px-4 py-3 ${col.className ?? ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${rowKey(row) || 'row'}-${index}`} className="border-b border-border last:border-0 hover:bg-secondary/30">
              {columns.map((col) => (
                <td key={col.header} className={`px-4 py-3 align-middle ${col.className ?? ''}`}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
