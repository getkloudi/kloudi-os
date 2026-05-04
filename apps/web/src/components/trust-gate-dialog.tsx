'use client';

import { Button } from './primitives/button';
import { Badge } from './primitives/badge';
import type { TrustGateEvent } from '@/types';

interface TrustGateDialogProps {
  event: TrustGateEvent | null;
  onApprove: (executionId: string, nodeId: string) => void;
  onAbort: (executionId: string, nodeId: string) => void;
}

export function TrustGateDialog({
  event,
  onApprove,
  onAbort,
}: TrustGateDialogProps) {
  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-lg border border-[var(--amber)] bg-[var(--bg-1)] shadow-2xl">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-6 py-4">
          <div className="mb-1 flex items-center gap-2">
            <Badge status="waiting_input" />
            <span className="font-mono text-[11px] text-[var(--text-3)]">
              cycle guard · visit #{event.visitCount}
            </span>
          </div>
          <h2 className="text-[15px] font-semibold text-[var(--text-1)]">
            Approval Required
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <div className="mb-3 font-mono text-xs text-[var(--text-3)]">
            {event.sopName} / {event.nodeLabel}
          </div>
          <div className="rounded-lg bg-[var(--amber-s)] p-4">
            <p className="italic text-[var(--amber)]">
              &ldquo;{event.question}&rdquo;
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button
            variant="danger"
            onClick={() => onAbort(event.executionId, event.nodeId)}
          >
            Abort
          </Button>
          <Button
            variant="primary"
            onClick={() => onApprove(event.executionId, event.nodeId)}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
