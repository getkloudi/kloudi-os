'use client';

import { cn } from '@/lib/cn';

interface AvatarProps {
  initials: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ initials, size = 'md', className }: AvatarProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-[var(--bg-4)] font-semibold text-[var(--text-2)]',
        size === 'sm' && 'h-6 w-6 text-[10px]',
        size === 'md' && 'h-[30px] w-[30px] text-xs',
        className
      )}
    >
      {initials}
    </div>
  );
}
