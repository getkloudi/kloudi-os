/**
 * Executions API Routes
 *
 * Execute, track, and manage SOP runs.
 * ExecutionEngine is being replaced with the AI-native engine.
 * This file is a placeholder — wire the new engine here when it is built.
 *
 * See: docs/current/agent-loop-design.md for the new engine design.
 */

import type { Application, Request, Response } from 'express';
import { Database } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';
import { emitExecutionProgress } from '../lib/websocket.js';

const logger = Logger.getInstance('executions-routes');

export function setupRoutes(app: Application): void {
  // POST /api/sops/:id/run — Execute an SOP
  // TODO: Wire AI-native ExecutionEngine here (docs/current/agent-loop-design.md)
  app.post('/api/sops/:id/run', async (_req: Request, res: Response) => {
    res
      .status(501)
      .json({ error: 'ExecutionEngine is being rebuilt. Coming soon.' });
  });

  // POST /api/executions/:id/cancel — Cancel a running execution
  app.post(
    '/api/executions/:id/cancel',
    async (req: Request, res: Response) => {
      try {
        const id = req.params['id'] as string;
        const db = await Database.getInstance().getClient();

        const execution = await (db as any).execution.findUnique({
          where: { id, organizationId: req.user!.organizationId },
        });

        if (!execution) {
          res.status(404).json({ error: 'Execution not found' });
          return;
        }

        if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
          res.json({
            data: { id, status: execution.status, message: 'Already terminal' },
          });
          return;
        }

        await (db as any).execution.update({
          where: { id },
          data: { status: 'cancelled', completedAt: new Date() },
        });

        emitExecutionProgress(id, { type: 'execution:cancelled' } as any);
        res.json({ data: { id, status: 'cancelled' } });
      } catch (error) {
        logger.error(
          'Failed to cancel execution',
          error instanceof Error ? error : null,
          { id: req.params['id'] }
        );
        res.status(500).json({ error: 'Failed to cancel execution' });
      }
    }
  );

  // POST /api/executions/:id/resume — Resume a paused execution
  // TODO: Implement resume-from-node once AI-native engine is built
  app.post(
    '/api/executions/:id/resume',
    async (_req: Request, res: Response) => {
      res.status(501).json({
        error: 'Resume not yet implemented. Coming with AI-native engine.',
      });
    }
  );

  // GET /api/executions — List executions
  app.get('/api/executions', async (req: Request, res: Response) => {
    try {
      const { status, limit = '50' } = req.query as {
        status?: string;
        limit?: string;
      };
      const db = await Database.getInstance().getClient();

      const where: Record<string, unknown> = {
        organizationId: req.user!.organizationId,
      };
      if (status) where['status'] = status;

      const results = await (db as any).execution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: parseInt(limit, 10),
        include: { sop: { select: { name: true, slug: true } } },
      });

      res.json({ data: results, total: results.length });
    } catch (error) {
      logger.error(
        'Failed to list executions',
        error instanceof Error ? error : null
      );
      res.status(500).json({ error: 'Failed to list executions' });
    }
  });

  // GET /api/executions/:id — Get execution with nodes
  app.get('/api/executions/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const db = await Database.getInstance().getClient();

      const execution = await (db as any).execution.findUnique({
        where: { id, organizationId: req.user!.organizationId },
        include: {
          executionNodes: { orderBy: { startedAt: 'asc' } },
          sop: { select: { name: true, slug: true } },
        },
      });

      if (!execution) {
        res.status(404).json({ error: 'Execution not found' });
        return;
      }

      res.json({ data: execution });
    } catch (error) {
      logger.error(
        'Failed to get execution',
        error instanceof Error ? error : null,
        { id: req.params['id'] }
      );
      res.status(500).json({ error: 'Failed to get execution' });
    }
  });

  // GET /api/activity — Activity feed
  app.get('/api/activity', async (req: Request, res: Response) => {
    try {
      const { limit = '20', offset = '0' } = req.query as {
        limit?: string;
        offset?: string;
      };
      const db = await Database.getInstance().getClient();

      const activity = await (db as any).execution.findMany({
        where: { organizationId: req.user!.organizationId },
        include: {
          sop: { select: { name: true, slug: true } },
          executionNodes: { orderBy: { startedAt: 'asc' } },
        },
        orderBy: { startedAt: 'desc' },
        take: parseInt(limit, 10),
        skip: parseInt(offset, 10),
      });

      res.json({ data: activity, total: activity.length });
    } catch (error) {
      logger.error(
        'Failed to load activity',
        error instanceof Error ? error : null
      );
      res.status(500).json({ error: 'Failed to load activity' });
    }
  });
}
