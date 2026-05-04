'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { opsApi } from '@/lib/api';
import { setAuth } from '@/lib/auth';

function CallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('Missing authorization code');
      return;
    }

    opsApi<{
      access_token: string;
      expires_in: number;
      user: { email: string; name: string; picture?: string };
    }>('/ops/auth/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
      .then((data) => {
        setAuth(data.access_token, data.user);
        router.push('/');
      })
      .catch((e: Error) => setError(e.message));
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">Authentication failed</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <a href="/" className="text-sm underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-sm text-muted-foreground">Signing in...</div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
