'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Badge } from '../primitives/badge';
import { Button } from '../primitives/button';
import { NodeCard } from '../node-card';
import { AgentPanel } from '../agent-panel';
import type { ExecutionDetail, AgentMessage, ExecutionStatus } from '@/types';

type Mode = 'edit' | 'view';

interface EditorSpaceProps {
  execution: ExecutionDetail | null;
  agentMessages: AgentMessage[];
  onRun?: (procedureId: string) => void;
  onBrowseNavigate?: () => void;
  onAgentCommand?: (command: string) => void;
}

export function EditorSpace({
  execution,
  agentMessages,
  onRun,
  onBrowseNavigate,
  onAgentCommand,
}: EditorSpaceProps) {
  const [mode, setMode] = useState<Mode>('view');
  const [agentCollapsed, setAgentCollapsed] = useState(false);

  if (!execution) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-3)]">
        Select a procedure or execution to view
      </div>
    );
  }

  const pathParts = execution.procedureSlug.split('/');

  return (
    <div className="flex flex-1 flex-row overflow-hidden">
      {/* Main editor area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-1)] px-5 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
              {pathParts.map((part, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-[var(--text-4)]">/</span>}
                  <span
                    onClick={i < pathParts.length - 1 ? onBrowseNavigate : undefined}
                    className={cn(
                      i < pathParts.length - 1 && 'cursor-pointer hover:text-[var(--text-2)]',
                      i === pathParts.length - 1 && 'font-medium text-[var(--text-1)]'
                    )}
                  >
                    {part}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-md border border-[var(--border)]">
              <button
                onClick={() => setMode('edit')}
                className={cn(
                  'border-none px-3 py-1 text-[11px] text-[var(--text-3)]',
                  'cursor-pointer transition-all duration-100',
                  mode === 'edit' ? 'bg-[var(--accent-s)] text-[var(--accent)]' : 'bg-transparent hover:bg-[var(--bg-3)]'
                )}
              >
                Edit
              </button>
              <button
                onClick={() => setMode('view')}
                className={cn(
                  'border-none px-3 py-1 text-[11px] text-[var(--text-3)]',
                  'cursor-pointer transition-all duration-100',
                  mode === 'view' ? 'bg-[var(--accent-s)] text-[var(--accent)]' : 'bg-transparent hover:bg-[var(--bg-3)]'
                )}
              >
                View
              </button>
            </div>
            <Button
              variant="primary"
              className="py-1.5 text-[11px]"
              onClick={() => onRun?.(execution.procedureId)}
            >
              ▶ Run
            </Button>
            <button
              onClick={() => setAgentCollapsed(!agentCollapsed)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border-none bg-[var(--bg-3)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-4)]"
            >
              ⌨
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto bg-[var(--bg-0)] px-12 py-8">
          <h1 className="mb-1.5 text-[26px] font-bold tracking-[-0.03em] text-[var(--text-1)]">
            {execution.procedureName}
          </h1>
          <div className="mb-6 flex items-center gap-2.5 font-mono text-xs text-[var(--text-3)]">
            <Badge status={execution.status as ExecutionStatus} />
            <span>{execution.procedureSlug}</span>
            <span>·</span>
            <span>{execution.id}</span>
          </div>

          {execution.procedureDescription && (
            <p className="mb-5 max-w-[600px] text-[15px] leading-[1.7] text-[var(--text-2)]">
              {execution.procedureDescription}
            </p>
          )}

          {/* Execution Graph */}
          <div className="mb-2 mt-7 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]">
            execution graph
          </div>
          {execution.nodes.map((node) => (
            <NodeCard key={node.id} node={node} />
          ))}

          {/* Stats Grid */}
          <div className="mt-7 grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-3.5">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]">
                duration
              </div>
              <div className="font-mono text-xl font-semibold text-[var(--text-1)]">
                {execution.stats.duration}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-3.5">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]">
                tokens
              </div>
              <div className="font-mono text-xl font-semibold text-[var(--text-1)]">
                {execution.stats.tokens.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-3.5">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]">
                nodes
              </div>
              <div className="font-mono text-xl font-semibold text-[var(--text-1)]">
                {execution.stats.nodesCompleted}/{execution.stats.nodesTotal}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-3.5">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]">
                status
              </div>
              <div
                className="font-mono text-xl font-semibold"
                style={{
                  color:
                    execution.status === 'completed'
                      ? 'var(--green)'
                      : execution.status === 'failed'
                        ? 'var(--red)'
                        : execution.status === 'running'
                          ? 'var(--blue)'
                          : 'var(--text-1)',
                }}
              >
                {execution.status === 'completed' ? 'done' : execution.status}
              </div>
            </div>
          </div>
        </div>

        {/* Run Strip */}
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--bg-1)] px-5 py-2.5">
          <div className="flex items-center gap-2.5 text-xs text-[var(--text-3)]">
            <span className="font-mono text-[11px]">{execution.id}</span>
            <Badge status={execution.status as ExecutionStatus} />
            <span className="font-mono text-[11px]">
              {execution.stats.duration} · {execution.stats.tokens.toLocaleString()} tk
            </span>
          </div>
          <Button
            variant="primary"
            className="py-1.5 text-[11px]"
            onClick={() => onRun?.(execution.procedureId)}
          >
            ▶ Run
          </Button>
        </div>
      </div>

      {/* Agent Panel */}
      <AgentPanel
        messages={agentMessages}
        collapsed={agentCollapsed}
        onToggle={() => setAgentCollapsed(!agentCollapsed)}
        onCommand={onAgentCommand}
      />
    </div>
  );
}
