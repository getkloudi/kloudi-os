/**
 * Executions API Routes
 *
 * Execute and track procedure runs for lore.dev.
 * Uses real procedure lookup from the database, but keeps simulated execution.
 */

import { ProcedureService } from '@kloudi/core';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('executions-routes');

const DEFAULT_WORKSPACE_ID = 'default-workspace';

const procedureService = new ProcedureService();

// In-memory execution store (replace with persistent storage in future)
const executions = new Map();

// Generate unique execution ID
function generateId() {
  return 'exec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

export function setupRoutes(app) {
  // POST /api/procedures/:id/run - Execute a procedure
  app.post('/api/procedures/:id/run', async (req, res) => {
    try {
      const { id } = req.params;
      const { params } = req.body || {};

      // Look up the procedure from the database - try by ID then by slug
      let procedure;
      try {
        procedure = await procedureService.repository.findById(id);
      } catch {
        // ignore
      }
      if (!procedure) {
        try {
          procedure = await procedureService.getProcedure(
            DEFAULT_WORKSPACE_ID,
            id
          );
        } catch {
          // ignore
        }
      }

      if (!procedure) {
        return res.status(404).json({ error: 'Procedure not found' });
      }

      // Create execution record
      const executionId = generateId();
      const execution = {
        id: executionId,
        procedureId: procedure.id,
        procedureSlug: procedure.slug,
        procedureName: procedure.name,
        params: params || {},
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
        startedAt: new Date().toISOString(),
        completedAt: null,
        result: null,
        error: null,
      };

      executions.set(executionId, execution);

      logger.info('Started procedure execution', {
        context: 'execution-start',
        executionId,
        procedureId: procedure.id,
        slug: procedure.slug,
      });

      // Simulate async execution (replace with actual agent runtime in future)
      setImmediate(async () => {
        try {
          execution.status = 'running';
          execution.progress = 10;
          execution.logs.push({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Analyzing requirements...',
          });

          // Simulate steps
          const stepCount = 3;
          for (let i = 0; i < stepCount; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            execution.progress = Math.round(((i + 1) / stepCount) * 100);
            execution.steps.push({
              name: 'Step ' + (i + 1),
              status: 'completed',
              completedAt: new Date().toISOString(),
            });
            execution.logs.push({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Step ${i + 1} of ${stepCount} completed`,
            });
          }

          execution.status = 'completed';
          execution.completedAt = new Date().toISOString();
          execution.result = { success: true };
          execution.logs.push({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Execution completed successfully',
          });

          logger.info('Procedure execution completed', {
            context: 'execution-complete',
            executionId,
            slug: procedure.slug,
          });
        } catch (error) {
          execution.status = 'failed';
          execution.error = error.message;
          execution.completedAt = new Date().toISOString();
          execution.logs.push({
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `Execution failed: ${error.message}`,
          });

          logger.error('Procedure execution failed', error, {
            context: 'execution-error',
            executionId,
            slug: procedure.slug,
          });
        }
      });

      res.status(202).json({
        data: {
          id: executionId,
          procedureId: procedure.id,
          status: 'pending',
          message: `Execution of "${procedure.name}" started`,
        },
      });
    } catch (error) {
      logger.error('Failed to start execution', error, {
        context: 'execution-start-error',
        id: req.params.id,
      });
      res.status(500).json({ error: 'Failed to start execution' });
    }
  });

  // GET /api/executions - List executions
  app.get('/api/executions', (req, res) => {
    try {
      const { status, procedureSlug, limit = 50 } = req.query;
      let results = Array.from(executions.values());

      if (status) {
        results = results.filter((e) => e.status === status);
      }
      if (procedureSlug) {
        results = results.filter((e) => e.procedureSlug === procedureSlug);
      }

      // Sort by most recent first
      results.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

      // Apply limit
      results = results.slice(0, parseInt(limit, 10));

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
      logger.error('Failed to list executions', error, {
        context: 'executions-list-error',
      });
      res.status(500).json({ error: 'Failed to list executions' });
    }
  });

  // GET /api/executions/:id - Get execution status
  app.get('/api/executions/:id', (req, res) => {
    try {
      const { id } = req.params;
      const execution = executions.get(id);

      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      logger.info('Retrieved execution', {
        context: 'execution-get',
        id,
        status: execution.status,
      });

      res.json({ data: execution });
    } catch (error) {
      logger.error('Failed to get execution', error, {
        context: 'execution-get-error',
        id: req.params.id,
      });
      res.status(500).json({ error: 'Failed to get execution' });
    }
  });
}
