import type { Application, Request, Response } from 'express';
import { PrismaManager, type PrismaModelMethods } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('ops-health');

export function setupHealthRoutes(app: Application): void {
  // DB health check with stats
  app.get('/ops/health', async (_req: Request, res: Response) => {
    try {
      const db = PrismaManager.getInstance();
      const dbHealth = await db.healthCheck();
      const client = await db.getClient();

      const procedure = client['procedure'] as PrismaModelMethods;
      const execution = client['execution'] as PrismaModelMethods;
      const user = client['user'] as PrismaModelMethods;

      // Gather stats
      const [
        procedureCount,
        executionCount,
        runningCount,
        userCount,
      ] = await Promise.all([
        procedure.count(),
        execution.count(),
        execution.count({ where: { status: 'running' } }),
        user.count(),
      ]);

      res.json({
        status: dbHealth.status,
        database: dbHealth,
        stats: {
          procedures: procedureCount,
          executions: executionCount,
          running: runningCount,
          users: userCount,
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Health check failed', error instanceof Error ? error : null, {});
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Lightweight liveness probe
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'internal-api' });
  });
}
