/**
 * Trust Gate Tests
 *
 * Tests the trust gate system: approve/reject flows, auto-approve when no
 * callback, TrustGateContext shape, and concurrency behavior.
 *
 * Requires: Postgres running, ANTHROPIC_API_KEY set in .env
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.test first, falling back to .env
const envTestPath = resolve(process.cwd(), '.env.test');
const envPath = resolve(process.cwd(), '.env');
const envFile = (() => {
  try {
    readFileSync(envTestPath, 'utf8');
    return envTestPath;
  } catch {
    return envPath;
  }
})();
try {
  const envContent = readFileSync(envFile, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {
  // .env file not found — rely on existing env vars
}

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY not set — cannot run trust gate tests');
}

const WORKSPACE_ID = 'test-trust-gate';

let engine;
let db;

async function waitForExecution(executionId, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const execution = await db.execution.findUnique({
      where: { id: executionId },
      include: { executionNodes: { orderBy: { startedAt: 'asc' } } },
    });
    if (
      execution &&
      ['completed', 'failed', 'cancelled'].includes(execution.status)
    ) {
      return execution;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Execution ${executionId} did not complete within ${timeoutMs}ms`
  );
}

async function createProcedure(data) {
  return db.procedure.create({
    data: {
      slug: data.slug,
      name: data.name,
      description: data.description ?? '',
      level: 'task',
      maturity: 'curated',
      graph: data.graph,
      parameters: data.parameters ?? {},
      constraints: {},
      workspaceId: WORKSPACE_ID,
    },
  });
}

beforeAll(async () => {
  const { ExecutionEngine } =
    await import('../../dist/execution/execution-engine.js');
  const { ContextManager } =
    await import('../../dist/execution/context-manager.js');
  const { LLMExecutor } =
    await import('../../dist/execution/executors/llm-executor.js');
  const { ToolCallExecutor } =
    await import('../../dist/execution/executors/tool-call-executor.js');
  const { InterpolativeExecutor } =
    await import('../../dist/execution/executors/interpolative-executor.js');
  const { SubEntityExecutor } =
    await import('../../dist/execution/executors/sub-entity-executor.js');
  const { ProcedureService } =
    await import('../../dist/procedures/procedure-service.js');
  const { Database } = await import('@kloudi/infrastructure/database');
  const { AIClient } = await import('@kloudi/infrastructure/ai');
  const { ToolRegistry } = await import('@kloudi/tools');

  const dbManager = Database.getInstance();
  db = await dbManager.getClient();

  const aiClient = new AIClient({
    context: 'trust-gate-test',
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
  });

  const registry = ToolRegistry.getInstance();

  // Register a test echo tool
  registry.register({
    name: 'test.echo',
    description: 'Echo input for testing',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async (params) => ({ echoed: params }),
  });

  const contextManager = new ContextManager();
  const procedureService = new ProcedureService();

  const executors = new Map([
    ['llm_generate', new LLMExecutor(aiClient, contextManager)],
    ['tool_call', new ToolCallExecutor(() => registry)],
    ['interpolative', new InterpolativeExecutor(aiClient, contextManager)],
    ['sub_entity', new SubEntityExecutor(procedureService)],
  ]);

  engine = new ExecutionEngine(executors, contextManager);
});

afterAll(async () => {
  if (!db) return;
  try {
    await db.executionNode.deleteMany({
      where: { execution: { workspaceId: WORKSPACE_ID } },
    });
    await db.execution.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
    await db.procedure.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  } catch {
    // ignore cleanup errors
  }
  const { Database } = await import('@kloudi/infrastructure/database');
  await Database.getInstance().disconnect();
});

// ============================================================
// HELPER: make a procedure with an LLM node → gated tool_call
// ============================================================
function gatedToolGraph(slug, opts = {}) {
  return {
    slug,
    name: opts.name ?? 'Trust Gate Test',
    graph: {
      nodes: [
        {
          id: 'llm_step',
          type: 'llm_generate',
          name: 'Think',
          config: { prompt_template: 'Say "ready". Just the word.' },
        },
        {
          id: 'tool_step',
          type: 'tool_call',
          name: opts.toolName ?? 'Echo Tool',
          config: {
            tool_name: 'test.echo',
            parameters: { message: '{{llm_step}}' },
            requiresApproval: opts.requiresApproval ?? true,
          },
        },
      ],
      edges: [{ from: 'llm_step', to: 'tool_step' }],
    },
  };
}

// ============================================================
// 1. TRUST GATE — APPROVE FLOW
// ============================================================
describe('Trust gate — approve flow', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure(gatedToolGraph('tg-approve'));
  });

  it('completes when trust gate is approved', async () => {
    let gateCalled = false;

    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID,
      {
        onTrustGateTriggered: async (_ctx) => {
          gateCalled = true;
          return 'approve';
        },
      }
    );

    const execution = await waitForExecution(executionId);

    expect(execution.status).toBe('completed');
    expect(gateCalled).toBe(true);
    expect(execution.executionNodes.length).toBeGreaterThanOrEqual(2);

    const toolNode = execution.executionNodes.find(
      (n) => n.nodeId === 'tool_step'
    );
    expect(toolNode).toBeDefined();
    expect(toolNode.status).toBe('completed');
  }, 60000);
});

// ============================================================
// 2. TRUST GATE — REJECT FLOW
// ============================================================
describe('Trust gate — reject flow', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure(gatedToolGraph('tg-reject'));
  });

  it('fails when trust gate is rejected', async () => {
    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID,
      {
        onTrustGateTriggered: async () => 'reject',
      }
    );

    const execution = await waitForExecution(executionId);

    expect(execution.status).toBe('failed');
    expect(execution.error).toContain('Trust gate rejected');

    const llmNode = execution.executionNodes.find(
      (n) => n.nodeId === 'llm_step'
    );
    expect(llmNode.status).toBe('completed');
  }, 60000);
});

// ============================================================
// 3. TRUST GATE — NO CALLBACK (AUTO-APPROVE)
// ============================================================
describe('Trust gate — no callback registered', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure(gatedToolGraph('tg-no-callback'));
  });

  it('auto-approves when no onTrustGateTriggered callback', async () => {
    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID
      // No onTrustGateTriggered callback
    );

    const execution = await waitForExecution(executionId);

    expect(execution.status).toBe('completed');
    expect(execution.executionNodes.length).toBeGreaterThanOrEqual(2);
  }, 60000);
});

// ============================================================
// 4. NON-GATED TOOL_CALL — CALLBACK NOT INVOKED
// ============================================================
describe('Trust gate — non-gated tool_call', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure(
      gatedToolGraph('tg-non-gated', { requiresApproval: false })
    );
  });

  it('does not invoke callback when requiresApproval is false', async () => {
    let gateCalled = false;

    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID,
      {
        onTrustGateTriggered: async () => {
          gateCalled = true;
          return 'approve';
        },
      }
    );

    const execution = await waitForExecution(executionId);

    expect(execution.status).toBe('completed');
    expect(gateCalled).toBe(false);
  }, 60000);
});

// ============================================================
// 5. TRUST GATE CONTEXT SHAPE
// ============================================================
describe('Trust gate — TrustGateContext shape', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure(
      gatedToolGraph('tg-context-shape', { toolName: 'Echo Tool Check' })
    );
  });

  it('passes correct TrustGateContext to callback', async () => {
    let capturedContext = null;

    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID,
      {
        onTrustGateTriggered: async (ctx) => {
          capturedContext = ctx;
          return 'approve';
        },
      }
    );

    await waitForExecution(executionId);

    expect(capturedContext).not.toBeNull();
    expect(typeof capturedContext.executionId).toBe('string');
    expect(capturedContext.nodeId).toBe('tool_step');
    expect(capturedContext.nodeName).toBe('Echo Tool Check');
    expect(capturedContext.nodeType).toBe('tool_call');
    expect(capturedContext.action).toContain('test.echo');
    expect(typeof capturedContext.config).toBe('object');
    expect(capturedContext.visitCount).toBe(1);
  }, 60000);
});

// ============================================================
// 6. WAITING_INPUT NOT COUNTED FOR CONCURRENCY
// ============================================================
describe('Trust gate — waiting_input concurrency', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure(gatedToolGraph('tg-concurrency'));
  });

  it('allows new execution while another is waiting at trust gate', async () => {
    let secondStarted = false;

    const { executionId: firstId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID,
      {
        onTrustGateTriggered: async () => {
          // While first execution is paused at gate, start second
          try {
            const { executionId: secondId } = await engine.execute(
              procedure.id,
              {},
              WORKSPACE_ID,
              {
                onTrustGateTriggered: async () => 'approve',
              },
              { concurrencyLimit: 1 }
            );
            secondStarted = true;
            await waitForExecution(secondId);
          } catch {
            secondStarted = false;
          }
          return 'approve';
        },
      },
      { concurrencyLimit: 1 }
    );

    await waitForExecution(firstId);

    expect(secondStarted).toBe(true);
  }, 120000);
});
