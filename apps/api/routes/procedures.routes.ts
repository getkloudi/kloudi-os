/**
 * Procedures API Routes
 *
 * CRUD operations for lore.dev procedures.
 * Backed by ProcedureService (Prisma-backed).
 */

import type { Application, Request, Response } from 'express';
import { ProcedureService } from '@kloudi/core';
import type { ProcedureLevelType, ProcedureEntityData, ProcedureMaturityType } from '@kloudi/core';
import type { Graph } from '@kloudi/shared/types';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('procedures-routes');

const procedureService = new ProcedureService();

type ProcedureLevel = 'guide' | 'skill' | 'project' | 'task';

interface Procedure {
  id: string;
  name: string;
  level: ProcedureLevel;
  description?: string;
  graph?: { content?: string; nodes?: unknown[]; edges?: unknown[] };
  maturity: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TreeNode {
  id: string;
  name: string;
  type: string;
  slug?: string;
  children?: TreeNode[];
}

interface EntityData {
  id: string;
  name: string;
  type: string;
  description: string;
  content: string;
  status: string;
  slug: string;
  maturity: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CommandItem {
  id: string;
  name: string;
  type: string;
  description: string;
  slug: string;
}

interface ProcedureCreateInput {
  slug?: string;
  name?: string;
  description?: string;
  level?: string;
  graph?: { nodes?: unknown[]; edges?: unknown[] };
  parameters?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
}

interface ProcedureUpdateInput {
  name?: string;
  description?: string;
  level?: string;
  maturity?: string;
  graph?: unknown;
  parameters?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
}

/**
 * Convert a Procedure DB record to EntityData shape for the frontend.
 * Maps `level` -> `type` and derives `content` from `graph.content`.
 */
function toEntityData(procedure: Procedure): EntityData {
  return {
    id: procedure.id,
    name: procedure.name,
    type: procedure.level,
    description: procedure.description ?? '',
    content: procedure.graph?.content ?? procedure.description ?? '',
    status: procedure.maturity === 'validated' ? 'completed' : 'pending',
    slug: procedure.slug,
    maturity: procedure.maturity,
    createdAt: procedure.createdAt,
    updatedAt: procedure.updatedAt,
  };
}

/**
 * Convert a flat list of procedures into a TreeNode[] structure
 * grouped by level into folders.
 */
function toTreeNodes(procedures: Procedure[]): TreeNode[] {
  const groups: Record<ProcedureLevel, TreeNode[]> = { guide: [], skill: [], project: [], task: [] };

  for (const p of procedures) {
    const node: TreeNode = { id: p.id, name: p.name, type: p.level, slug: p.slug };
    const levelGroups = groups[p.level];
    if (levelGroups) {
      levelGroups.push(node);
    }
  }

  const tree: TreeNode[] = [];

  if (groups['guide'].length) {
    tree.push({
      id: 'guides',
      name: 'Guides',
      type: 'folder',
      children: groups['guide'],
    });
  }

  if (groups['skill'].length) {
    tree.push({
      id: 'skills',
      name: 'Skills',
      type: 'folder',
      children: groups['skill'],
    });
  }

  if (groups['project'].length || groups['task'].length) {
    const projects = groups['project'].map((p) => ({
      ...p,
      children: groups['task'],
    }));

    // If there are tasks but no projects, put tasks directly in the folder
    if (projects.length === 0 && groups['task'].length) {
      tree.push({
        id: 'tasks',
        name: 'Tasks',
        type: 'folder',
        children: groups['task'],
      });
    } else {
      tree.push({
        id: 'projects',
        name: 'Projects',
        type: 'folder',
        children: projects,
      });
    }
  }

  return tree;
}

/**
 * Convert a procedure to a CommandItem shape for omnibox search.
 */
function toCommandItem(procedure: Procedure): CommandItem {
  return {
    id: procedure.id,
    name: procedure.name,
    type: procedure.level,
    description: procedure.description ?? '',
    slug: procedure.slug,
  };
}

/**
 * Validate and cast level string to ProcedureLevelType
 */
function isValidLevel(level: string): level is ProcedureLevelType {
  return ['guide', 'skill', 'project', 'task'].includes(level);
}

/**
 * Validate and cast maturity string to ProcedureMaturityType
 */
function isValidMaturity(maturity: string): maturity is ProcedureMaturityType {
  return ['draft', 'curated', 'validated'].includes(maturity);
}

export function setupRoutes(app: Application): void {
  // GET /api/procedures - List procedures as tree structure
  app.get('/api/procedures', async (req: Request, res: Response) => {
    try {
      const { level, maturity, format } = req.query as { level?: string; maturity?: string; format?: string };

      const options: { limit: number; offset: number; level?: ProcedureLevelType } = { limit: 100, offset: 0 };
      if (level && isValidLevel(level)) {
        options.level = level;
      }

      const results = await procedureService.listProcedures(
        req.user!.organizationId,
        options
      ) as Procedure[];

      // If maturity filter requested, apply it (service doesn't support it natively)
      let filtered = results;
      if (maturity) {
        filtered = results.filter((p) => p.maturity === maturity);
      }

      // Default: return tree structure for the sidebar
      if (format === 'flat') {
        // Flat list of EntityData
        const data = filtered.map(toEntityData);
        logger.info('Listed procedures (flat)', {
          context: 'procedures-list',
          count: data.length,
        });
        res.json({ data, total: data.length });
        return;
      }

      // Tree format for sidebar
      const tree = toTreeNodes(filtered);

      logger.info('Listed procedures (tree)', {
        context: 'procedures-list',
        count: filtered.length,
        filters: { level, maturity },
      });

      res.json({
        data: tree,
        total: filtered.length,
      });
    } catch (error) {
      logger.error('Failed to list procedures', error instanceof Error ? error : null, {
        context: 'procedures-list-error',
      });
      res.status(500).json({ error: 'Failed to list procedures' });
    }
  });

  // GET /api/procedures/search - Search procedures for omnibox
  app.get('/api/procedures/search', async (req: Request, res: Response) => {
    try {
      const { q = '', limit = '20' } = req.query as { q?: string; limit?: string };

      const results = await procedureService.searchProcedures(
        req.user!.organizationId,
        q,
        { limit: parseInt(limit, 10) }
      ) as Procedure[];

      const data = results.map(toCommandItem);

      logger.info('Searched procedures', {
        context: 'procedures-search',
        query: q,
        count: data.length,
      });

      res.json({ data, total: data.length });
    } catch (error) {
      logger.error('Failed to search procedures', error instanceof Error ? error : null, {
        context: 'procedures-search-error',
      });
      res.status(500).json({ error: 'Failed to search procedures' });
    }
  });

  // GET /api/procedures/:id - Get procedure by ID (returns EntityData)
  app.get('/api/procedures/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;

      // Try to find by ID or slug via the service
      let procedure: Procedure | null = null;
      try {
        procedure = await procedureService.getProcedure(
          req.user!.organizationId,
          id
        ) as Procedure | null;
      } catch {
        // Not found
      }

      if (!procedure) {
        res.status(404).json({ error: 'Procedure not found' });
        return;
      }

      const data = toEntityData(procedure);

      logger.info('Retrieved procedure', {
        context: 'procedure-get',
        id,
      });

      res.json({ data });
    } catch (error) {
      logger.error('Failed to get procedure', error instanceof Error ? error : null, {
        context: 'procedure-get-error',
        id: req.params['id'],
      });
      res.status(500).json({ error: 'Failed to get procedure' });
    }
  });

  // POST /api/procedures - Create procedure
  app.post('/api/procedures', async (req: Request, res: Response) => {
    try {
      const { slug, name, description, level, graph, parameters, constraints } =
        req.body as ProcedureCreateInput;

      if (!slug || !name) {
        res.status(400).json({ error: 'slug and name are required' });
        return;
      }

      const procedureLevel: ProcedureLevelType = (level && isValidLevel(level)) ? level : 'task';
      const procedureGraph: Graph = graph ? { nodes: [], edges: [], ...graph } as Graph : { nodes: [], edges: [] };

      const createData: ProcedureEntityData = {
        slug,
        name,
        description: description ?? '',
        level: procedureLevel,
        graph: procedureGraph,
        parameters: parameters ?? {},
        constraints: constraints ?? {},
      };

      const procedure = await procedureService.createProcedure(
        req.user!.organizationId,
        createData
      ) as Procedure;

      logger.info('Created procedure', {
        context: 'procedure-create',
        slug,
      });

      res.status(201).json({ data: toEntityData(procedure) });
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('already exists')) {
        res.status(409).json({ error: err.message });
        return;
      }
      logger.error('Failed to create procedure', error instanceof Error ? error : null, {
        context: 'procedure-create-error',
      });
      res.status(500).json({ error: 'Failed to create procedure' });
    }
  });

  // PUT /api/procedures/:id - Update procedure
  app.put('/api/procedures/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const { name, description, level, maturity, graph, parameters, constraints } =
        req.body as ProcedureUpdateInput;

      // Find the procedure first via the service
      let procedure: Procedure | null = null;
      try {
        procedure = await procedureService.getProcedure(
          req.user!.organizationId,
          id
        ) as Procedure | null;
      } catch {
        // ignore
      }

      if (!procedure) {
        res.status(404).json({ error: 'Procedure not found' });
        return;
      }

      const updateData: Partial<ProcedureEntityData> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (level !== undefined && isValidLevel(level)) updateData.level = level;
      if (maturity !== undefined && isValidMaturity(maturity)) updateData.maturity = maturity;
      if (graph !== undefined) updateData.graph = graph as Graph;
      if (parameters !== undefined) updateData.parameters = parameters;
      if (constraints !== undefined) updateData.constraints = constraints;

      const updated = await procedureService.updateProcedure(
        procedure.id,
        updateData
      ) as Procedure;

      logger.info('Updated procedure', {
        context: 'procedure-update',
        id: procedure.id,
      });

      res.json({ data: toEntityData(updated) });
    } catch (error) {
      logger.error('Failed to update procedure', error instanceof Error ? error : null, {
        context: 'procedure-update-error',
        id: req.params['id'],
      });
      res.status(500).json({ error: 'Failed to update procedure' });
    }
  });

  // DELETE /api/procedures/:id - Delete procedure
  app.delete('/api/procedures/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;

      // Find the procedure first via the service
      let procedure: Procedure | null = null;
      try {
        procedure = await procedureService.getProcedure(
          req.user!.organizationId,
          id
        ) as Procedure | null;
      } catch {
        // ignore
      }

      if (!procedure) {
        res.status(404).json({ error: 'Procedure not found' });
        return;
      }

      await procedureService.deleteProcedure(procedure.id);

      logger.info('Deleted procedure', {
        context: 'procedure-delete',
        id: procedure.id,
      });

      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete procedure', error instanceof Error ? error : null, {
        context: 'procedure-delete-error',
        id: req.params['id'],
      });
      res.status(500).json({ error: 'Failed to delete procedure' });
    }
  });
}
