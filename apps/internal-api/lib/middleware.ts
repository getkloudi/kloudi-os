import type { Application, Request, Response, NextFunction } from 'express';
import { Logger } from '@kloudi-os/shared/logger';
import express from 'express';

const logger = Logger.getInstance('ops-middleware');

export async function setupMiddleware(app: Application): Promise<void> {
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // CORS — ops dashboard origin only
  const allowedOrigins = (
    process.env['OPS_CORS_ORIGINS'] ?? 'http://localhost:3003'
  )
    .split(',')
    .map((o) => o.trim());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers['origin'];

    if (
      origin &&
      (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
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
      logger.info('HTTP Request', {
        context: 'ops-http-request',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: Date.now() - startTime,
      });
    });
    next();
  });

  logger.info('Ops middleware stack configured');
}

export async function setupErrorHandling(app: Application): Promise<void> {
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', error, {
      method: req.method,
      path: req.path,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message:
        process.env['NODE_ENV'] === 'development'
          ? error.message
          : 'Something went wrong',
    });
  });
}
