'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Command, BookOpen, Zap, Target, Folder } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface CommandItem {
  id: string;
  name: string;
  type: 'guide' | 'skill' | 'task' | 'project' | 'action';
  description?: string;
}

interface OmniboxProps {
  items: CommandItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const typeIcons = {
  guide: BookOpen,
  skill: Zap,
  task: Target,
  project: Folder,
  action: Command,
};

const typeColors = {
  guide: 'text-blue-400',
  skill: 'text-yellow-400',
  task: 'text-green-400',
  project: 'text-purple-400',
  action: 'text-muted-foreground',
};

export function Omnibox({ items, onSelect, onClose, isOpen }: OmniboxProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      item.description?.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            onSelect(filteredItems[selectedIndex].id);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isOpen, filteredItems, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Command palette */}
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search procedures..."
            className="flex-1 bg-transparent py-4 text-sm text-foreground placeholder-muted-foreground outline-none"
          />
          <kbd className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = typeIcons[item.type];
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                    index === selectedIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  )}
                >
                  <Icon className={cn('h-4 w-4', typeColors[item.type])} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">
                      {item.name}
                    </div>
                    {item.description && (
                      <div className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </div>
                    )}
                  </div>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {item.type}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">
              ↑↓
            </kbd>
            <span>navigate</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">
              ↵
            </kbd>
            <span>select</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useOmnibox() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}

export default Omnibox;
