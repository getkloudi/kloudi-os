/**
 * Executions API Routes
 *
 * Execute and track procedure runs for lore.dev.
 * Uses database persistence for execution tracking.
 */

import type { Application, Request, Response } from 'express';
import { ProcedureService } from '@kloudi/core';
import { Database } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('executions-routes');

const DEFAULT_WORKSPACE_ID = 'default-workspace';

const procedureService = new ProcedureService();

interface Procedure {
  id: string;
  name: string;
  slug: string;
}

interface ExecutionLog {
  timestamp: string;
  level: string;
  message: string;
}

interface ExecutionStep {
  name: string;
  status: string;
  completedAt: string;
}

interface ExecutionRecord {
  id: string;
  procedureId: string;
  procedureSlug: string;
  procedureName: string;
  params: Record<string, unknown>;
  status: string;
  progress: number;
  steps: ExecutionStep[];
  logs: ExecutionLog[];
  result: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  workspaceId: string;
}

/** Prisma model methods interface */
interface DbModel<T = unknown> {
  findMany: (args?: Record<string, unknown>) => Promise<T[]>;
  findUnique: (args: Record<string, unknown>) => Promise<T | null>;
  findFirst: (args?: Record<string, unknown>) => Promise<T | null>;
  create: (args: Record<string, unknown>) => Promise<T>;
  update: (args: Record<string, unknown>) => Promise<T>;
  delete: (args: Record<string, unknown>) => Promise<T>;
  deleteMany: (args?: Record<string, unknown>) => Promise<{ count: number }>;
  count: (args?: Record<string, unknown>) => Promise<number>;
}

export function setupRoutes(app: Application): void {
  // POST /api/procedures/:id/run - Execute a procedure
  app.post('/api/procedures/:id/run', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const { params } = (req.body ?? {}) as { params?: Record<string, unknown> };

      // Look up the procedure from the database via the service
      let procedure: Procedure | null = null;
      try {
        procedure = await procedureService.getProcedure(
          DEFAULT_WORKSPACE_ID,
          id
        ) as Procedure | null;
      } catch {
        // ignore
      }

      if (!procedure) {
        res.status(404).json({ error: 'Procedure not found' });
        return;
      }

      const db = await Database.getInstance().getClient();

      // Create execution record in database
      const execution = await (db['execution'] as DbModel<ExecutionRecord>).create({
        data: {
          procedureId: procedure.id,
          procedureSlug: procedure.slug,
          procedureName: procedure.name,
          params: params ?? {},
          status: 'pending',
          progress: 0,
          steps: [],
          logs: [
            {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Starting execution of "${procedure.name}"...`,
            },
          ],
          result: null,
          error: null,
          workspaceId: DEFAULT_WORKSPACE_ID,
        },
      });

      logger.info('Started procedure execution', {
        context: 'execution-start',
        executionId: execution.id,
        procedureId: procedure.id,
        slug: procedure.slug,
      });

      // Capture values for use in closure
      const executionId = execution.id;
      const capturedProcedure = procedure;

      // Simulate async execution (replace with actual agent runtime in future)
      setImmediate(async () => {
        try {
          const logs: ExecutionLog[] = [
            ...execution.logs,
            {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: 'Analyzing requirements...',
            },
          ];

          await (db['execution'] as DbModel<ExecutionRecord>).update({
            where: { id: executionId },
            data: {
              status: 'running',
              progress: 10,
              logs,
            },
          });

          // Simulate steps
          const steps: ExecutionStep[] = [];
          const stepCount = 3;
          for (let i = 0; i < stepCount; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));

            steps.push({
              name: 'Step ' + (i + 1),
              status: 'completed',
              completedAt: new Date().toISOString(),
            });

            logs.push({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Step ${i + 1} of ${stepCount} completed`,
            });

            await (db['execution'] as DbModel<ExecutionRecord>).update({
              where: { id: executionId },
              data: {
                progress: Math.round(((i + 1) / stepCount) * 100),
                steps,
                logs,
              },
            });
          }

          logs.push({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Execution completed successfully',
          });

          await (db['execution'] as DbModel<ExecutionRecord>).update({
            where: { id: executionId },
            data: {
              status: 'completed',
              completedAt: new Date(),
              result: { success: true },
              steps,
              logs,
            },
          });

          logger.info('Procedure execution completed', {
            context: 'execution-complete',
            executionId,
            slug: capturedProcedure.slug,
          });
        } catch (error) {
          const err = error as Error;

          await (db['execution'] as DbModel<ExecutionRecord>).update({
            where: { id: executionId },
            data: {
              status: 'failed',
              error: err.message,
              completedAt: new Date(),
            },
          });

          logger.error('Procedure execution failed', error instanceof Error ? error : null, {
            context: 'execution-error',
            executionId,
            slug: capturedProcedure.slug,
          });
        }
      });

      res.status(202).json({
        data: {
          id: execution.id,
          procedureId: procedure.id,
          status: 'pending',
          message: `Execution of "${procedure.name}" started`,
        },
      });
    } catch (error) {
      logger.error('Failed to start execution', error instanceof Error ? error : null, {
        context: 'execution-start-error',
        id: req.params['id'],
      });
      res.status(500).json({ error: 'Failed to start execution' });
    }
  });

  // GET /api/executions - List executions
  app.get('/api/executions', async (req: Request, res: Response) => {
    try {
      const { status, procedureSlug, limit = '50' } = req.query as {
        status?: string;
        procedureSlug?: string;
        limit?: string;
      };

      const db = await Database.getInstance().getClient();

      const where: Record<string, unknown> = {
        workspaceId: DEFAULT_WORKSPACE_ID,
      };

      if (status) {
        where['status'] = status;
      }
      if (procedureSlug) {
        where['procedureSlug'] = procedureSlug;
      }

      const results = await (db['execution'] as DbModel<ExecutionRecord>).findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: parseInt(limit, 10),
      });

      logger.info('Listed executions', {
        context: 'executions-list',
        count: results.length,
        filters: { status, procedureSlug },
      });

      res.json({
        data: results,
        total: results.length,
      });
    } catch (error) {
      logger.error('Failed to list executions', error instanceof Error ? error : null, {
        context: 'executions-list-error',
      });
      res.status(500).json({ error: 'Failed to list executions' });
    }
  });

  // GET /api/executions/:id - Get execution status
  app.get('/api/executions/:id', async (req: Request, res: Response) => {
    try {
      const idParam = req.params['id'];
      const id = Array.isArray(idParam) ? idParam[0] : idParam;
      if (!id) {
        res.status(400).json({ error: 'Execution ID required' });
        return;
      }

      const db = await Database.getInstance().getClient();

      const execution = await (db['execution'] as DbModel<ExecutionRecord>).findUnique({
        where: { id },
      });

      if (!execution) {
        res.status(404).json({ error: 'Execution not found' });
        return;
      }

      logger.info('Retrieved execution', {
        context: 'execution-get',
        id,
        status: execution.status,
      });

      res.json({ data: execution });
    } catch (error) {
      logger.error('Failed to get execution', error instanceof Error ? error : null, {
        context: 'execution-get-error',
        id: req.params['id'],
      });
      res.status(500).json({ error: 'Failed to get execution' });
    }
  });
}
