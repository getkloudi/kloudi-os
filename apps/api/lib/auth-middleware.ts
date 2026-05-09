import type { Request, Response, NextFunction } from 'express';
import { Logger } from '@kloudi-os/shared/logger';

const logger = Logger.getInstance('auth-middleware');

const AUTH_SERVICE_URL =
  process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:3004';

interface PublicRoute {
  method: string;
  path: string;
}

interface UserContext {
  userId: string;
  email: string | undefined;
  username: string | undefined;
  organizationId: string;
  permissions: string[] | undefined;
  roles: string[] | undefined;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
    }
  }
}

const PUBLIC_ROUTES: PublicRoute[] = [
  { method: 'POST', path: '/api/auth/' },
  { method: 'GET', path: '/api/auth/' },
  { method: 'GET', path: '/health' },
];

function isPublicRoute(method: string, path: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => route.method === method && path.startsWith(route.path)
  );
}

interface BetterAuthSession {
  user: { id: string; email: string; name: string };
  session: { id: string; activeOrganizationId?: string };
}

async function validateBearerToken(token: string): Promise<UserContext> {
  const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/get-session`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error('Invalid session');
  }

  const session = (await response.json()) as BetterAuthSession;

  return {
    userId: session.user.id,
    email: session.user.email,
    username: session.user.name,
    organizationId:
      session.session.activeOrganizationId ?? `personal_${session.user.id}`,
    permissions: undefined,
    roles: undefined,
  };
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  if (isPublicRoute(req.method, req.path)) {
    next();
    return;
  }

  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  validateBearerToken(token)
    .then((userContext) => {
      req.user = userContext;
      next();
    })
    .catch((error: Error) => {
      logger.warn('Authentication failed', {
        context: 'auth-middleware-failure',
        error: error.message,
        path: req.path,
        method: req.method,
      });
      res.status(401).json({ error: 'Invalid or expired token' });
    });
}
