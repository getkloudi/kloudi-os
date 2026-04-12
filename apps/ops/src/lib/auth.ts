'use client';

export interface OpsUser {
  email: string;
  name: string;
  picture?: string;
}

export function getUser(): OpsUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('ops_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OpsUser;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ops_token');
}

export function setAuth(token: string, user: OpsUser): void {
  localStorage.setItem('ops_token', token);
  localStorage.setItem('ops_user', JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem('ops_token');
  localStorage.removeItem('ops_user');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
