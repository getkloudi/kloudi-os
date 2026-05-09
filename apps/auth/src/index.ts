import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import pino from 'pino';
import { createAuth, prisma } from './auth.js';

const logger = pino({
  name: 'auth',
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(process.env['NODE_ENV'] === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});

const PORT = parseInt(process.env['PORT'] ?? '3004', 10);

async function start() {
  const auth = await createAuth();
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'auth' });
  });

  app.all('/api/auth/{*splat}', toNodeHandler(auth));

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'auth listening');
  });

  // Graceful shutdown — drain in-flight requests, close DB
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'received signal, shutting down');
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

start().catch((err) => {
  logger.error({ err }, 'failed to start auth service');
  process.exit(1);
});
