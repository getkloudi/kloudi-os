'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { ProgressBar } from '../primitives/progress-bar';
import { FeedPost } from '../feed-post';
import type { ActivityPost, ExecutionStatus } from '@/types';

type FeedFilter = 'all' | 'mine' | 'failed' | 'approvals';

interface HomeSpaceProps {
  greeting: string;
  summary: string;
  quickAccess: QuickAccessItem[];
  posts: ActivityPost[];
  currentUser?: string;
  onSearch?: (query: string) => void;
  onQuickAccessClick?: (id: string) => void;
  onSopClick?: (id: string) => void;
  onApprove?: (executionId: string, nodeId: string) => void;
  onAbort?: (executionId: string, nodeId: string) => void;
  onRetry?: (executionId: string) => void;
}

export interface QuickAccessItem {
  id: string;
  name: string;
  icon: string;
  status: ExecutionStatus;
  meta: string;
  progress: number;
}

export function HomeSpace({
  greeting,
  summary,
  quickAccess,
  posts,
  currentUser,
  onSearch,
  onQuickAccessClick,
  onSopClick,
  onApprove,
  onAbort,
  onRetry,
}: HomeSpaceProps) {
  const [filter, setFilter] = useState<FeedFilter>('all');

  const filteredPosts = posts.filter((post) => {
    switch (filter) {
      case 'mine':
        return post.user.username === currentUser;
      case 'failed':
        return post.type === 'execution_failed';
      case 'approvals':
        return post.type === 'awaiting_approval';
      default:
        return true;
    }
  });

  const filters: { id: FeedFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'mine', label: 'Mine' },
    { id: 'failed', label: 'Failed' },
    { id: 'approvals', label: 'Approvals' },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero */}
      <div
        className="px-10 pb-8 pt-12"
        style={{
          background:
            'linear-gradient(180deg, var(--glow) 0%, transparent 100%)',
        }}
      >
        <h1 className="mb-1 text-[28px] font-bold tracking-[-0.03em] text-[var(--text-1)]">
          {greeting}
        </h1>
        <p className="mb-6 text-sm text-[var(--text-3)]">{summary}</p>
        <div
          className={cn(
            'flex max-w-[560px] items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] px-[18px] py-3.5',
            'transition-all duration-150',
            'focus-within:border-[var(--accent)] focus-within:bg-[var(--bg-1)] focus-within:shadow-[0_0_0_3px_var(--accent-s)]'
          )}
        >
          <span className="text-[var(--text-4)]">&#x2315;</span>
          <input
            placeholder="Search SOPs, runs, people..."
            onChange={(e) => onSearch?.(e.target.value)}
            className="flex-1 border-none bg-transparent text-[15px] text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
          />
          <span className="rounded bg-[var(--bg-3)] px-[7px] py-[3px] font-mono text-[10px] text-[var(--text-4)]">
            ⌘K
          </span>
        </div>
      </div>

      {/* Quick Access Row */}
      {quickAccess.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto px-10 pb-7">
          {quickAccess.map((item) => (
            <div
              key={item.id}
              onClick={() => onQuickAccessClick?.(item.id)}
              className={cn(
                'min-w-[180px] shrink-0 cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--bg-1)] p-3.5',
                'transition-all duration-150',
                'hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)]'
              )}
            >
              <div className="mb-[3px] text-[13px] font-semibold text-[var(--text-1)]">
                {item.icon} {item.name}
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-3)]">
                {item.status === 'running' && <span className="live-dot" />}
                {item.meta}
              </div>
              <ProgressBar
                value={item.progress}
                status={item.status}
                className="mt-2"
              />
            </div>
          ))}
        </div>
      )}

      {/* Feed */}
      <div className="max-w-[640px] px-10 pb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-2)]">
            Activity
          </h2>
          <div className="flex gap-1">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'rounded-md border-none px-2.5 py-1 text-[11px] text-[var(--text-3)]',
                  'cursor-pointer transition-all duration-100',
                  filter === f.id
                    ? 'bg-[var(--accent-s)] text-[var(--accent)]'
                    : 'bg-transparent hover:bg-[var(--bg-3)]'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredPosts.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-3)]">
            No activity to show
          </p>
        ) : (
          filteredPosts.map((post) => (
            <FeedPost
              key={post.id}
              post={post}
              onSopClick={onSopClick}
              onApprove={onApprove}
              onAbort={onAbort}
              onRetry={onRetry}
            />
          ))
        )}
      </div>
    </div>
  );
}
