'use client';

import { opsApi } from '@/lib/api';
import { Button } from './ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';

export function LoginPage() {
  async function handleLogin() {
    try {
      const data = await opsApi<{ url: string }>('/ops/auth/login');
      window.location.href = data.url;
    } catch (error) {
      console.error('Login failed:', error);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <Card className="w-[380px]">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">kloudi.os ops</CardTitle>
          <CardDescription>
            Internal operations dashboard. Sign in with Google.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleLogin} className="w-full">
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
