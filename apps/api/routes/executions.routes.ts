/**
 * Executions API Routes
 *
 * Execute, track, and manage SOP runs for lore.dev.
 * Wires ExecutionEngine into the API with WebSocket streaming.
 */

import type { Application, Request, Response } from 'express';
import {
  ExecutionEngine,
  ContextManager,
  LLMExecutor,
  ToolCallExecutor,
  InterpolativeExecutor,
  SubEntityExecutor,
  SopService,
} from '@kloudi/core';
import type { NodeType } from '@kloudi/shared/types';
import type { NodeExecutor } from '@kloudi/core';
import { AIClient } from '@kloudi/infrastructure/ai';
import { ToolRegistry } from '@kloudi/tools';
import { Database } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';
import {
  emitExecutionProgress,
  emitExecutionComplete,
  requestTrustGateApproval,
} from '../lib/websocket.js';

const logger = Logger.getInstance('executions-routes');

// Initialize engine components at module level
const contextManager = new ContextManager();
const aiClient = new AIClient({ context: 'execution-engine' });
const sopService = new SopService();

const executors = new Map<NodeType, NodeExecutor>([
  ['llm_generate', new LLMExecutor(aiClient as any, contextManager)],
  ['tool_call', new ToolCallExecutor(() => ToolRegistry.getInstance() as any)],
  ['interpolative', new InterpolativeExecutor(aiClient as any, contextManager)],
  ['sub_entity', new SubEntityExecutor(sopService as any)],
]);

const engine = new ExecutionEngine(executors, contextManager);

export function setupRoutes(app: Application): void {
  // POST /api/sops/:id/run — Execute an SOP
  app.post('/api/sops/:id/run', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const params = (body['params'] as Record<string, unknown>) ?? {};

      // Look up SOP
      let sop: { id: string; name: string; slug: string } | null = null;
      try {
        sop = (await sopService.getSop(req.user!.organizationId, id)) as {
          id: string;
          name: string;
          slug: string;
        } | null;
      } catch {
        // Try by ID if slug lookup fails
        try {
          sop = await (sopService as any).repository.findById(id);
        } catch {
          // ignore
        }
      }

      if (!sop) {
        res.status(404).json({ error: 'SOP not found' });
        return;
      }

      const { executionId } = await engine.execute(
        sop.id,
        params,
        req.user!.organizationId,
        {
          onNodeStart: (execId, nodeId, name) =>
            emitExecutionProgress(execId, {
              type: 'node:start',
              nodeId,
              name,
            } as any),
          onNodeComplete: (execId, nodeId, output) =>
            emitExecutionProgress(execId, {
              type: 'node:complete',
              nodeId,
              output,
            } as any),
          onNodeFailed: (execId, nodeId, error) =>
            emitExecutionProgress(execId, {
              type: 'node:failed',
              nodeId,
              error,
            } as any),
          onExecutionComplete: (execId, result) =>
            emitExecutionComplete(execId, result),
          onExecutionFailed: (execId, error) =>
            emitExecutionProgress(execId, {
              type: 'execution:failed',
              error,
            } as any),
          onTrustGateTriggered: async (gateContext) => {
            try {
              const response = await requestTrustGateApproval(
                gateContext.executionId,
                gateContext as unknown as Record<string, unknown>
              );
              return response === 'approve' ? 'approve' : 'reject';
            } catch {
              return 'reject';
            }
          },
        }
      );

      res.status(202).json({
        data: { executionId, status: 'pending' },
      });
    } catch (error) {
      const err = error as Error;

      // Concurrency limit → 429
      if (err.message.includes('Concurrent execution limit')) {
        res.status(429).json({ error: err.message });
        return;
      }

      logger.error(
        'Failed to start execution',
        error instanceof Error ? error : null,
        {
          id: req.params['id'],
        }
      );
      res.status(500).json({ error: 'Failed to start execution' });
    }
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

        if (
          execution.status === 'completed' ||
          execution.status === 'failed' ||
          execution.status === 'cancelled'
        ) {
          res.json({
            data: {
              id,
              status: execution.status,
              message: 'Execution already terminal',
            },
          });
          return;
        }

        // Set cancelled — engine checks this between nodes
        await (db as any).execution.update({
          where: { id },
          data: { status: 'cancelled', completedAt: new Date() },
        });

        logger.info('Execution cancelled', { executionId: id });

        emitExecutionProgress(id, { type: 'execution:cancelled' } as any);

        res.json({ data: { id, status: 'cancelled' } });
      } catch (error) {
        logger.error(
          'Failed to cancel execution',
          error instanceof Error ? error : null,
          {
            id: req.params['id'],
          }
        );
        res.status(500).json({ error: 'Failed to cancel execution' });
      }
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
      if (status) {
        where['status'] = status;
      }

      const results = await (db as any).execution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: parseInt(limit, 10),
        include: {
          sop: { select: { name: true, slug: true } },
        },
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
        {
          id: req.params['id'],
        }
      );
      res.status(500).json({ error: 'Failed to get execution' });
    }
  });

  // GET /api/executions/:id/nodes — Get execution nodes
  app.get('/api/executions/:id/nodes', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const db = await Database.getInstance().getClient();

      const nodes = await (db as any).executionNode.findMany({
        where: { executionId: id },
        orderBy: { startedAt: 'asc' },
      });

      res.json({ data: nodes });
    } catch (error) {
      logger.error(
        'Failed to get execution nodes',
        error instanceof Error ? error : null,
        {
          id: req.params['id'],
        }
      );
      res.status(500).json({ error: 'Failed to get execution nodes' });
    }
  });

  // GET /api/activity — Activity feed for Home space
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
