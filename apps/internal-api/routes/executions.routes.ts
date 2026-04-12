import type { Application, Request, Response } from 'express';
import { PrismaManager, type PrismaModelMethods } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('ops-executions');

export function setupExecutionRoutes(app: Application): void {
  const prefix = '/ops/executions';

  // List all executions across all workspaces
  app.get(prefix, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const execution = db['execution'] as PrismaModelMethods;
      const status = req.query['status'] as string | undefined;
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 200);
      const offset = parseInt(req.query['offset'] as string) || 0;

      const where: Record<string, unknown> = {};
      if (status) {
        where['status'] = status;
      }

      const [executions, total] = await Promise.all([
        execution.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            procedure: { select: { id: true, name: true, slug: true } },
            _count: { select: { executionNodes: true } },
          },
        }),
        execution.count({ where }),
      ]);

      res.json({ data: executions, total, limit, offset });
    } catch (error) {
      logger.error('Failed to list executions', error instanceof Error ? error : null, {});
      res.status(500).json({ error: 'Failed to list executions' });
    }
  });

  // Get execution with full trace (all nodes)
  app.get(`${prefix}/:id`, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const execution = db['execution'] as PrismaModelMethods;
      const result = await execution.findUnique({
        where: { id: req.params['id'] },
        include: {
          procedure: true,
          executionNodes: { orderBy: { startedAt: 'asc' } },
        },
      });

      if (!result) {
        res.status(404).json({ error: 'Execution not found' });
        return;
      }

      res.json({ data: result });
    } catch (error) {
      logger.error('Failed to get execution', error instanceof Error ? error : null, {});
      res.status(500).json({ error: 'Failed to get execution' });
    }
  });

  // Kill a stuck execution (set status to cancelled)
  app.post(`${prefix}/:id/kill`, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const execution = db['execution'] as PrismaModelMethods;
      const existing = await execution.findUnique({
        where: { id: req.params['id'] },
      }) as Record<string, unknown> | null;

      if (!existing) {
        res.status(404).json({ error: 'Execution not found' });
        return;
      }

      const existingStatus = existing['status'] as string;
      if (existingStatus === 'completed' || existingStatus === 'failed' || existingStatus === 'cancelled') {
        res.status(409).json({ error: `Execution already in terminal state: ${existingStatus}` });
        return;
      }

      const updated = await execution.update({
        where: { id: req.params['id'] },
        data: {
          status: 'cancelled',
          error: `Killed via ops dashboard by ${req.opsUser?.email ?? 'unknown'}`,
          completedAt: new Date(),
        },
      });

      logger.info('Execution killed via ops', {
        executionId: req.params['id'],
        killedBy: req.opsUser?.email,
      });

      res.json({ data: updated });
    } catch (error) {
      logger.error('Failed to kill execution', error instanceof Error ? error : null, {});
      res.status(500).json({ error: 'Failed to kill execution' });
    }
  });

  // Bulk cancel stuck executions (running for > threshold)
  app.post(`${prefix}/bulk-cancel-stuck`, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const thresholdMinutes = parseInt(req.body?.thresholdMinutes as string) || 60;
      const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const executionModel = db['execution'] as any;
      const result = await executionModel.updateMany({
        where: {
          status: { in: ['running', 'waiting_input'] },
          startedAt: { lt: cutoff },
        },
        data: {
          status: 'cancelled',
          error: `Bulk cancelled via ops — stuck for >${thresholdMinutes}m`,
          completedAt: new Date(),
        },
      }) as { count: number };

      logger.info('Bulk cancelled stuck executions', { count: result.count, thresholdMinutes });
      res.json({ cancelled: result.count, thresholdMinutes });
    } catch (error) {
      logger.error('Failed to bulk cancel', error instanceof Error ? error : null, {});
      res.status(500).json({ error: 'Failed to bulk cancel executions' });
    }
  });
}
