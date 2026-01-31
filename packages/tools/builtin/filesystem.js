/**
 * Filesystem Tools
 *
 * Tools for reading, writing, and listing files.
 * Respects workspace boundaries for security.
 */

import { readFile, writeFile, readdir, stat, mkdir } from 'fs/promises';
import { join, resolve, relative, dirname } from 'path';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('tools:filesystem');

/**
 * Validate path is within workspace boundaries
 */
function validatePath(filePath, context) {
  const workspaceRoot = context.workspaceRoot || process.cwd();
  const absolutePath = resolve(workspaceRoot, filePath);
  const relativePath = relative(workspaceRoot, absolutePath);

  // Check if path escapes workspace (starts with ..)
  if (relativePath.startsWith('..') || resolve(absolutePath) !== absolutePath) {
    throw new Error(
      `Path "${filePath}" is outside workspace boundaries`
    );
  }

  return absolutePath;
}

/**
 * filesystem.read - Read a file's contents
 */
export const filesystemRead = {
  name: 'filesystem.read',
  description: 'Read the contents of a file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file (relative to workspace root)',
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf-8)',
        default: 'utf-8',
      },
    },
    required: ['path'],
  },

  async execute(params, context = {}) {
    const { path: filePath, encoding = 'utf-8' } = params;

    const absolutePath = validatePath(filePath, context);

    logger.debug(`Reading file: ${absolutePath}`);

    try {
      const content = await readFile(absolutePath, encoding);
      const stats = await stat(absolutePath);

      return {
        content,
        path: absolutePath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      if (error.code === 'EISDIR') {
        throw new Error(`Path is a directory, not a file: ${filePath}`);
      }
      throw error;
    }
  },
};

/**
 * filesystem.write - Write content to a file
 */
export const filesystemWrite = {
  name: 'filesystem.write',
  description: 'Write content to a file (creates parent directories if needed)',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file (relative to workspace root)',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf-8)',
        default: 'utf-8',
      },
      createDirectories: {
        type: 'boolean',
        description: 'Create parent directories if they do not exist',
        default: true,
      },
    },
    required: ['path', 'content'],
  },

  async execute(params, context = {}) {
    const {
      path: filePath,
      content,
      encoding = 'utf-8',
      createDirectories = true,
    } = params;

    const absolutePath = validatePath(filePath, context);

    logger.debug(`Writing file: ${absolutePath}`, {
      size: content.length,
    });

    try {
      // Create parent directories if needed
      if (createDirectories) {
        const dir = dirname(absolutePath);
        await mkdir(dir, { recursive: true });
      }

      await writeFile(absolutePath, content, encoding);
      const stats = await stat(absolutePath);

      return {
        path: absolutePath,
        size: stats.size,
        written: true,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Directory does not exist: ${dirname(filePath)}`);
      }
      throw error;
    }
  },
};

/**
 * filesystem.list - List files and directories
 */
export const filesystemList = {
  name: 'filesystem.list',
  description: 'List files and directories in a path',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to list (relative to workspace root)',
        default: '.',
      },
      recursive: {
        type: 'boolean',
        description: 'List recursively',
        default: false,
      },
      includeHidden: {
        type: 'boolean',
        description: 'Include hidden files (starting with .)',
        default: false,
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum depth for recursive listing',
        default: 3,
      },
    },
    required: [],
  },

  async execute(params, context = {}) {
    const {
      path: dirPath = '.',
      recursive = false,
      includeHidden = false,
      maxDepth = 3,
    } = params;

    const absolutePath = validatePath(dirPath, context);

    logger.debug(`Listing directory: ${absolutePath}`, { recursive, maxDepth });

    async function listDir(currentPath, depth = 0) {
      const entries = await readdir(currentPath, { withFileTypes: true });
      const results = [];

      for (const entry of entries) {
        // Skip hidden files unless requested
        if (!includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        const entryPath = join(currentPath, entry.name);
        const relativePath = relative(absolutePath, entryPath);
        const isDirectory = entry.isDirectory();

        const item = {
          name: entry.name,
          path: relativePath || entry.name,
          type: isDirectory ? 'directory' : 'file',
        };

        // Get file stats for size
        if (!isDirectory) {
          try {
            const stats = await stat(entryPath);
            item.size = stats.size;
            item.modified = stats.mtime.toISOString();
          } catch {
            // Ignore stat errors
          }
        }

        results.push(item);

        // Recurse into directories
        if (recursive && isDirectory && depth < maxDepth) {
          try {
            const children = await listDir(entryPath, depth + 1);
            item.children = children;
          } catch {
            // Ignore permission errors on subdirectories
          }
        }
      }

      return results;
    }

    try {
      const stats = await stat(absolutePath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }

      const entries = await listDir(absolutePath);

      return {
        path: absolutePath,
        entries,
        count: entries.length,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      throw error;
    }
  },
};

// Export all tools as an array for easy registration
export const filesystemTools = [filesystemRead, filesystemWrite, filesystemList];

export default filesystemTools;
