/**
 * Authentication Middleware
 *
 * Validates Bearer tokens on incoming requests and attaches user context
 * to req.user for downstream route handlers. Public routes (auth endpoints,
 * health check) are exempted from authentication.
 */

import { Auth } from '@kloudi/auth';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('auth-middleware');

/**
 * Routes that do not require authentication.
 * Each entry specifies an HTTP method and a path prefix.
 */
const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/refresh' },
  { method: 'GET', path: '/health' },
];

/**
 * Determine whether a given request matches a public (unauthenticated) route.
 *
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - Request path
 * @returns {boolean} True if the route is public
 */
function isPublicRoute(method, path) {
  return PUBLIC_ROUTES.some(
    (route) => route.method === method && path.startsWith(route.path)
  );
}

/**
 * Express middleware that enforces Bearer token authentication.
 *
 * For every non-public request, this middleware:
 * 1. Extracts the Bearer token from the Authorization header.
 * 2. Validates the token via Auth.validateSession.
 * 3. Attaches decoded user information to req.user.
 * 4. Passes control to the next handler, or returns 401 on failure.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function authMiddleware(req, res, next) {
  // Allow OPTIONS preflight requests through without auth
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Skip authentication for public routes
  if (isPublicRoute(req.method, req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  Auth.validateSession(token)
    .then((session) => {
      // Attach user context for downstream route handlers
      req.user = {
        userId: session.userId,
        email: session.metadata?.email,
        username: session.metadata?.username,
        workspaceId: session.metadata?.workspaceId || `ws_${session.userId}`,
        permissions: session.permissions,
        roles: session.roles,
      };
      next();
    })
    .catch((error) => {
      logger.warn('Authentication failed', {
        context: 'auth-middleware-failure',
        error: error.message,
        path: req.path,
        method: req.method,
      });
      return res.status(401).json({ error: 'Invalid or expired token' });
    });
}
