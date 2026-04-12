'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { opsApi } from '@/lib/api';

interface Procedure {
  id: string;
  name: string;
  slug: string;
  level: string;
  maturity: string;
  workspaceId: string;
  executionCount: number;
  updatedAt: string;
  _count?: { executions: number };
}

export default function ProceduresPage() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    opsApi<{ data: Procedure[] }>('/ops/procedures')
      .then((res) => setProcedures(res.data))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('Delete this procedure and all its executions?')) return;
    await opsApi(`/ops/procedures/${id}`, { method: 'DELETE' });
    setProcedures((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <AuthGuard>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Procedures
            </h1>
            <p className="text-sm text-muted-foreground">
              All SOPs across all workspaces
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : procedures.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No procedures found. Seed some via the API.
          </p>
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Slug</th>
                  <th className="px-4 py-3 text-left font-medium">Level</th>
                  <th className="px-4 py-3 text-left font-medium">Maturity</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Executions
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Updated</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {procedures.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="px-4 py-3">
                      <Link
                        href={`/procedures/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {p.slug}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{p.level}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{p.maturity}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {p._count?.executions ?? p.executionCount}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(p.id)}
                      >
                        Delete
                      </Button>
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
