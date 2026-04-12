import type { Request, Response, NextFunction } from 'express';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('ops-auth');

/**
 * Email allowlist for ops dashboard access.
 * Set OPS_ALLOWED_EMAILS env var as comma-separated list.
 */
function getAllowedEmails(): string[] {
  const raw = process.env['OPS_ALLOWED_EMAILS'] ?? '';
  return raw.split(',').map(e => e.trim()).filter(Boolean);
}

/**
 * Verify a Google OAuth access token by calling Google's userinfo endpoint.
 * Returns the user's email if valid, null otherwise.
 */
async function verifyGoogleToken(accessToken: string): Promise<{ email: string; name: string } | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json() as { email?: string; name?: string };
    if (!data.email) {
      return null;
    }

    return { email: data.email, name: data.name ?? data.email };
  } catch {
    return null;
  }
}

export interface OpsUser {
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      opsUser?: OpsUser;
    }
  }
}

/**
 * Ops auth middleware — validates Bearer token against Google OAuth
 * and checks email against allowlist.
 */
export async function opsAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Skip preflight
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const user = await verifyGoogleToken(token);

  if (!user) {
    res.status(401).json({ error: 'Invalid or expired Google token' });
    return;
  }

  const allowed = getAllowedEmails();
  if (allowed.length > 0 && !allowed.includes(user.email)) {
    logger.warn('Unauthorized ops access attempt', { email: user.email });
    res.status(403).json({ error: 'Email not in ops allowlist' });
    return;
  }

  req.opsUser = user;
  next();
}
