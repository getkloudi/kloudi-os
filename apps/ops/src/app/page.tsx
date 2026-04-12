'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { opsApi } from '@/lib/api';

interface HealthData {
  status: string;
  stats: {
    procedures: number;
    executions: number;
    running: number;
    users: number;
  };
  uptime: number;
}

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    opsApi<HealthData>('/ops/health')
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <AuthGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            kloudi.os internal operations
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {health && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Procedures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {health.stats.procedures}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Executions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {health.stats.executions}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Running Now
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{health.stats.running}</div>
                {health.stats.running > 0 && (
                  <Badge variant="warning" className="mt-1">
                    active
                  </Badge>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">DB Status</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge
                  variant={
                    health.status === 'healthy' ? 'success' : 'destructive'
                  }
                >
                  {health.status}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Uptime: {Math.floor(health.uptime / 60)}m
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {!health && !error && (
          <div className="text-sm text-muted-foreground">
            Loading dashboard...
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
