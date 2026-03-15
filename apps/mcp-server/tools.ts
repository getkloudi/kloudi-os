/**
 * Tool definitions for lore.dev MCP server
 *
 * Defines the tools exposed via MCP protocol:
 * - lore_list: List available procedures
 * - lore_get: Get procedure by slug
 * - lore_run: Execute a procedure
 * - lore_status: Get execution status
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Zod schemas for tool inputs
 */
const loreListSchema = {
  level: z
    .enum(['L1', 'L2', 'L3', 'L4'])
    .optional()
    .describe(
      'Filter by procedure level: L1 (simple), L2 (moderate), L3 (complex), L4 (expert)'
    ),
  maturity: z
    .enum(['draft', 'active', 'deprecated'])
    .optional()
    .describe('Filter by maturity status'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of results to return (default: 20)'),
};

const loreGetSchema = {
  slug: z.string().describe('The unique identifier (slug) of the procedure'),
};

const loreRunSchema = {
  slug: z.string().describe('The slug of the procedure to execute'),
  parameters: z
    .record(z.unknown())
    .optional()
    .describe('Parameters to pass to the procedure'),
  dryRun: z
    .boolean()
    .optional()
    .describe(
      'If true, validate the procedure without executing it (default: false)'
    ),
};

const loreStatusSchema = {
  executionId: z.string().describe('The execution ID returned from lore_run'),
};

/**
 * Type definitions inferred from Zod schemas
 * Note: Optional properties include 'undefined' to match exactOptionalPropertyTypes
 */
type LoreListParams = {
  level?: 'L1' | 'L2' | 'L3' | 'L4' | undefined;
  maturity?: 'draft' | 'active' | 'deprecated' | undefined;
  limit?: number | undefined;
};

type LoreGetParams = {
  slug: string;
};

type LoreRunParams = {
  slug: string;
  parameters?: Record<string, unknown> | undefined;
  dryRun?: boolean | undefined;
};

type LoreStatusParams = {
  executionId: string;
};

/**
 * Tool descriptions
 */
const toolDescriptions = {
  lore_list:
    'List available procedures (standard operating procedures, runbooks, guides). Filter by level (L1-L4) or maturity (draft, active, deprecated).',
  lore_get:
    'Get detailed information about a specific procedure by its slug. Returns the full procedure content including steps, parameters, and metadata.',
  lore_run:
    'Execute a procedure with the given parameters. Returns an execution ID that can be used to track status.',
  lore_status:
    'Get the status of a procedure execution. Returns current state, progress, and any outputs.',
};

/**
 * In-memory store for executions (replace with database in production)
 */
const executionStore = new Map<
  string,
  {
    id: string;
    procedure: string;
    parameters: Record<string, unknown>;
    status: string;
    currentStep: number;
    totalSteps: number;
    startedAt: string;
    completedAt?: string;
    outputs: Array<{ step: number; action: string; result: string }>;
  }
>();

/**
 * Mock procedures for demo (replace with database queries)
 */
const mockProcedures = [
  {
    slug: 'deploy-frontend',
    name: 'Deploy Frontend Application',
    description:
      'Standard procedure for deploying frontend applications to production',
    level: 'L2',
    maturity: 'active',
    parameters: [
      { name: 'environment', type: 'string', required: true },
      { name: 'version', type: 'string', required: true },
    ],
    steps: [
      'Run pre-deployment checks',
      'Build application with production config',
      'Upload assets to CDN',
      'Update DNS records',
      'Verify deployment health',
    ],
  },
  {
    slug: 'incident-response',
    name: 'Incident Response Runbook',
    description:
      'Standard operating procedure for handling production incidents',
    level: 'L3',
    maturity: 'active',
    parameters: [
      { name: 'severity', type: 'string', required: true },
      { name: 'service', type: 'string', required: true },
    ],
    steps: [
      'Acknowledge incident and assign owner',
      'Assess impact and severity',
      'Begin investigation',
      'Implement mitigation',
      'Document findings',
      'Schedule post-mortem',
    ],
  },
  {
    slug: 'database-migration',
    name: 'Database Migration Guide',
    description: 'Safe procedure for running database migrations',
    level: 'L4',
    maturity: 'active',
    parameters: [
      { name: 'database', type: 'string', required: true },
      { name: 'migrationFile', type: 'string', required: true },
      { name: 'backup', type: 'boolean', required: false },
    ],
    steps: [
      'Create database backup',
      'Review migration SQL',
      'Test on staging',
      'Apply migration with transaction',
      'Verify data integrity',
      'Update application config',
    ],
  },
  {
    slug: 'onboarding-checklist',
    name: 'New Developer Onboarding',
    description: 'Checklist for onboarding new team members',
    level: 'L1',
    maturity: 'draft',
    parameters: [
      { name: 'employeeName', type: 'string', required: true },
      { name: 'team', type: 'string', required: true },
    ],
    steps: [
      'Create accounts (GitHub, Slack, email)',
      'Setup development environment',
      'Review codebase documentation',
      'Assign buddy mentor',
      'Schedule intro meetings',
    ],
  },
];

/**
 * Tool handler implementations
 */
async function handleLoreList({ level, maturity, limit = 20 }: LoreListParams) {
  let results = [...mockProcedures];

  if (level) {
    results = results.filter((p) => p.level === level);
  }

  if (maturity) {
    results = results.filter((p) => p.maturity === maturity);
  }

  results = results.slice(0, limit);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            procedures: results.map((p) => ({
              slug: p.slug,
              name: p.name,
              description: p.description,
              level: p.level,
              maturity: p.maturity,
            })),
            total: results.length,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleLoreGet({ slug }: LoreGetParams) {
  const procedure = mockProcedures.find((p) => p.slug === slug);

  if (!procedure) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: `Procedure not found: ${slug}` }),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(procedure, null, 2),
      },
    ],
  };
}

async function handleLoreRun({
  slug,
  parameters = {},
  dryRun = false,
}: LoreRunParams) {
  const procedure = mockProcedures.find((p) => p.slug === slug);

  if (!procedure) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: `Procedure not found: ${slug}` }),
        },
      ],
      isError: true,
    };
  }

  // Validate required parameters
  const missingParams = procedure.parameters
    .filter((p) => p.required && !(p.name in parameters))
    .map((p) => p.name);

  if (missingParams.length > 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: `Missing required parameters: ${missingParams.join(', ')}`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (dryRun) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            dryRun: true,
            valid: true,
            procedure: slug,
            parameters,
            steps: procedure.steps,
          }),
        },
      ],
    };
  }

  // Create execution record
  const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  executionStore.set(executionId, {
    id: executionId,
    procedure: slug,
    parameters,
    status: 'running',
    currentStep: 0,
    totalSteps: procedure.steps.length,
    startedAt: new Date().toISOString(),
    outputs: [],
  });

  // Simulate async execution (in production, this would trigger actual workflow)
  setTimeout(() => {
    const execution = executionStore.get(executionId);
    if (execution) {
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      execution.outputs = procedure.steps.map((step, i) => ({
        step: i + 1,
        action: step,
        result: 'success',
      }));
    }
  }, 2000);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          executionId,
          status: 'running',
          procedure: slug,
          message: `Execution started. Use lore_status with executionId "${executionId}" to track progress.`,
        }),
      },
    ],
  };
}

async function handleLoreStatus({ executionId }: LoreStatusParams) {
  const execution = executionStore.get(executionId);

  if (!execution) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: `Execution not found: ${executionId}`,
          }),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(execution, null, 2),
      },
    ],
  };
}

/**
 * Register all tools on the MCP server
 */
export function registerTools(server: McpServer): void {
  // Register lore_list tool
  server.registerTool(
    'lore_list',
    {
      description: toolDescriptions.lore_list,
      inputSchema: loreListSchema,
    },
    handleLoreList
  );

  // Register lore_get tool
  server.registerTool(
    'lore_get',
    {
      description: toolDescriptions.lore_get,
      inputSchema: loreGetSchema,
    },
    handleLoreGet
  );

  // Register lore_run tool
  server.registerTool(
    'lore_run',
    {
      description: toolDescriptions.lore_run,
      inputSchema: loreRunSchema,
    },
    handleLoreRun
  );

  // Register lore_status tool
  server.registerTool(
    'lore_status',
    {
      description: toolDescriptions.lore_status,
      inputSchema: loreStatusSchema,
    },
    handleLoreStatus
  );
}
