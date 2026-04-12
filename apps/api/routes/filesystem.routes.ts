/**
 * Filesystem API Routes
 *
 * Virtual filesystem access for lore.dev.
 * Provides ls and cat functionality via REST API.
 */

import type { Application, Request, Response } from 'express';
import { Logger } from '@kloudi/shared/logger';
import fs from 'fs';
import path from 'path';

const logger = Logger.getInstance('filesystem-routes');

// Base directory for virtual filesystem (configurable)
const BASE_DIR = process.env['LORE_FS_BASE'] ?? process.cwd();

interface FileItem {
  name: string;
  type: 'directory' | 'file';
  size: number;
  modified: string;
}

// Normalize and validate path within base directory
function resolveSafePath(requestedPath: string | undefined): string | null {
  const normalized = path.normalize(requestedPath ?? '/');
  const fullPath = path.join(BASE_DIR, normalized);

  // Ensure path is within base directory (prevent directory traversal)
  if (!fullPath.startsWith(BASE_DIR)) {
    return null;
  }

  return fullPath;
}

export function setupRoutes(app: Application): void {
  // GET /api/fs/* - List or read path using route handler with req.path
  app.get(/^\/api\/fs\/(.*)$/, async (req: Request, res: Response) => {
    try {
      // Extract path from regex match
      const requestedPath = req.params[0] ?? '';
      const fullPath = resolveSafePath(requestedPath);

      if (!fullPath) {
        res.status(403).json({ error: 'Access denied: invalid path' });
        return;
      }

      // Check if path exists
      if (!fs.existsSync(fullPath)) {
        res.status(404).json({ error: 'Path not found' });
        return;
      }

      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        // Directory listing (ls)
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const items: FileItem[] = entries.map((entry) => {
          const itemPath = path.join(fullPath, entry.name);
          const itemStats = fs.statSync(itemPath);
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: itemStats.size,
            modified: itemStats.mtime.toISOString(),
          };
        });

        logger.info('Listed directory', {
          context: 'fs-list',
          path: requestedPath,
          count: items.length,
        });

        res.json({
          type: 'directory',
          path: requestedPath || '/',
          data: items,
        });
      } else {
        // File content (cat)
        const maxSize = 1024 * 1024; // 1MB limit
        if (stats.size > maxSize) {
          res.status(413).json({
            error: 'File too large',
            size: stats.size,
            maxSize,
          });
          return;
        }

        const content = fs.readFileSync(fullPath, 'utf-8');
        const extension = path.extname(fullPath).slice(1);

        logger.info('Read file', {
          context: 'fs-read',
          path: requestedPath,
          size: stats.size,
        });

        res.json({
          type: 'file',
          path: requestedPath,
          extension,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          content,
        });
      }
    } catch (error) {
      logger.error(
        'Filesystem operation failed',
        error instanceof Error ? error : null,
        {
          context: 'fs-error',
          path: req.params['path'],
        }
      );
      res.status(500).json({ error: 'Filesystem operation failed' });
    }
  });

  // GET /api/fs - Root listing
  app.get('/api/fs', async (_req: Request, res: Response) => {
    try {
      const entries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
      const items: FileItem[] = entries.map((entry) => {
        const itemPath = path.join(BASE_DIR, entry.name);
        const itemStats = fs.statSync(itemPath);
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: itemStats.size,
          modified: itemStats.mtime.toISOString(),
        };
      });

      logger.info('Listed root directory', {
        context: 'fs-list-root',
        count: items.length,
      });

      res.json({
        type: 'directory',
        path: '/',
        data: items,
      });
    } catch (error) {
      logger.error(
        'Root listing failed',
        error instanceof Error ? error : null,
        {
          context: 'fs-root-error',
        }
      );
      res.status(500).json({ error: 'Failed to list root directory' });
    }
  });
}
