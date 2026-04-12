'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { opsApi } from '@/lib/api';

interface HealthData {
  status: string;
  database: {
    status: string;
    database: string;
    activeTransactions: number;
    uptime?: number;
  };
  stats: {
    procedures: number;
    executions: number;
    running: number;
    users: number;
  };
  uptime: number;
  timestamp: string;
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    opsApi<HealthData>('/ops/health')
      .then(setHealth)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AuthGuard>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Database Health
            </h1>
            <p className="text-sm text-muted-foreground">
              Live health check against the database
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {health && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge
                    variant={
                      health.status === 'healthy' ? 'success' : 'destructive'
                    }
                    className="text-base"
                  >
                    {health.status}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Database Type
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold">
                    {health.database.database}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Active Transactions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold">
                    {health.database.activeTransactions}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    API Uptime
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold">
                    {Math.floor(health.uptime / 3600)}h{' '}
                    {Math.floor((health.uptime % 3600) / 60)}m
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Table Counts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Procedures</p>
                    <p className="text-lg font-bold">
                      {health.stats.procedures}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Executions</p>
                    <p className="text-lg font-bold">
                      {health.stats.executions}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Running</p>
                    <p className="text-lg font-bold">{health.stats.running}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Users</p>
                    <p className="text-lg font-bold">{health.stats.users}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
              Last checked: {health.timestamp}
            </p>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
