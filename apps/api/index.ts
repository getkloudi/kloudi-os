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
import { createHealthEndpoint } from './lib/health-endpoint.js';
import { setupErrorHandling, setupMiddleware } from './lib/middleware.js';
import { authMiddleware } from './lib/auth-middleware.js';
import { loadAllRoutes } from './lib/route-loader.js';
import { setupWebSocket } from './lib/websocket.js';
import { ToolRegistry } from '@kloudi-os/tools';
import { registerAllTools } from '@kloudi-os/tools/startup';

const logger = Logger.getInstance('api-server');
const PORT = process.env['PORT'] ?? 3001;
const ENVIRONMENT = process.env['NODE_ENV'] ?? 'development';

let httpServer: Server | null = null;

async function startServer(): Promise<void> {
  const app: Application = express();

  try {
    // Initialize infrastructure FIRST
    logger.info('🔧 Initializing infrastructure...');
    await initializeInfrastructure();

    // Setup middleware
    logger.info('🔧 Setting up middleware...');
    await setupMiddleware(app);

    // Setup authentication middleware (after base middleware, before routes)
    logger.info('🔐 Setting up authentication middleware...');
    app.use(authMiddleware);

    // Setup health endpoint
    logger.info('🏥 Setting up health endpoint...');
    app.get(
      '/health',
      createHealthEndpoint({ port: PORT, environment: ENVIRONMENT })
    );

    // Register tools
    logger.info('🔧 Registering tools...');
    const registry = ToolRegistry.getInstance();
    await registerAllTools(registry);

    // Load all routes (auto-discovery)
    logger.info('🔍 Loading routes...');
    await loadAllRoutes(app);

    // Setup error handling (must be last)
    logger.info('🛡️ Setting up error handling...');
    await setupErrorHandling(app);

    // Start server with proper error handling
    await startHTTPServer(app, PORT);

    // Initialize WebSocket
    logger.info('Setting up WebSocket...');
    setupWebSocket(httpServer);

    logger.info(`🚀 API server started on port ${PORT}`);
    logger.info(`🏥 Health check: http://localhost:${PORT}/health`);

    // Setup graceful shutdown
    setupGracefulShutdown();
  } catch (error) {
    logger.error(
      '❌ Server startup failed',
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
      logger.info(`✅ Server listening on port ${port}`);
      resolve();
    });

    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${port} is already in use`);
        reject(new Error(`Port ${port} is already in use`));
      } else {
        logger.error('❌ Server error', error, {});
        reject(error);
      }
    });
  });
}

function setupGracefulShutdown(): void {
  logger.info('Setting up graceful shutdown handlers');

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received, shutting down gracefully`);

    if (httpServer) {
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
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
  process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart
}

// Start the server
startServer();
