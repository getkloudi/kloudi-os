'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { opsApi } from '@/lib/api';

interface Integration {
  name: string;
  configured: boolean;
}

export default function ToolsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    opsApi<{ data: Integration[]; note: string }>('/ops/tools')
      .then((res) => { setIntegrations(res.data); setNote(res.note); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthGuard>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tools & Integrations</h1>
          <p className="text-sm text-muted-foreground">Registered tools and integration status</p>
        </div>

        {note && (
          <div className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">{note}</div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {integrations.map((i) => (
              <Card key={i.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium capitalize">{i.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant={i.configured ? 'success' : 'destructive'}>
                    {i.configured ? 'Configured' : 'Not configured'}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
