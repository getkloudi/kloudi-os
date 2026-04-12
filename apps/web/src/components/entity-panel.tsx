'use client';

import { useState } from 'react';
import {
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  BookOpen,
  Zap,
  Target,
  Folder,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface EntityData {
  id: string;
  name: string;
  type: 'guide' | 'skill' | 'task' | 'project';
  description?: string;
  content?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

export interface ExecutionLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

interface EntityPanelProps {
  entity?: EntityData;
  onRun?: (id: string) => void;
  isRunning?: boolean;
  logs?: ExecutionLog[];
}

const typeIcons = {
  guide: BookOpen,
  skill: Zap,
  task: Target,
  project: Folder,
};

const typeLabels = {
  guide: 'Guide',
  skill: 'Skill',
  task: 'Task',
  project: 'Project',
};

const statusConfig = {
  pending: { icon: Clock, color: 'text-muted-foreground', label: 'Pending' },
  running: {
    icon: Loader2,
    color: 'text-blue-400',
    label: 'Running',
    animate: true,
  },
  completed: { icon: CheckCircle, color: 'text-green-400', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-400', label: 'Failed' },
};

export function EntityPanel({
  entity,
  onRun,
  isRunning = false,
  logs = [],
}: EntityPanelProps) {
  const [showLogs, setShowLogs] = useState(false);

  if (!entity) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Select a procedure to view details</p>
      </div>
    );
  }

  const TypeIcon = typeIcons[entity.type];
  const status = entity.status || 'pending';
  const StatusIcon = statusConfig[status].icon;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <TypeIcon className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">
                {entity.name}
              </h1>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {typeLabels[entity.type]}
              </span>
            </div>
            {entity.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {entity.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex items-center gap-1.5',
              statusConfig[status].color
            )}
          >
            <StatusIcon
              className={cn(
                'h-4 w-4',
                (statusConfig[status] as { animate?: boolean }).animate &&
                  'animate-spin'
              )}
            />
            <span className="text-sm">{statusConfig[status].label}</span>
          </div>
          {onRun && (
            <button
              onClick={() => onRun(entity.id)}
              disabled={isRunning}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                'bg-blue-600 text-white hover:bg-blue-700',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {entity.content && (
          <div className="prose prose-invert max-w-none">
            <pre className="rounded-lg bg-muted p-4 text-sm text-foreground">
              {entity.content}
            </pre>
          </div>
        )}
      </div>

      {/* Execution Logs */}
      {logs.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex w-full items-center justify-between px-6 py-3 text-sm font-medium text-foreground hover:bg-muted"
          >
            <span>Execution Logs ({logs.length})</span>
            <span>{showLogs ? '−' : '+'}</span>
          </button>
          {showLogs && (
            <div className="max-h-48 overflow-y-auto border-t border-border bg-muted/50 p-4">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={cn(
                    'font-mono text-xs',
                    log.level === 'error' && 'text-red-400',
                    log.level === 'warn' && 'text-yellow-400',
                    log.level === 'info' && 'text-muted-foreground'
                  )}
                >
                  <span className="text-muted-foreground">
                    [{log.timestamp}]
                  </span>{' '}
                  <span className="uppercase">[{log.level}]</span> {log.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EntityPanel;
