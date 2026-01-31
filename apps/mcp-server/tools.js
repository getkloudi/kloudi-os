/**
 * Tool definitions for lore.dev MCP server
 *
 * Defines the tools exposed via MCP protocol:
 * - lore_list: List available procedures
 * - lore_get: Get procedure by slug
 * - lore_run: Execute a procedure
 * - lore_status: Get execution status
 */

/**
 * Tool definitions with name, description, and input schema
 */
export const tools = {
  lore_list: {
    name: 'lore_list',
    description:
      'List available procedures (standard operating procedures, runbooks, guides). Filter by level (L1-L4) or maturity (draft, active, deprecated).',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          enum: ['L1', 'L2', 'L3', 'L4'],
          description:
            'Filter by procedure level: L1 (simple), L2 (moderate), L3 (complex), L4 (expert)',
        },
        maturity: {
          type: 'string',
          enum: ['draft', 'active', 'deprecated'],
          description: 'Filter by maturity status',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 20)',
        },
      },
    },
  },

  lore_get: {
    name: 'lore_get',
    description:
      'Get detailed information about a specific procedure by its slug. Returns the full procedure content including steps, parameters, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The unique identifier (slug) of the procedure',
        },
      },
      required: ['slug'],
    },
  },

  lore_run: {
    name: 'lore_run',
    description:
      'Execute a procedure with the given parameters. Returns an execution ID that can be used to track status.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The slug of the procedure to execute',
        },
        parameters: {
          type: 'object',
          description: 'Parameters to pass to the procedure',
          additionalProperties: true,
        },
        dryRun: {
          type: 'boolean',
          description:
            'If true, validate the procedure without executing it (default: false)',
        },
      },
      required: ['slug'],
    },
  },

  lore_status: {
    name: 'lore_status',
    description:
      'Get the status of a procedure execution. Returns current state, progress, and any outputs.',
    inputSchema: {
      type: 'object',
      properties: {
        executionId: {
          type: 'string',
          description: 'The execution ID returned from lore_run',
        },
      },
      required: ['executionId'],
    },
  },
};

/**
 * In-memory store for executions (replace with database in production)
 */
const executionStore = new Map();

/**
 * Mock procedures for demo (replace with database queries)
 */
const mockProcedures = [
  {
    slug: 'deploy-frontend',
    name: 'Deploy Frontend Application',
    description: 'Standard procedure for deploying frontend applications to production',
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
    description: 'Standard operating procedure for handling production incidents',
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
 * Tool handlers - implement the actual logic for each tool
 */
export const handlers = {
  /**
   * List procedures with optional filters
   */
  async lore_list({ level, maturity, limit = 20 }) {
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
          type: 'text',
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
  },

  /**
   * Get a specific procedure by slug
   */
  async lore_get({ slug }) {
    const procedure = mockProcedures.find((p) => p.slug === slug);

    if (!procedure) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Procedure not found: ${slug}` }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(procedure, null, 2),
        },
      ],
    };
  },

  /**
   * Execute a procedure
   */
  async lore_run({ slug, parameters = {}, dryRun = false }) {
    const procedure = mockProcedures.find((p) => p.slug === slug);

    if (!procedure) {
      return {
        content: [
          {
            type: 'text',
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
            type: 'text',
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
            type: 'text',
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
          type: 'text',
          text: JSON.stringify({
            executionId,
            status: 'running',
            procedure: slug,
            message: `Execution started. Use lore_status with executionId "${executionId}" to track progress.`,
          }),
        },
      ],
    };
  },

  /**
   * Get execution status
   */
  async lore_status({ executionId }) {
    const execution = executionStore.get(executionId);

    if (!execution) {
      return {
        content: [
          {
            type: 'text',
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
          type: 'text',
          text: JSON.stringify(execution, null, 2),
        },
      ],
    };
  },
};

/**
 * Register all tools on the MCP server
 */
export function registerTools(server) {
  for (const [name, tool] of Object.entries(tools)) {
    server.tool(name, tool.description, tool.inputSchema, handlers[name]);
  }
}
