// Side-effect import: loads .env files BEFORE any other module's top-level
// code runs. Required because ESM hoists all imports — placing a function
// call between imports doesn't actually run it before later imports execute.
// No-op in production where the deploy platform injects env vars directly.
import '@kloudi-os/shared/config/auto-load';

import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { Logger } from '@kloudi-os/shared/logger';
import { createAuth, prisma } from './auth.js';

const logger = Logger.getInstance('auth');

const PORT = parseInt(process.env['PORT'] ?? '3004', 10);

async function start() {
  const auth = await createAuth();
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'auth' });
  });

  app.all('/api/auth/{*splat}', toNodeHandler(auth));

  const server = app.listen(PORT, () => {
    logger.info('auth listening', { port: PORT });
  });

  // Graceful shutdown — drain in-flight requests, close DB
  const shutdown = async (signal: string) => {
    logger.info('received signal, shutting down', { signal });
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('forced shutdown after 10s timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err: Error) => {
  logger.error('failed to start auth service', err);
  process.exit(1);
});
