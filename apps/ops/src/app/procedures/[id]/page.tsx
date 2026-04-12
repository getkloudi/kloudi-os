'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { opsApi } from '@/lib/api';

interface Procedure {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  level: string;
  maturity: string;
  graph: unknown;
  parameters: unknown;
  workspaceId: string;
  executionCount: number;
  successCount: number;
  avgDurationMs: number | null;
  createdAt: string;
  updatedAt: string;
  executions: Array<{
    id: string;
    status: string;
    startedAt: string;
    durationMs: number | null;
  }>;
}

export default function ProcedureDetailPage() {
  const params = useParams();
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    opsApi<{ data: Procedure }>(`/ops/procedures/${params.id}`)
      .then((res) => setProcedure(res.data))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading)
    return (
      <AuthGuard>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </AuthGuard>
    );
  if (!procedure)
    return (
      <AuthGuard>
        <p className="text-sm text-destructive">Procedure not found</p>
      </AuthGuard>
    );

  return (
    <AuthGuard>
      <div className="space-y-6">
        <div>
          <Link
            href="/procedures"
            className="text-xs text-muted-foreground hover:underline"
          >
            &larr; Back to procedures
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            {procedure.name}
          </h1>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline">{procedure.level}</Badge>
            <Badge variant="secondary">{procedure.maturity}</Badge>
            <span className="text-xs text-muted-foreground">
              workspace: {procedure.workspaceId}
            </span>
          </div>
          {procedure.description && (
            <p className="text-sm text-muted-foreground mt-2">
              {procedure.description}
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Executions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {procedure.executionCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {procedure.executionCount > 0
                  ? `${Math.round((procedure.successCount / procedure.executionCount) * 100)}%`
                  : 'N/A'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Avg Duration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {procedure.avgDurationMs
                  ? `${(procedure.avgDurationMs / 1000).toFixed(1)}s`
                  : 'N/A'}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Graph (raw)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[400px]">
              {JSON.stringify(procedure.graph, null, 2)}
            </pre>
          </CardContent>
        </Card>

        {procedure.executions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Recent Executions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {procedure.executions.map((ex) => (
                  <Link
                    key={ex.id}
                    href={`/executions/${ex.id}`}
                    className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
                  >
                    <span className="font-mono text-xs">
                      {ex.id.slice(0, 12)}
                    </span>
                    <Badge
                      variant={
                        ex.status === 'completed'
                          ? 'success'
                          : ex.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {ex.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ex.startedAt).toLocaleString()}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AuthGuard>
  );
}
