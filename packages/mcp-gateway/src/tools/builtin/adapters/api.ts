import { builtin } from '../../../providers/builtin/index.js';
import type { InternalTool } from '../../../registry.js';

export function buildBuiltinApiTools(): InternalTool[] {
  return [
    {
      definition: {
        name: 'read_file',
        description: 'Read a file from the local filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute or relative file path',
            },
          },
          required: ['path'],
        },
        integration: 'builtin',
        authType: 'none',
        defaultTrust: 'auto',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, _credentials, _context) =>
            builtin.readFile(params['path'] as string),
        },
      ],
    },
    {
      definition: {
        name: 'write_file',
        description: 'Write content to a file on the local filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to write' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'content'],
        },
        integration: 'builtin',
        authType: 'none',
        defaultTrust: 'prompt',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, _credentials, _context) =>
            builtin.writeFile(
              params['path'] as string,
              params['content'] as string
            ),
        },
      ],
    },
    {
      definition: {
        name: 'bash',
        description: 'Run a bash command on the local machine',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The bash command to run' },
          },
          required: ['command'],
        },
        integration: 'builtin',
        authType: 'none',
        defaultTrust: 'prompt',
      },
      adapters: [
        {
          type: 'api',
          execute: (_params, _credentials, _context) =>
            builtin.bash(_params['command'] as string),
        },
      ],
    },
    {
      definition: {
        name: 'search_files',
        description: 'Search for a text pattern in files within a directory',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Text pattern to search for',
            },
            directory: {
              type: 'string',
              description:
                'Directory to search in (default: current directory)',
            },
          },
          required: ['pattern'],
        },
        integration: 'builtin',
        authType: 'none',
        defaultTrust: 'auto',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, _credentials, _context) =>
            builtin.search(
              params['pattern'] as string,
              (params['directory'] as string | undefined) ?? '.'
            ),
        },
      ],
    },
  ];
}
