import type { Application, Request, Response, NextFunction } from 'express';
import { Logger } from '@kloudi/shared/logger';
import { Config } from '@kloudi/shared/config';
import express from 'express';

const logger = Logger.getInstance('middleware');

/**
 * Get allowed CORS origins from configuration system
 * Defaults to secure settings for production
 */
function getAllowedOrigins(): string[] {
  const corsConfig = Config.getCorsConfig();
  const corsOrigins = corsConfig.allowedOrigins;

  if (typeof corsOrigins === 'string') {
    return corsOrigins.split(',').map((origin: string) => origin.trim());
  }

  // Secure defaults based on environment
  const environment = Config.get('NODE_ENV', 'development');

  if (environment === 'development') {
    // Development: Allow common development origins + wildcard for convenience
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173', // Vite default
      'http://localhost:8080', // Webpack dev server
      '*', // Wildcard for development convenience
    ];
  }

  if (environment === 'test') {
    // Test: Minimal origins for testing
    return ['http://localhost:3000'];
  }

  // Production: No wildcard, must be explicitly configured
  logger.warn(
    '⚠️  CORS_ALLOWED_ORIGINS not configured for production. Defaulting to localhost only.',
    {
      context: 'cors-security-warning',
      environment,
      recommendation:
        'Set CORS_ALLOWED_ORIGINS environment variable or configure in YAML',
    }
  );

  return ['http://localhost:3000']; // Safe production default
}

/**
 * Check if an origin is allowed based on CORS configuration
 */
function isOriginAllowed(origin: string | string[] | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return false; // No origin header (same-origin requests)
  }

  // Handle array origins (multiple values from header)
  const originString = Array.isArray(origin) ? origin[0] : origin;
  if (!originString) {
    return false;
  }

  return allowedOrigins.includes(originString) || allowedOrigins.includes('*');
}

/**
 * Setup standard middleware stack
 *
 * @param app - Express application instance
 */
export async function setupMiddleware(app: Application): Promise<void> {
  try {
    logger.info('🔧 Setting up middleware stack', {
      context: 'middleware-setup-start',
    });

    // Use Express built-in JSON parsing (not custom implementation)
    app.use(express.json({ limit: '10mb' }));

    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Basic security headers
    app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });

    // Configurable CORS with security defaults
    app.use((req: Request, res: Response, next: NextFunction) => {
      const allowedOrigins = getAllowedOrigins();
      const origin = req.headers['origin'];

      // Set CORS headers based on configuration
      if (isOriginAllowed(origin, allowedOrigins)) {
        res.setHeader(
          'Access-Control-Allow-Origin',
          origin ?? allowedOrigins[0] ?? '*'
        );
      } else if (allowedOrigins.includes('*')) {
        // Only allow wildcard in development
        res.setHeader('Access-Control-Allow-Origin', '*');
      }

      const corsConfig = Config.getCorsConfig();
      const allowedMethods = typeof corsConfig.allowedMethods === 'string'
        ? corsConfig.allowedMethods
        : 'GET, POST, PUT, DELETE, OPTIONS';
      const allowedHeaders = typeof corsConfig.allowedHeaders === 'string'
        ? corsConfig.allowedHeaders
        : 'Content-Type, Authorization';
      res.setHeader('Access-Control-Allow-Methods', allowedMethods);
      res.setHeader('Access-Control-Allow-Headers', allowedHeaders);
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }

      next();
    });

    // Request logging
    app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;

        logger.info('HTTP Request', {
          context: 'http-request',
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          userAgent: req.headers['user-agent'],
          ip: req.ip ?? req.socket?.remoteAddress,
        });
      });

      next();
    });

    logger.info('✅ Middleware stack setup completed', {
      context: 'middleware-setup-complete',
      corsOrigins: getAllowedOrigins(),
    });
  } catch (error) {
    logger.error('❌ Middleware setup failed', error instanceof Error ? error : null, {
      context: 'middleware-setup-error',
    });
    throw error;
  }
}

/**
 * Setup error handling middleware (must be called AFTER all routes)
 *
 * @param app - Express application instance
 */
export async function setupErrorHandling(app: Application): Promise<void> {
  // 404 handler
  app.use((req: Request, res: Response) => {
    logger.warn('Route not found', {
      context: 'route-not-found',
      method: req.method,
      path: req.path,
    });

    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString(),
    });
  });

  // Global error handler
  // eslint-disable-next-line no-unused-vars
  app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error in request', error, {
      context: 'unhandled-request-error',
      method: req.method,
      path: req.path,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message:
        process.env['NODE_ENV'] === 'development'
          ? error.message
          : 'Something went wrong',
      timestamp: new Date().toISOString(),
    });
  });

  logger.info('✅ Error handling middleware setup completed', {
    context: 'error-handling-setup-complete',
  });
}
