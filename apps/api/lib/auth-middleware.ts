/**
 * Authentication Middleware
 *
 * Validates Bearer tokens on incoming requests and attaches user context
 * to req.user for downstream route handlers. Public routes (auth endpoints,
 * health check) are exempted from authentication.
 */

import type { Request, Response, NextFunction } from 'express';
import { Auth } from '@kloudi/auth';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('auth-middleware');

interface PublicRoute {
  method: string;
  path: string;
}

interface UserContext {
  userId: string;
  email: string | undefined;
  username: string | undefined;
  workspaceId: string;
  permissions: string[] | undefined;
  roles: string[] | undefined;
}

// Extend Express Request to include user property
declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
    }
  }
}

/**
 * Routes that do not require authentication.
 * Each entry specifies an HTTP method and a path prefix.
 */
const PUBLIC_ROUTES: PublicRoute[] = [
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/refresh' },
  { method: 'GET', path: '/health' },
];

/**
 * Determine whether a given request matches a public (unauthenticated) route.
 *
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path
 * @returns True if the route is public
 */
function isPublicRoute(method: string, path: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => route.method === method && path.startsWith(route.path)
  );
}

interface SessionMetadata {
  email?: string;
  username?: string;
  workspaceId?: string;
}

interface ValidatedSession {
  userId: string;
  metadata?: SessionMetadata;
  permissions?: string[];
  roles?: string[];
}

/**
 * Express middleware that enforces Bearer token authentication.
 *
 * For every non-public request, this middleware:
 * 1. Extracts the Bearer token from the Authorization header.
 * 2. Validates the token via Auth.validateSession.
 * 3. Attaches decoded user information to req.user.
 * 4. Passes control to the next handler, or returns 401 on failure.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Allow OPTIONS preflight requests through without auth
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  // Skip authentication for public routes
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

  (Auth.validateSession(token) as Promise<ValidatedSession>)
    .then((session: ValidatedSession) => {
      // Attach user context for downstream route handlers
      req.user = {
        userId: session.userId,
        email: session.metadata?.email,
        username: session.metadata?.username,
        workspaceId: session.metadata?.workspaceId ?? `ws_${session.userId}`,
        permissions: session.permissions,
        roles: session.roles,
      };
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
