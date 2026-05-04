'use client';

import { cn } from '@/lib/cn';
import { Avatar } from './primitives/avatar';
import { Badge } from './primitives/badge';
import { Button } from './primitives/button';
import { ProgressBar } from './primitives/progress-bar';
import type { ActivityPost, ExecutionStatus } from '@/types';

const dotColor: Record<string, string> = {
  completed: 'bg-[var(--green)]',
  failed: 'bg-[var(--red)]',
  running: 'bg-[var(--blue)]',
  waiting_input: 'bg-[var(--amber)]',
  pending: 'bg-[var(--bg-4)]',
};

interface FeedPostProps {
  post: ActivityPost;
  onSopClick?: (id: string) => void;
  onApprove?: (executionId: string, nodeId: string) => void;
  onAbort?: (executionId: string, nodeId: string) => void;
  onRetry?: (executionId: string) => void;
}

function actionLabel(type: ActivityPost['type']): string {
  switch (type) {
    case 'execution_run':
      return 'ran an SOP';
    case 'execution_completed':
      return 'completed a run';
    case 'execution_failed':
      return 'execution failed';
    case 'awaiting_approval':
      return 'needs your approval';
    case 'sop_edited':
      return 'updated an SOP';
  }
}

export function FeedPost({
  post,
  onSopClick,
  onApprove,
  onAbort,
  onRetry,
}: FeedPostProps) {
  const isLive =
    post.type === 'execution_run' && post.execution?.status === 'running';
  const isFailed = post.type === 'execution_failed';
  const isWaiting = post.type === 'awaiting_approval';

  return (
    <div className="border-b border-[var(--border)] py-4 last:border-b-0">
      {/* Head */}
      <div className="mb-2.5 flex items-center gap-2.5">
        <Avatar initials={post.user.initials} />
        <div>
          <span className="text-[13px] font-medium text-[var(--text-1)]">
            {post.user.username}
          </span>{' '}
          <span className="text-xs text-[var(--text-3)]">
            {actionLabel(post.type)}
          </span>
        </div>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-4)]">
          {isLive && <span className="live-dot" />}
          {post.relativeTime}
        </span>
      </div>

      {/* Card */}
      <div
        onClick={() => onSopClick?.(post.sop.id)}
        className={cn(
          'ml-10 cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--bg-1)] p-3.5 transition-all duration-[120ms]',
          'hover:border-[var(--bg-5)] hover:bg-[var(--bg-2)]',
          isFailed && 'border-[var(--red)]',
          isWaiting && 'border-[var(--amber)]'
        )}
      >
        <div className="mb-1 text-[13px] font-semibold text-[var(--text-1)]">
          {post.sop.name}
        </div>

        {post.execution && (
          <>
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] text-[var(--text-3)]">
              <Badge status={post.execution.status as ExecutionStatus} />
              <span>{post.execution.id}</span>
              {post.execution.nodes && (
                <span>
                  {
                    post.execution.nodes.filter((n) => n.status === 'completed')
                      .length
                  }
                  /{post.execution.nodes.length}
                </span>
              )}
              {post.execution.tokens != null && (
                <span>{post.execution.tokens.toLocaleString()} tk</span>
              )}
            </div>

            {/* Node list (for running/completed with nodes) */}
            {post.execution.nodes && post.execution.nodes.length > 0 && (
              <div className="mb-2 flex flex-col gap-[3px]">
                {post.execution.nodes.map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center gap-2 text-xs text-[var(--text-2)]"
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        dotColor[node.status] || 'bg-[var(--bg-4)]',
                        node.status === 'running' && 'animate-pulse'
                      )}
                    />
                    <span
                      className={cn(
                        node.status === 'running' && 'font-medium',
                        node.status === 'pending' && 'text-[var(--text-4)]'
                      )}
                    >
                      {node.label}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-[var(--text-3)]">
                      {node.status === 'running' ? (
                        <span className="text-[var(--blue)]">running</span>
                      ) : (
                        node.duration
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {post.execution.progress != null && (
              <ProgressBar
                value={post.execution.progress}
                status={post.execution.status as ExecutionStatus}
                className="mt-2"
              />
            )}
          </>
        )}

        {post.editSummary && (
          <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--text-3)]">
            <Badge variant="neutral">edited</Badge>
            <span>{post.editSummary}</span>
          </div>
        )}

        {/* Trust gate approval block */}
        {isWaiting && post.trustGate && (
          <div className="mt-2 rounded-lg bg-[var(--amber-s)] p-3 text-xs text-[var(--text-2)]">
            <div className="mb-2 italic text-[var(--amber)]">
              &ldquo;{post.trustGate.question}&rdquo;
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="primary"
                className="px-3.5 py-1.5 text-[11px]"
                onClick={(e) => {
                  e?.stopPropagation();
                  onApprove?.(post.execution!.id, post.trustGate!.id);
                }}
              >
                Continue
              </Button>
              <Button
                variant="danger"
                className="px-3.5 py-1.5 text-[11px]"
                onClick={(e) => {
                  e?.stopPropagation();
                  onAbort?.(post.execution!.id, post.trustGate!.id);
                }}
              >
                Abort
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="ml-10 mt-2.5 flex gap-4">
        {post.reactions?.map((r, i) => (
          <span
            key={i}
            className="cursor-pointer text-xs text-[var(--text-4)] transition-colors hover:text-[var(--text-2)]"
          >
            {r.emoji} {r.count}
          </span>
        ))}
        {post.replyCount != null && (
          <span className="cursor-pointer text-xs text-[var(--text-4)] transition-colors hover:text-[var(--text-2)]">
            💬 {post.replyCount > 0 ? post.replyCount : 'Reply'}
          </span>
        )}
        {isFailed && (
          <span
            onClick={() => onRetry?.(post.execution!.id)}
            className="cursor-pointer text-xs text-[var(--text-4)] transition-colors hover:text-[var(--text-2)]"
          >
            🔄 Retry
          </span>
        )}
      </div>
    </div>
  );
}
