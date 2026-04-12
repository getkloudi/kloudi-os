'use client';

import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-white hover:bg-[var(--accent-h)] hover:-translate-y-px',
  secondary:
    'bg-[var(--bg-3)] text-[var(--text-2)] hover:bg-[var(--bg-4)]',
  danger: 'bg-[var(--red)] text-white hover:brightness-110',
  ghost:
    'bg-transparent text-[var(--text-3)] hover:text-[var(--text-2)]',
};

interface ButtonProps {
  variant?: ButtonVariant;
  children: ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}

export function Button({
  variant = 'primary',
  children,
  onClick,
  disabled,
  className,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-[5px] rounded-lg px-4 py-2 text-[13px] font-medium',
        'cursor-pointer transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </button>
  );
}
