'use client';

import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/hooks/use-theme';
import type { Space } from '@/types';
import {
  Home,
  FolderOpen,
  FileText,
  Store,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { Avatar } from './primitives/avatar';

interface NavRailProps {
  activeSpace: Space;
  onSpaceChange: (space: Space) => void;
  userInitials: string;
  hasNotification?: boolean;
  onLogout: () => void;
}

const spaces: { id: Space; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'browse', icon: FolderOpen, label: 'Browse' },
  { id: 'editor', icon: FileText, label: 'Editor' },
  { id: 'store', icon: Store, label: 'Store' },
];

export function NavRail({
  activeSpace,
  onSpaceChange,
  userInitials,
  hasNotification,
  onLogout,
}: NavRailProps) {
  const { theme, setTheme } = useTheme();

  return (
    <nav
      className={cn(
        'flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[var(--border)] py-3',
        'bg-[var(--rail-bg)] backdrop-blur-[20px]',
        'z-[100]'
      )}
    >
      {/* Logo */}
      <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-s)] text-sm font-bold text-[var(--accent)]">
        l
      </div>

      {/* Space buttons */}
      {spaces.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onSpaceChange(id)}
          title={label}
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-3)]',
            'cursor-pointer transition-all duration-[120ms]',
            'hover:bg-[var(--bg-3)] hover:text-[var(--text-2)]',
            activeSpace === id && 'bg-[var(--accent-s)] text-[var(--accent)]'
          )}
        >
          <Icon className="h-[17px] w-[17px]" />
          {id === 'home' && hasNotification && (
            <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[var(--red)]" />
          )}
        </button>
      ))}

      <div className="flex-1" />

      {/* Theme toggle */}
      <div className="flex flex-col overflow-hidden rounded-md border border-[var(--border)]">
        <button
          onClick={() => setTheme('light')}
          className={cn(
            'flex h-8 w-9 items-center justify-center text-[var(--text-4)]',
            theme === 'light' && 'bg-[var(--accent-s)] text-[var(--accent)]'
          )}
          title="Light"
        >
          <Sun className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={cn(
            'flex h-8 w-9 items-center justify-center text-[var(--text-4)]',
            theme === 'dark' && 'bg-[var(--accent-s)] text-[var(--accent)]'
          )}
          title="Dark"
        >
          <Moon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setTheme('auto')}
          className={cn(
            'flex h-8 w-9 items-center justify-center text-[var(--text-4)]',
            theme === 'auto' && 'bg-[var(--accent-s)] text-[var(--accent)]'
          )}
          title="Auto"
        >
          <Monitor className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* User avatar */}
      <button onClick={onLogout} title="Sign out" className="mt-2">
        <Avatar initials={userInitials} size="md" />
      </button>
    </nav>
  );
}
