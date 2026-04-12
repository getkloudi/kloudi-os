import type { Application, Request, Response } from 'express';
import { PrismaManager, type PrismaModelMethods } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('ops-procedures');

export function setupProcedureRoutes(app: Application): void {
  const prefix = '/ops/procedures';

  // List all procedures (no workspace scoping — admin view)
  app.get(prefix, async (_req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const procedure = db['procedure'] as PrismaModelMethods;
      const procedures = await procedure.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { executions: true } } },
      });
      res.json({ data: procedures });
    } catch (error) {
      logger.error('Failed to list procedures', error instanceof Error ? error : null, {});
      res.status(500).json({ error: 'Failed to list procedures' });
    }
  });

  // Get single procedure with full details
  app.get(`${prefix}/:id`, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const procedure = db['procedure'] as PrismaModelMethods;
      const result = await procedure.findUnique({
        where: { id: req.params['id'] },
        include: {
          executions: { orderBy: { startedAt: 'desc' }, take: 10 },
          childEntities: true,
        },
      });

      if (!result) {
        res.status(404).json({ error: 'Procedure not found' });
        return;
      }

      res.json({ data: result });
    } catch (error) {
      logger.error('Failed to get procedure', error instanceof Error ? error : null, {});
      res.status(500).json({ error: 'Failed to get procedure' });
    }
  });

  // Create/seed a procedure (admin)
  app.post(prefix, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const procedure = db['procedure'] as PrismaModelMethods;
      const result = await procedure.create({ data: req.body });
      logger.info('Procedure created via ops', { id: (result as Record<string, unknown>)['id'] });
      res.status(201).json({ data: result });
    } catch (error) {
      logger.error('Failed to create procedure', error instanceof Error ? error : null, {});
      res.status(500).json({ error: 'Failed to create procedure' });
    }
  });

  // Update procedure
  app.put(`${prefix}/:id`, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const procedure = db['procedure'] as PrismaModelMethods;
      const result = await procedure.update({
        where: { id: req.params['id'] },
        data: req.body,
      });
      logger.info('Procedure updated via ops', { id: (result as Record<string, unknown>)['id'] });
      res.json({ data: result });
    } catch (error) {
      logger.error('Failed to update procedure', error instanceof Error ? error : null, {});
      res.status(500).json({ error: 'Failed to update procedure' });
    }
  });

  // Delete procedure (admin only — cascades executions)
  app.delete(`${prefix}/:id`, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const procedure = db['procedure'] as PrismaModelMethods;
      await procedure.delete({ where: { id: req.params['id'] } });
      logger.info('Procedure deleted via ops', { id: req.params['id'] });
      res.status(204).end();
    } catch (error) {
      logger.error('Failed to delete procedure', error instanceof Error ? error : null, {});
      res.status(500).json({ error: 'Failed to delete procedure' });
    }
  });
}
