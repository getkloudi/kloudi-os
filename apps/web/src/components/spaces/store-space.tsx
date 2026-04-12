'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { StoreApp } from '@/types';

interface StoreSpaceProps {
  apps: StoreApp[];
  onInstall?: (appId: string) => void;
  onSearch?: (query: string) => void;
}

const categories = ['All', 'Workspace', 'Agent', 'Analytics', 'Integrations'];

export function StoreSpace({ apps, onInstall, onSearch }: StoreSpaceProps) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');

  const filteredApps = apps.filter((app) => {
    const matchesCategory =
      activeCategory === 'All' ||
      app.category.toLowerCase() === activeCategory.toLowerCase();
    const matchesSearch =
      !search ||
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero */}
      <div
        className="px-10 pb-8 pt-12"
        style={{ background: 'linear-gradient(180deg, var(--glow) 0%, transparent 100%)' }}
      >
        <h1 className="mb-1 text-2xl font-bold tracking-[-0.02em] text-[var(--text-1)]">
          Store
        </h1>
        <p className="mb-6 text-sm text-[var(--text-3)]">
          Apps, integrations, and extensions for your workspace
        </p>
        <div className="flex max-w-[480px] items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] px-4 py-3">
          <span className="text-base text-[var(--text-4)]">&#x2315;</span>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              onSearch?.(e.target.value);
            }}
            placeholder="Search apps..."
            className="flex-1 border-none bg-transparent text-sm text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-1.5 px-10 pb-5">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'rounded-lg border px-3.5 py-1.5 text-xs text-[var(--text-3)]',
              'cursor-pointer transition-all duration-100',
              activeCategory === cat
                ? 'border-[var(--accent)] bg-[var(--accent-s)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--bg-2)] hover:bg-[var(--bg-3)]'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 px-10 pb-10">
        {filteredApps.map((app) => (
          <div
            key={app.id}
            className={cn(
              'cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--bg-1)] p-[18px]',
              'transition-all duration-150',
              'hover:-translate-y-0.5 hover:border-[var(--bg-5)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)]'
            )}
          >
            <div className="mb-2.5 flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-xl"
                style={{ background: app.iconBg }}
              >
                {app.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--text-1)]">{app.name}</div>
                <div className="text-[11px] text-[var(--text-3)]">{app.author}</div>
              </div>
            </div>
            <p className="mb-3 text-xs leading-[1.5] text-[var(--text-2)]">
              {app.description}
            </p>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-[var(--text-4)]">{app.tag}</span>
              <button
                onClick={() => !app.installed && onInstall?.(app.id)}
                className={cn(
                  'rounded-md px-3.5 py-1.5 text-[11px] font-medium',
                  'transition-all duration-100',
                  app.installed
                    ? 'bg-[var(--bg-3)] text-[var(--text-3)]'
                    : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-h)]'
                )}
              >
                {app.installed ? 'Installed' : 'Install'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
