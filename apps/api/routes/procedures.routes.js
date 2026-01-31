/**
 * Procedures API Routes
 *
 * CRUD operations for lore.dev procedures.
 * Backed by ProcedureService (Prisma-backed).
 */

import { ProcedureService } from '@kloudi/core';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('procedures-routes');

const DEFAULT_WORKSPACE_ID = 'default-workspace';

const procedureService = new ProcedureService();

/**
 * Convert a Procedure DB record to EntityData shape for the frontend.
 * Maps `level` -> `type` and derives `content` from `graph.content`.
 */
function toEntityData(procedure) {
  return {
    id: procedure.id,
    name: procedure.name,
    type: procedure.level,
    description: procedure.description || '',
    content: procedure.graph?.content || procedure.description || '',
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
function toTreeNodes(procedures) {
  const groups = { guide: [], skill: [], project: [], task: [] };

  for (const p of procedures) {
    const node = { id: p.id, name: p.name, type: p.level, slug: p.slug };
    if (groups[p.level]) {
      groups[p.level].push(node);
    }
  }

  const tree = [];

  if (groups.guide.length) {
    tree.push({
      id: 'guides',
      name: 'Guides',
      type: 'folder',
      children: groups.guide,
    });
  }

  if (groups.skill.length) {
    tree.push({
      id: 'skills',
      name: 'Skills',
      type: 'folder',
      children: groups.skill,
    });
  }

  if (groups.project.length || groups.task.length) {
    const projects = groups.project.map((p) => ({
      ...p,
      children: groups.task,
    }));

    // If there are tasks but no projects, put tasks directly in the folder
    if (projects.length === 0 && groups.task.length) {
      tree.push({
        id: 'tasks',
        name: 'Tasks',
        type: 'folder',
        children: groups.task,
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
function toCommandItem(procedure) {
  return {
    id: procedure.id,
    name: procedure.name,
    type: procedure.level,
    description: procedure.description || '',
    slug: procedure.slug,
  };
}

export function setupRoutes(app) {
  // GET /api/procedures - List procedures as tree structure
  app.get('/api/procedures', async (req, res) => {
    try {
      const { level, maturity, format } = req.query;

      const options = { limit: 100, offset: 0 };
      if (level) {
        options.level = level;
      }

      const results = await procedureService.listProcedures(
        DEFAULT_WORKSPACE_ID,
        options
      );

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
        return res.json({ data, total: data.length });
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
      logger.error('Failed to list procedures', error, {
        context: 'procedures-list-error',
      });
      res.status(500).json({ error: 'Failed to list procedures' });
    }
  });

  // GET /api/procedures/search - Search procedures for omnibox
  app.get('/api/procedures/search', async (req, res) => {
    try {
      const { q = '', limit = 20 } = req.query;

      const results = await procedureService.searchProcedures(
        DEFAULT_WORKSPACE_ID,
        q,
        { limit: parseInt(limit, 10) }
      );

      const data = results.map(toCommandItem);

      logger.info('Searched procedures', {
        context: 'procedures-search',
        query: q,
        count: data.length,
      });

      res.json({ data, total: data.length });
    } catch (error) {
      logger.error('Failed to search procedures', error, {
        context: 'procedures-search-error',
      });
      res.status(500).json({ error: 'Failed to search procedures' });
    }
  });

  // GET /api/procedures/:id - Get procedure by ID (returns EntityData)
  app.get('/api/procedures/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // Try to find by ID first via the repository directly
      let procedure;
      try {
        procedure = await procedureService.repository.findById(id);
      } catch {
        // Ignore - will try slug next
      }

      // Fallback: try by slug
      if (!procedure) {
        try {
          procedure = await procedureService.getProcedure(
            DEFAULT_WORKSPACE_ID,
            id
          );
        } catch {
          // Not found by slug either
        }
      }

      if (!procedure) {
        return res.status(404).json({ error: 'Procedure not found' });
      }

      const data = toEntityData(procedure);

      logger.info('Retrieved procedure', {
        context: 'procedure-get',
        id,
      });

      res.json({ data });
    } catch (error) {
      logger.error('Failed to get procedure', error, {
        context: 'procedure-get-error',
        id: req.params.id,
      });
      res.status(500).json({ error: 'Failed to get procedure' });
    }
  });

  // POST /api/procedures - Create procedure
  app.post('/api/procedures', async (req, res) => {
    try {
      const { slug, name, description, level, graph, parameters, constraints } =
        req.body;

      if (!slug || !name) {
        return res.status(400).json({ error: 'slug and name are required' });
      }

      const procedure = await procedureService.createProcedure(
        DEFAULT_WORKSPACE_ID,
        {
          slug,
          name,
          description: description || '',
          level: level || 'task',
          graph: graph || { nodes: [], edges: [] },
          parameters: parameters || {},
          constraints: constraints || {},
        }
      );

      logger.info('Created procedure', {
        context: 'procedure-create',
        slug,
      });

      res.status(201).json({ data: toEntityData(procedure) });
    } catch (error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }
      logger.error('Failed to create procedure', error, {
        context: 'procedure-create-error',
      });
      res.status(500).json({ error: 'Failed to create procedure' });
    }
  });

  // PUT /api/procedures/:id - Update procedure
  app.put('/api/procedures/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, level, maturity, graph, parameters, constraints } =
        req.body;

      // Find the procedure first - try by ID then by slug
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

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (level !== undefined) updateData.level = level;
      if (maturity !== undefined) updateData.maturity = maturity;
      if (graph !== undefined) updateData.graph = graph;
      if (parameters !== undefined) updateData.parameters = parameters;
      if (constraints !== undefined) updateData.constraints = constraints;

      const updated = await procedureService.updateProcedure(
        procedure.id,
        updateData
      );

      logger.info('Updated procedure', {
        context: 'procedure-update',
        id: procedure.id,
      });

      res.json({ data: toEntityData(updated) });
    } catch (error) {
      logger.error('Failed to update procedure', error, {
        context: 'procedure-update-error',
        id: req.params.id,
      });
      res.status(500).json({ error: 'Failed to update procedure' });
    }
  });

  // DELETE /api/procedures/:id - Delete procedure
  app.delete('/api/procedures/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // Find the procedure first - try by ID then by slug
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

      await procedureService.deleteProcedure(procedure.id);

      logger.info('Deleted procedure', {
        context: 'procedure-delete',
        id: procedure.id,
      });

      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete procedure', error, {
        context: 'procedure-delete-error',
        id: req.params.id,
      });
      res.status(500).json({ error: 'Failed to delete procedure' });
    }
  });
}
