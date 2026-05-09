import type { Application, Request, Response } from 'express';
import {
  PrismaManager,
  type PrismaModelMethods,
} from '@kloudi-os/infrastructure/database';
import { Logger } from '@kloudi-os/shared/logger';

const logger = Logger.getInstance('ops-sops');

export function setupSopRoutes(app: Application): void {
  const prefix = '/ops/sops';

  // List all SOPs (no workspace scoping — admin view)
  app.get(prefix, async (_req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const sop = db['sop'] as PrismaModelMethods;
      const sops = await sop.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { executions: true } } },
      });
      res.json({ data: sops });
    } catch (error) {
      logger.error(
        'Failed to list SOPs',
        error instanceof Error ? error : null,
        {}
      );
      res.status(500).json({ error: 'Failed to list SOPs' });
    }
  });

  // Get single SOP with full details
  app.get(`${prefix}/:id`, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const sop = db['sop'] as PrismaModelMethods;
      const result = await sop.findUnique({
        where: { id: req.params['id'] },
        include: {
          executions: { orderBy: { startedAt: 'desc' }, take: 10 },
          childEntities: true,
        },
      });

      if (!result) {
        res.status(404).json({ error: 'SOP not found' });
        return;
      }

      res.json({ data: result });
    } catch (error) {
      logger.error(
        'Failed to get SOP',
        error instanceof Error ? error : null,
        {}
      );
      res.status(500).json({ error: 'Failed to get SOP' });
    }
  });

  // Create/seed an SOP (admin)
  app.post(prefix, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const sop = db['sop'] as PrismaModelMethods;
      const result = await sop.create({ data: req.body });
      logger.info('SOP created via ops', {
        id: (result as Record<string, unknown>)['id'],
      });
      res.status(201).json({ data: result });
    } catch (error) {
      logger.error(
        'Failed to create SOP',
        error instanceof Error ? error : null,
        {}
      );
      res.status(500).json({ error: 'Failed to create SOP' });
    }
  });

  // Update SOP
  app.put(`${prefix}/:id`, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const sop = db['sop'] as PrismaModelMethods;
      const result = await sop.update({
        where: { id: req.params['id'] },
        data: req.body,
      });
      logger.info('SOP updated via ops', {
        id: (result as Record<string, unknown>)['id'],
      });
      res.json({ data: result });
    } catch (error) {
      logger.error(
        'Failed to update SOP',
        error instanceof Error ? error : null,
        {}
      );
      res.status(500).json({ error: 'Failed to update SOP' });
    }
  });

  // Delete SOP (admin only — cascades executions)
  app.delete(`${prefix}/:id`, async (req: Request, res: Response) => {
    try {
      const db = await PrismaManager.getInstance().getClient();
      const sop = db['sop'] as PrismaModelMethods;
      await sop.delete({ where: { id: req.params['id'] } });
      logger.info('SOP deleted via ops', { id: req.params['id'] });
      res.status(204).end();
    } catch (error) {
      logger.error(
        'Failed to delete SOP',
        error instanceof Error ? error : null,
        {}
      );
      res.status(500).json({ error: 'Failed to delete SOP' });
    }
  });
}
