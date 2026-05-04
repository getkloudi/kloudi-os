'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { opsApi } from '@/lib/api';

interface ExecutionNode {
  id: string;
  nodeId: string;
  status: string;
  attemptNumber: number;
  input: unknown;
  output: unknown;
  decisionTrace: unknown;
  tokensUsed: number;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface Execution {
  id: string;
  status: string;
  sopId: string;
  parameters: unknown;
  variables: unknown;
  currentNodeId: string | null;
  result: unknown;
  error: string | null;
  tokensUsed: number;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  workspaceId: string;
  sop?: { id: string; name: string; slug: string };
  executionNodes: ExecutionNode[];
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

export default function ExecutionDetailPage() {
  const params = useParams();
  const [execution, setExecution] = useState<Execution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    opsApi<{ data: Execution }>(`/ops/executions/${params.id}`)
      .then((res) => setExecution(res.data))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleKill() {
    if (!confirm('Kill this execution?')) return;
    const res = await opsApi<{ data: Execution }>(
      `/ops/executions/${params.id}/kill`,
      { method: 'POST' }
    );
    setExecution(res.data);
  }

  if (loading)
    return (
      <AuthGuard>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </AuthGuard>
    );
  if (!execution)
    return (
      <AuthGuard>
        <p className="text-sm text-destructive">Execution not found</p>
      </AuthGuard>
    );

  return (
    <AuthGuard>
      <div className="space-y-6">
        <div>
          <Link
            href="/executions"
            className="text-xs text-muted-foreground hover:underline"
          >
            &larr; Back to executions
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold tracking-tight font-mono">
              {execution.id.slice(0, 16)}
            </h1>
            <Badge variant={statusVariant(execution.status)}>
              {execution.status}
            </Badge>
            {['running', 'waiting_input', 'pending'].includes(
              execution.status
            ) && (
              <Button variant="destructive" size="sm" onClick={handleKill}>
                Kill
              </Button>
            )}
          </div>
          {execution.sop && (
            <Link
              href={`/sops/${execution.sop.id}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              {execution.sop.name}
            </Link>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tokens Used</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {execution.tokensUsed.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {execution.durationMs
                  ? `${(execution.durationMs / 1000).toFixed(1)}s`
                  : 'In progress'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Nodes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {execution.executionNodes.length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Started</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                {new Date(execution.startedAt).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {execution.error && (
          <Card className="border-destructive/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-destructive">
                Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-destructive/10 p-3 rounded-md whitespace-pre-wrap">
                {execution.error}
              </pre>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Execution Trace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {execution.executionNodes.map((node) => (
              <div key={node.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium">
                      {node.nodeId}
                    </span>
                    <Badge
                      variant={statusVariant(node.status)}
                      className="text-xs"
                    >
                      {node.status}
                    </Badge>
                    {node.attemptNumber > 1 && (
                      <span className="text-xs text-muted-foreground">
                        attempt #{node.attemptNumber}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {node.tokensUsed > 0 && (
                      <span>{node.tokensUsed} tokens</span>
                    )}
                    {node.durationMs && (
                      <span>{(node.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                </div>

                {node.output != null ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Output
                    </summary>
                    <pre className="mt-1 bg-muted p-2 rounded-md overflow-auto max-h-[200px]">
                      {JSON.stringify(node.output, null, 2)}
                    </pre>
                  </details>
                ) : null}

                {node.decisionTrace != null ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Decision Trace
                    </summary>
                    <pre className="mt-1 bg-muted p-2 rounded-md overflow-auto max-h-[200px]">
                      {JSON.stringify(node.decisionTrace, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Variables (accumulated)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[300px]">
              {JSON.stringify(execution.variables, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}
