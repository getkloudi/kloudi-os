'use client';

import { cn } from '@/lib/cn';
import type { ExecutionStatus } from '@/types';

const statusColors: Record<string, string> = {
  completed: 'bg-[var(--green)]',
  failed: 'bg-[var(--red)]',
  running: 'bg-[var(--blue)]',
  waiting_input: 'bg-[var(--amber)]',
  pending: 'bg-[var(--bg-4)]',
};

interface ProgressBarProps {
  value: number;
  status?: ExecutionStatus;
  className?: string;
}

export function ProgressBar({ value, status = 'running', className }: ProgressBarProps) {
  return (
    <div className={cn('h-0.5 rounded-sm bg-[var(--bg-3)] overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-sm transition-[width] duration-300', statusColors[status])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
