import { cn } from '@/lib/utils';

export function Logo({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 select-none', className)}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect width="32" height="32" rx="9" fill="hsl(var(--primary))" />
        <path
          d="M9 12.5L14.3 18.5L23 9.5"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9 21.5H23" stroke="hsl(var(--accent))" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      {!iconOnly && (
        <span className="text-lg font-extrabold tracking-tight text-foreground">
          Test<span className="text-primary">Mela</span>
        </span>
      )}
    </span>
  );
}
