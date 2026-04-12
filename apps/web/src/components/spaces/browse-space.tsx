'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { ProcedureFile, EntityType } from '@/types';

interface BrowseSpaceProps {
  files: ProcedureFile[];
  currentPath: string;
  onFileOpen: (id: string) => void;
  onSearch?: (query: string) => void;
}

type SidebarSection = 'favorites' | 'workspaces' | 'tags';

interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  section: SidebarSection;
  color?: string;
}

const sidebarItems: SidebarItem[] = [
  { id: 'procedures', label: 'procedures', icon: '📁', section: 'favorites' },
  { id: 'shared', label: 'shared', icon: '📂', section: 'favorites' },
  { id: 'recent', label: 'recent', icon: '🕐', section: 'favorites' },
  { id: 'default', label: 'default', icon: '🏠', section: 'workspaces' },
  { id: 'staging', label: 'staging', icon: '🧪', section: 'workspaces' },
  { id: 'production', label: 'production', icon: '●', section: 'tags', color: 'var(--green)' },
  { id: 'draft', label: 'draft', icon: '●', section: 'tags', color: 'var(--amber)' },
];

const fileIcons: Record<EntityType, string> = {
  skill: '⚡',
  guide: '📖',
  task: '🎯',
  project: '📦',
  folder: '📁',
};

export function BrowseSpace({
  files,
  currentPath,
  onFileOpen,
  onSearch,
}: BrowseSpaceProps) {
  const [activeSidebar, setActiveSidebar] = useState('procedures');
  const [filter, setFilter] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const filteredFiles = filter
    ? files.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase()))
    : files;

  const sections: SidebarSection[] = ['favorites', 'workspaces', 'tags'];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-10 pb-6 pt-8">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-1)]">
            Browse
          </h1>
          <div className="mt-1 font-mono text-xs text-[var(--text-3)]">
            {currentPath}
          </div>
        </div>
        <div className="flex w-60 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3.5 py-2">
          <span className="text-sm text-[var(--text-4)]">&#x2315;</span>
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              onSearch?.(e.target.value);
            }}
            placeholder="Filter..."
            className="flex-1 border-none bg-transparent text-[13px] text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-6 px-10 pb-10">
        {/* Sidebar */}
        <div className="w-[180px] shrink-0">
          {sections.map((section) => {
            const items = sidebarItems.filter((i) => i.section === section);
            return (
              <div key={section}>
                <div className="mb-1.5 mt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)] first:mt-0">
                  {section}
                </div>
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSidebar(item.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-[var(--text-2)]',
                      'cursor-pointer transition-all duration-100',
                      activeSidebar === item.id
                        ? 'bg-[var(--accent-s)] text-[var(--accent)]'
                        : 'hover:bg-[var(--bg-3)]'
                    )}
                  >
                    <span
                      className="w-4 text-center text-[13px]"
                      style={item.color ? { color: item.color } : undefined}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div className="flex-1">
          <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
            {filteredFiles.map((file) => (
              <button
                key={file.id}
                onDoubleClick={() => onFileOpen(file.id)}
                onClick={() => setSelectedFile(file.id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-[10px] px-2.5 py-4 text-center',
                  'cursor-pointer transition-all duration-[120ms]',
                  'hover:bg-[var(--bg-3)]',
                  selectedFile === file.id && 'bg-[var(--accent-s)]'
                )}
              >
                <span className="text-[32px] leading-none">
                  {fileIcons[file.type] || '📄'}
                </span>
                <span className="break-all text-[11px] leading-[1.3] text-[var(--text-2)]">
                  {file.name}
                  {file.isFolder && '/'}
                </span>
              </button>
            ))}
          </div>
          {filteredFiles.length === 0 && (
            <p className="py-12 text-center text-sm text-[var(--text-3)]">
              No procedures found
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
