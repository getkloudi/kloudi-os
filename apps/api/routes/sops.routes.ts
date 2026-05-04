/**
 * SOPs API Routes
 *
 * CRUD operations for lore.dev SOPs.
 * Backed by SopService (Prisma-backed).
 */

import type { Application, Request, Response } from 'express';
import { SopService } from '@kloudi/core';
import type {
  SopLevelType,
  SopEntityData,
  SopMaturityType,
} from '@kloudi/core';
import type { Graph } from '@kloudi/shared/types';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('sops-routes');

const sopService = new SopService();

type SopLevel = 'guide' | 'skill' | 'project' | 'task';

interface Sop {
  id: string;
  name: string;
  level: SopLevel;
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

interface SopCreateInput {
  slug?: string;
  name?: string;
  description?: string;
  level?: string;
  graph?: { nodes?: unknown[]; edges?: unknown[] };
  parameters?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
}

interface SopUpdateInput {
  name?: string;
  description?: string;
  level?: string;
  maturity?: string;
  graph?: unknown;
  parameters?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
}

/**
 * Convert a Sop DB record to EntityData shape for the frontend.
 * Maps `level` -> `type` and derives `content` from `graph.content`.
 */
function toEntityData(sop: Sop): EntityData {
  return {
    id: sop.id,
    name: sop.name,
    type: sop.level,
    description: sop.description ?? '',
    content: sop.graph?.content ?? sop.description ?? '',
    status: sop.maturity === 'validated' ? 'completed' : 'pending',
    slug: sop.slug,
    maturity: sop.maturity,
    createdAt: sop.createdAt,
    updatedAt: sop.updatedAt,
  };
}

/**
 * Convert a flat list of SOPs into a TreeNode[] structure
 * grouped by level into folders.
 */
function toTreeNodes(sops: Sop[]): TreeNode[] {
  const groups: Record<SopLevel, TreeNode[]> = {
    guide: [],
    skill: [],
    project: [],
    task: [],
  };

  for (const p of sops) {
    const node: TreeNode = {
      id: p.id,
      name: p.name,
      type: p.level,
      slug: p.slug,
    };
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
 * Convert an SOP to a CommandItem shape for omnibox search.
 */
function toCommandItem(sop: Sop): CommandItem {
  return {
    id: sop.id,
    name: sop.name,
    type: sop.level,
    description: sop.description ?? '',
    slug: sop.slug,
  };
}

/**
 * Validate and cast level string to SopLevelType
 */
function isValidLevel(level: string): level is SopLevelType {
  return ['guide', 'skill', 'project', 'task'].includes(level);
}

/**
 * Validate and cast maturity string to SopMaturityType
 */
function isValidMaturity(maturity: string): maturity is SopMaturityType {
  return ['draft', 'curated', 'validated'].includes(maturity);
}

export function setupRoutes(app: Application): void {
  // GET /api/sops - List SOPs as tree structure
  app.get('/api/sops', async (req: Request, res: Response) => {
    try {
      const { level, maturity, format } = req.query as {
        level?: string;
        maturity?: string;
        format?: string;
      };

      const options: {
        limit: number;
        offset: number;
        level?: SopLevelType;
      } = { limit: 100, offset: 0 };
      if (level && isValidLevel(level)) {
        options.level = level;
      }

      const results = (await sopService.listSops(
        req.user!.organizationId,
        options
      )) as Sop[];

      // If maturity filter requested, apply it (service doesn't support it natively)
      let filtered = results;
      if (maturity) {
        filtered = results.filter((p) => p.maturity === maturity);
      }

      // Default: return tree structure for the sidebar
      if (format === 'flat') {
        // Flat list of EntityData
        const data = filtered.map(toEntityData);
        logger.info('Listed SOPs (flat)', {
          context: 'sops-list',
          count: data.length,
        });
        res.json({ data, total: data.length });
        return;
      }

      // Tree format for sidebar
      const tree = toTreeNodes(filtered);

      logger.info('Listed SOPs (tree)', {
        context: 'sops-list',
        count: filtered.length,
        filters: { level, maturity },
      });

      res.json({
        data: tree,
        total: filtered.length,
      });
    } catch (error) {
      logger.error(
        'Failed to list SOPs',
        error instanceof Error ? error : null,
        {
          context: 'sops-list-error',
        }
      );
      res.status(500).json({ error: 'Failed to list SOPs' });
    }
  });

  // GET /api/sops/search - Search SOPs for omnibox
  app.get('/api/sops/search', async (req: Request, res: Response) => {
    try {
      const { q = '', limit = '20' } = req.query as {
        q?: string;
        limit?: string;
      };

      const results = (await sopService.searchSops(
        req.user!.organizationId,
        q,
        { limit: parseInt(limit, 10) }
      )) as Sop[];

      const data = results.map(toCommandItem);

      logger.info('Searched SOPs', {
        context: 'sops-search',
        query: q,
        count: data.length,
      });

      res.json({ data, total: data.length });
    } catch (error) {
      logger.error(
        'Failed to search SOPs',
        error instanceof Error ? error : null,
        {
          context: 'sops-search-error',
        }
      );
      res.status(500).json({ error: 'Failed to search SOPs' });
    }
  });

  // GET /api/sops/:id - Get SOP by ID (returns EntityData)
  app.get('/api/sops/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;

      // Try to find by ID or slug via the service
      let sop: Sop | null = null;
      try {
        sop = (await sopService.getSop(
          req.user!.organizationId,
          id
        )) as Sop | null;
      } catch {
        // Not found
      }

      if (!sop) {
        res.status(404).json({ error: 'SOP not found' });
        return;
      }

      const data = toEntityData(sop);

      logger.info('Retrieved SOP', {
        context: 'sop-get',
        id,
      });

      res.json({ data });
    } catch (error) {
      logger.error('Failed to get SOP', error instanceof Error ? error : null, {
        context: 'sop-get-error',
        id: req.params['id'],
      });
      res.status(500).json({ error: 'Failed to get SOP' });
    }
  });

  // POST /api/sops - Create SOP
  app.post('/api/sops', async (req: Request, res: Response) => {
    try {
      const { slug, name, description, level, graph, parameters, constraints } =
        req.body as SopCreateInput;

      if (!slug || !name) {
        res.status(400).json({ error: 'slug and name are required' });
        return;
      }

      const sopLevel: SopLevelType =
        level && isValidLevel(level) ? level : 'task';
      const sopGraph: Graph = graph
        ? ({ nodes: [], edges: [], ...graph } as Graph)
        : { nodes: [], edges: [] };

      const createData: SopEntityData = {
        slug,
        name,
        description: description ?? '',
        level: sopLevel,
        graph: sopGraph,
        parameters: parameters ?? {},
        constraints: constraints ?? {},
      };

      const sop = (await sopService.createSop(
        req.user!.organizationId,
        createData
      )) as Sop;

      logger.info('Created SOP', {
        context: 'sop-create',
        slug,
      });

      res.status(201).json({ data: toEntityData(sop) });
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('already exists')) {
        res.status(409).json({ error: err.message });
        return;
      }
      logger.error(
        'Failed to create SOP',
        error instanceof Error ? error : null,
        {
          context: 'sop-create-error',
        }
      );
      res.status(500).json({ error: 'Failed to create SOP' });
    }
  });

  // PUT /api/sops/:id - Update SOP
  app.put('/api/sops/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const {
        name,
        description,
        level,
        maturity,
        graph,
        parameters,
        constraints,
      } = req.body as SopUpdateInput;

      // Find the SOP first via the service
      let sop: Sop | null = null;
      try {
        sop = (await sopService.getSop(
          req.user!.organizationId,
          id
        )) as Sop | null;
      } catch {
        // ignore
      }

      if (!sop) {
        res.status(404).json({ error: 'SOP not found' });
        return;
      }

      const updateData: Partial<SopEntityData> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (level !== undefined && isValidLevel(level)) updateData.level = level;
      if (maturity !== undefined && isValidMaturity(maturity))
        updateData.maturity = maturity;
      if (graph !== undefined) updateData.graph = graph as Graph;
      if (parameters !== undefined) updateData.parameters = parameters;
      if (constraints !== undefined) updateData.constraints = constraints;

      const updated = (await sopService.updateSop(sop.id, updateData)) as Sop;

      logger.info('Updated SOP', {
        context: 'sop-update',
        id: sop.id,
      });

      res.json({ data: toEntityData(updated) });
    } catch (error) {
      logger.error(
        'Failed to update SOP',
        error instanceof Error ? error : null,
        {
          context: 'sop-update-error',
          id: req.params['id'],
        }
      );
      res.status(500).json({ error: 'Failed to update SOP' });
    }
  });

  // DELETE /api/sops/:id - Delete SOP
  app.delete('/api/sops/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;

      // Find the SOP first via the service
      let sop: Sop | null = null;
      try {
        sop = (await sopService.getSop(
          req.user!.organizationId,
          id
        )) as Sop | null;
      } catch {
        // ignore
      }

      if (!sop) {
        res.status(404).json({ error: 'SOP not found' });
        return;
      }

      await sopService.deleteSop(sop.id);

      logger.info('Deleted SOP', {
        context: 'sop-delete',
        id: sop.id,
      });

      res.status(204).send();
    } catch (error) {
      logger.error(
        'Failed to delete SOP',
        error instanceof Error ? error : null,
        {
          context: 'sop-delete-error',
          id: req.params['id'],
        }
      );
      res.status(500).json({ error: 'Failed to delete SOP' });
    }
  });
}
