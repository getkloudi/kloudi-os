'use client';

import { cn } from '@/lib/cn';
import type { BadgeVariant, ExecutionStatus } from '@/types';

const variantStyles: Record<BadgeVariant, string> = {
  green: 'bg-[var(--green-s)] text-[var(--green)]',
  red: 'bg-[var(--red-s)] text-[var(--red)]',
  amber: 'bg-[var(--amber-s)] text-[var(--amber)]',
  blue: 'bg-[var(--blue-s)] text-[var(--blue)]',
  neutral: 'bg-[var(--bg-4)] text-[var(--text-3)]',
  accent: 'bg-[var(--accent-s)] text-[var(--accent)]',
};

const statusToVariant: Record<ExecutionStatus, BadgeVariant> = {
  completed: 'green',
  failed: 'red',
  running: 'blue',
  waiting_input: 'amber',
  pending: 'neutral',
  cancelled: 'accent',
};

const statusLabels: Record<ExecutionStatus, string> = {
  completed: 'completed',
  failed: 'failed',
  running: 'running',
  waiting_input: 'waiting',
  pending: 'pending',
  cancelled: 'cancelled',
};

interface BadgeProps {
  variant?: BadgeVariant;
  status?: ExecutionStatus;
  children?: React.ReactNode;
  className?: string;
}

export function Badge({ variant, status, children, className }: BadgeProps) {
  const resolvedVariant =
    variant ?? (status ? statusToVariant[status] : 'neutral');
  const label = children ?? (status ? statusLabels[status] : '');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-xl px-2 py-0.5 font-mono text-[10px] font-medium',
        variantStyles[resolvedVariant],
        className
      )}
    >
      {label}
    </span>
  );
}
