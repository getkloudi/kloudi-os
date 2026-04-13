'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { opsApi } from '@/lib/api';

interface Execution {
  id: string;
  status: string;
  sopId: string;
  workspaceId: string;
  tokensUsed: number;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  sop?: { id: string; name: string; slug: string };
  _count?: { executionNodes: number };
}

const statusVariant = (s: string) => {
  switch (s) {
    case 'completed':
      return 'success' as const;
    case 'failed':
    case 'cancelled':
      return 'destructive' as const;
    case 'running':
    case 'waiting_input':
      return 'warning' as const;
    default:
      return 'secondary' as const;
  }
};

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = statusFilter ? `?status=${statusFilter}` : '';
    opsApi<{ data: Execution[]; total: number }>(`/ops/executions${params}`)
      .then((res) => {
        setExecutions(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleKill(id: string) {
    if (!confirm('Kill this execution?')) return;
    await opsApi(`/ops/executions/${id}/kill`, { method: 'POST' });
    load();
  }

  async function handleBulkCancel() {
    if (!confirm('Cancel all executions stuck for >60 minutes?')) return;
    const result = await opsApi<{ cancelled: number }>(
      '/ops/executions/bulk-cancel-stuck',
      {
        method: 'POST',
        body: JSON.stringify({ thresholdMinutes: 60 }),
      }
    );
    alert(`Cancelled ${result.cancelled} stuck executions`);
    load();
  }

  const statuses = [
    '',
    'pending',
    'running',
    'waiting_input',
    'completed',
    'failed',
    'cancelled',
  ];

  return (
    <AuthGuard>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Executions
            </h1>
            <p className="text-sm text-muted-foreground">
              {total} total executions
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={handleBulkCancel}>
            Cancel Stuck
          </Button>
        </div>

        <div className="flex gap-1">
          {statuses.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s || 'All'}
            </Button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">ID</th>
                  <th className="px-4 py-3 text-left font-medium">SOP</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Nodes</th>
                  <th className="px-4 py-3 text-left font-medium">Tokens</th>
                  <th className="px-4 py-3 text-left font-medium">Started</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((ex) => (
                  <tr key={ex.id} className="border-b">
                    <td className="px-4 py-3">
                      <Link
                        href={`/executions/${ex.id}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {ex.id.slice(0, 12)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {ex.sop ? (
                        <Link
                          href={`/sops/${ex.sop.id}`}
                          className="hover:underline"
                        >
                          {ex.sop.name}
                        </Link>
                      ) : (
                        ex.sopId.slice(0, 12)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(ex.status)}>
                        {ex.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {ex._count?.executionNodes ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {ex.tokensUsed.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(ex.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {['running', 'waiting_input', 'pending'].includes(
                        ex.status
                      ) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleKill(ex.id)}
                        >
                          Kill
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
