// Side-effect import: loads .env files BEFORE any other module's top-level
// code runs. Required because ESM hoists all imports — placing a function
// call between imports doesn't actually run it before later imports execute.
// No-op in production where the deploy platform injects env vars directly.
import '@kloudi-os/shared/config/auto-load';

import type { Application } from 'express';
import type { Server } from 'http';
import initializeInfrastructure from '@kloudi-os/infrastructure';
import { Logger } from '@kloudi-os/shared/logger';
import express from 'express';
import { setupMiddleware, setupErrorHandling } from './lib/middleware.js';
import { opsAuthMiddleware } from './lib/ops-auth.js';
import { setupSopRoutes } from './routes/sops.routes.js';
import { setupExecutionRoutes } from './routes/executions.routes.js';
import { setupToolRoutes } from './routes/tools.routes.js';
import { setupHealthRoutes } from './routes/health.routes.js';
import { setupAuthRoutes } from './routes/auth.routes.js';

const logger = Logger.getInstance('internal-api');
const PORT = process.env['OPS_API_PORT'] ?? process.env['PORT'] ?? 3002;

let httpServer: Server | null = null;

async function startServer(): Promise<void> {
  const app: Application = express();

  try {
    logger.info('Initializing infrastructure...');
    await initializeInfrastructure();

    logger.info('Setting up middleware...');
    await setupMiddleware(app);

    // Health check is public (Render needs it for deploy verification)
    logger.info('Setting up health routes...');
    setupHealthRoutes(app);

    // Auth routes are public (login/callback)
    logger.info('Setting up auth routes...');
    setupAuthRoutes(app);

    // Everything below requires ops auth
    logger.info('Setting up ops auth middleware...');
    app.use(opsAuthMiddleware);

    // Protected routes
    logger.info('Setting up protected routes...');
    setupSopRoutes(app);
    setupExecutionRoutes(app);
    setupToolRoutes(app);

    // Error handling (must be last)
    await setupErrorHandling(app);

    await startHTTPServer(app, PORT);

    logger.info(`Internal API started on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/ops/health`);

    setupGracefulShutdown();
  } catch (error) {
    logger.error(
      'Server startup failed',
      error instanceof Error ? error : null,
      {}
    );
    process.exit(1);
  }
}

async function startHTTPServer(
  app: Application,
  port: string | number
): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer = app.listen(port, () => {
      logger.info(`Server listening on port ${port}`);
      resolve();
    });

    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`);
        reject(new Error(`Port ${port} is already in use`));
      } else {
        logger.error('Server error', error, {});
        reject(error);
      }
    });
  });
}

function setupGracefulShutdown(): void {
  const shutdown = (signal: string): void => {
    logger.info(`${signal} received, shutting down gracefully`);

    if (httpServer) {
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGUSR2', () => shutdown('SIGUSR2'));
}

startServer();
