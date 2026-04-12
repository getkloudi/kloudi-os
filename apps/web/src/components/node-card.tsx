'use client';

import { cn } from '@/lib/cn';
import type { ExecutionNodeDetail } from '@/types';

const dotColor: Record<string, string> = {
  completed: 'bg-[var(--green)]',
  failed: 'bg-[var(--red)]',
  running: 'bg-[var(--blue)]',
  waiting_input: 'bg-[var(--amber)]',
  pending: 'bg-[var(--bg-4)]',
};

interface NodeCardProps {
  node: ExecutionNodeDetail;
  onClick?: () => void;
}

export function NodeCard({ node, onClick }: NodeCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'mb-1.5 flex cursor-pointer items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-4 py-3',
        'transition-all duration-[120ms]',
        'hover:translate-x-0.5 hover:border-[var(--bg-5)]'
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            dotColor[node.status] || 'bg-[var(--bg-4)]',
            node.status === 'running' && 'animate-pulse'
          )}
        />
        <div>
          <div className="text-[13px] font-medium text-[var(--text-1)]">
            {node.label}
          </div>
          <div className="font-mono text-[11px] text-[var(--text-3)]">
            {node.type}
            {node.output && ` → ${node.output}`}
          </div>
        </div>
      </div>
      <div className="flex gap-3 font-mono text-[11px] text-[var(--text-3)]">
        {node.tokens != null && <span>{node.tokens.toLocaleString()} tk</span>}
        {node.duration && <span>{node.duration}</span>}
      </div>
    </div>
  );
}
