import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { createAuth } from './auth.js';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('auth');
const PORT = parseInt(process.env['PORT'] ?? '3004', 10);

async function start() {
  const auth = await createAuth();
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'auth' });
  });

  app.all('/api/auth/{*splat}', toNodeHandler(auth));

  app.listen(PORT, () => {
    logger.info(`auth listening on port ${PORT}`);
  });
}

start().catch(console.error);
