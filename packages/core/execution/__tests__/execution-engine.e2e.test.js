/**
 * ExecutionEngine E2E Tests
 *
 * Real database, real LLM calls (Anthropic Haiku), real tool execution.
 * No mocks. Tests the full execution pipeline end-to-end.
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

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
const describeIfKey = hasApiKey ? describe : describe.skip;

const WORKSPACE_ID = 'test-workspace-e2e';

let engine;
let db;
let ContextManager;
let getNestedValue;

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
      organizationId: WORKSPACE_ID,
    },
  });
}

beforeAll(async () => {
  // Dynamic imports after env is loaded
  const { ExecutionEngine } =
    await import('../../dist/execution/execution-engine.js');
  const CM = await import('../../dist/execution/context-manager.js');
  ContextManager = CM.ContextManager;
  const { LLMExecutor } =
    await import('../../dist/execution/executors/llm-executor.js');
  const { ToolCallExecutor } =
    await import('../../dist/execution/executors/tool-call-executor.js');
  const { InterpolativeExecutor } =
    await import('../../dist/execution/executors/interpolative-executor.js');
  const { SubEntityExecutor } =
    await import('../../dist/execution/executors/sub-entity-executor.js');
  const { getNestedValue: gnv } =
    await import('../../dist/execution/resolve-path.js');
  getNestedValue = gnv;
  const { ProcedureService } =
    await import('../../dist/procedures/procedure-service.js');
  const { Database } = await import('@kloudi/infrastructure/database');
  const { AIClient } = await import('@kloudi/infrastructure/ai');
  const { ToolRegistry } = await import('@kloudi/tools');

  const dbManager = Database.getInstance();
  db = await dbManager.getClient();

  const aiClient = new AIClient({
    context: 'e2e-test',
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
  });

  const registry = ToolRegistry.getInstance();
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
      where: { execution: { organizationId: WORKSPACE_ID } },
    });
    await db.execution.deleteMany({ where: { organizationId: WORKSPACE_ID } });
    await db.procedure.deleteMany({ where: { organizationId: WORKSPACE_ID } });
  } catch (_e) {
    // ignore cleanup errors
  }
  const { Database } = await import('@kloudi/infrastructure/database');
  await Database.getInstance().disconnect();
});

// ============================================================
// 1. SINGLE LLM NODE
// ============================================================
describeIfKey('Single LLM node execution', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure({
      slug: 'e2e-single-llm',
      name: 'Single LLM Test',
      description: 'A single LLM node that answers a question',
      graph: {
        nodes: [
          {
            id: 'ask',
            type: 'llm_generate',
            name: 'Answer Question',
            config: {
              prompt_template: 'What is 2 + 2? Reply with just the number.',
            },
          },
        ],
        edges: [],
      },
    });
  });

  it('executes a single LLM node and completes', async () => {
    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID
    );
    expect(executionId).toBeDefined();

    const execution = await waitForExecution(executionId);

    expect(execution.status).toBe('completed');
    expect(execution.result).toBeDefined();
    expect(execution.durationMs).toBeGreaterThan(0);
    expect(execution.tokensUsed).toBeGreaterThan(0);
    expect(execution.executionNodes).toHaveLength(1);
    expect(execution.executionNodes[0].status).toBe('completed');
    expect(execution.executionNodes[0].nodeId).toBe('ask');
    expect(execution.executionNodes[0].output).toBeDefined();
    // The output should contain "4"
    expect(String(execution.executionNodes[0].output)).toContain('4');
  }, 30000);
});

// ============================================================
// 2. LINEAR GRAPH — A → B → C with variable passing
// ============================================================
describeIfKey('Linear 3-node graph with variable interpolation', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure({
      slug: 'e2e-linear-graph',
      name: 'Linear Graph Test',
      graph: {
        nodes: [
          {
            id: 'step1',
            type: 'llm_generate',
            name: 'Generate a color',
            config: {
              prompt_template:
                'Name one color. Reply with just the color name, nothing else.',
            },
          },
          {
            id: 'step2',
            type: 'llm_generate',
            name: 'Use the color',
            config: {
              prompt_template:
                'The color is: {{step1}}. Name an object commonly this color. Reply with just the object name.',
            },
          },
          {
            id: 'step3',
            type: 'llm_generate',
            name: 'Summarize',
            config: {
              prompt_template:
                'Color: {{step1}}, Object: {{step2}}. Write one sentence combining these.',
            },
          },
        ],
        edges: [
          { from: 'step1', to: 'step2' },
          { from: 'step2', to: 'step3' },
        ],
      },
    });
  });

  it('traverses A→B→C, passes variables between nodes', async () => {
    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID
    );
    const execution = await waitForExecution(executionId);

    expect(execution.status).toBe('completed');
    expect(execution.executionNodes).toHaveLength(3);
    expect(execution.executionNodes[0].nodeId).toBe('step1');
    expect(execution.executionNodes[1].nodeId).toBe('step2');
    expect(execution.executionNodes[2].nodeId).toBe('step3');

    for (const node of execution.executionNodes) {
      expect(node.status).toBe('completed');
      expect(node.output).toBeDefined();
      expect(node.durationMs).toBeGreaterThan(0);
    }

    const variables = execution.variables;
    expect(variables['step1']).toBeDefined();
    expect(variables['step2']).toBeDefined();
    expect(variables['step3']).toBeDefined();
    expect(execution.tokensUsed).toBeGreaterThan(0);
  }, 90000);
});

// ============================================================
// 3. INTERPOLATIVE DECISION NODE
// ============================================================
describeIfKey('Interpolative decision node', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure({
      slug: 'e2e-interpolative',
      name: 'Decision Test',
      graph: {
        nodes: [
          {
            id: 'decide',
            type: 'interpolative',
            name: 'Pick a direction',
            config: {
              decision_prompt:
                'You are at a fork. You MUST pick exactly one of the options below. Respond ONLY with valid JSON.',
              options: ['north', 'south'],
              reasoning_required: false,
            },
          },
          {
            id: 'north_result',
            type: 'llm_generate',
            name: 'North path',
            config: {
              prompt_template:
                'You went north. Describe what you see in one sentence.',
            },
          },
          {
            id: 'south_result',
            type: 'llm_generate',
            name: 'South path',
            config: {
              prompt_template:
                'You went south. Describe what you see in one sentence.',
            },
          },
        ],
        edges: [
          { from: 'decide', to: 'north_result' },
          { from: 'decide', to: 'south_result' },
        ],
      },
    });
  });

  it('makes a decision and follows the chosen path', async () => {
    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID
    );
    const execution = await waitForExecution(executionId);

    expect(execution.status).toBe('completed');
    expect(execution.executionNodes).toHaveLength(2);

    const decisionNode = execution.executionNodes[0];
    expect(decisionNode.nodeId).toBe('decide');
    expect(decisionNode.status).toBe('completed');
    expect(decisionNode.decisionTrace).toBeDefined();

    const resultNode = execution.executionNodes[1];
    expect(['north_result', 'south_result']).toContain(resultNode.nodeId);
    expect(resultNode.status).toBe('completed');
  }, 60000);
});

// ============================================================
// 4. PARAMETER INTERPOLATION
// ============================================================
describeIfKey('Parameter interpolation from run params', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure({
      slug: 'e2e-params',
      name: 'Param Test',
      graph: {
        nodes: [
          {
            id: 'greet',
            type: 'llm_generate',
            name: 'Greet user',
            config: {
              prompt_template: 'Say hello to {{user_name}} in one sentence.',
            },
          },
        ],
        edges: [],
      },
    });
  });

  it('interpolates runtime parameters into prompts', async () => {
    const { executionId } = await engine.execute(
      procedure.id,
      { user_name: 'Nitish' },
      WORKSPACE_ID
    );
    const execution = await waitForExecution(executionId);

    expect(execution.status).toBe('completed');
    const output = String(execution.executionNodes[0].output);
    expect(output.toLowerCase()).toContain('nitish');
  }, 30000);
});

// ============================================================
// 5. MISSING VARIABLE — fails gracefully
// ============================================================
describeIfKey('Missing variable interpolation', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure({
      slug: 'e2e-missing-var',
      name: 'Missing Var Test',
      graph: {
        nodes: [
          {
            id: 'use_missing',
            type: 'llm_generate',
            name: 'Use missing var',
            config: { prompt_template: 'The value is: {{nonexistent_var}}' },
          },
        ],
        edges: [],
      },
    });
  });

  it('fails with descriptive error when variable not found', async () => {
    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID
    );
    const execution = await waitForExecution(executionId);

    expect(execution.status).toBe('failed');
    expect(execution.error).toContain('nonexistent_var');
    expect(execution.error).toContain('not found');
  }, 15000);
});

// ============================================================
// 6. CONCURRENCY LIMIT
// ============================================================
describeIfKey('Concurrency limit enforcement', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure({
      slug: 'e2e-concurrency',
      name: 'Concurrency Test',
      graph: {
        nodes: [
          {
            id: 'slow',
            type: 'llm_generate',
            name: 'Slow node',
            config: {
              prompt_template:
                'Write a 3-paragraph essay about the history of computing.',
            },
          },
        ],
        edges: [],
      },
    });
  });

  it('rejects execution when concurrency limit is reached', async () => {
    // Start first execution (don't await — let it run)
    const firstPromise = engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID,
      undefined,
      {
        concurrencyLimit: 1,
      }
    );
    const { executionId } = await firstPromise;

    // Wait for it to transition to 'running'
    let attempts = 0;
    while (attempts < 20) {
      const exec = await db.execution.findUnique({
        where: { id: executionId },
      });
      if (exec && exec.status === 'running') break;
      await new Promise((r) => setTimeout(r, 200));
      attempts++;
    }

    // Second execution should be rejected
    await expect(
      engine.execute(procedure.id, {}, WORKSPACE_ID, undefined, {
        concurrencyLimit: 1,
      })
    ).rejects.toThrow('Concurrent execution limit');
  }, 30000);
});

// ============================================================
// 7. EXECUTION CANCEL
// ============================================================
describeIfKey('Execution cancellation', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure({
      slug: 'e2e-cancel',
      name: 'Cancel Test',
      graph: {
        nodes: [
          {
            id: 'long1',
            type: 'llm_generate',
            name: 'First long node',
            config: { prompt_template: 'Write a paragraph about dogs.' },
          },
          {
            id: 'long2',
            type: 'llm_generate',
            name: 'Second long node',
            config: { prompt_template: 'Write a paragraph about cats.' },
          },
          {
            id: 'long3',
            type: 'llm_generate',
            name: 'Third long node',
            config: { prompt_template: 'Write a paragraph about birds.' },
          },
        ],
        edges: [
          { from: 'long1', to: 'long2' },
          { from: 'long2', to: 'long3' },
        ],
      },
    });
  });

  it('stops execution when status is set to cancelled', async () => {
    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID
    );

    // Wait for execution to start running, then cancel
    await new Promise((r) => setTimeout(r, 2000));
    await db.execution.update({
      where: { id: executionId },
      data: { status: 'cancelled' },
    });

    await new Promise((r) => setTimeout(r, 5000));

    const execution = await db.execution.findUnique({
      where: { id: executionId },
      include: { executionNodes: true },
    });

    expect(execution.status).toBe('cancelled');
    const completedNodes = execution.executionNodes.filter(
      (n) => n.status === 'completed'
    );
    expect(completedNodes.length).toBeLessThan(3);
  }, 30000);
});

// ============================================================
// 8. EXECUTION TIMEOUT
// ============================================================
describeIfKey('Execution timeout', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure({
      slug: 'e2e-timeout',
      name: 'Timeout Test',
      graph: {
        nodes: [
          {
            id: 'slow1',
            type: 'llm_generate',
            name: 'Node 1',
            config: {
              prompt_template: 'Write a long essay about mathematics.',
            },
          },
          {
            id: 'slow2',
            type: 'llm_generate',
            name: 'Node 2',
            config: { prompt_template: 'Write a long essay about physics.' },
          },
        ],
        edges: [{ from: 'slow1', to: 'slow2' }],
      },
    });
  });

  it('fails when execution exceeds timeout', async () => {
    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID,
      undefined,
      { timeoutMs: 100 } // 100ms — will trigger after first LLM call
    );

    const execution = await waitForExecution(executionId);

    expect(execution.status).toBe('failed');
    expect(execution.error).toContain('timed out');
  }, 60000);
});

// ============================================================
// 9. CALLBACKS FIRE CORRECTLY
// ============================================================
describeIfKey('WebSocket callbacks', () => {
  let procedure;

  beforeAll(async () => {
    procedure = await createProcedure({
      slug: 'e2e-callbacks',
      name: 'Callbacks Test',
      graph: {
        nodes: [
          {
            id: 'cb_node',
            type: 'llm_generate',
            name: 'Callback node',
            config: { prompt_template: 'Say "hello". Just the word.' },
          },
        ],
        edges: [],
      },
    });
  });

  it('fires onNodeStart, onNodeComplete, onExecutionComplete in order', async () => {
    const events = [];

    const { executionId } = await engine.execute(
      procedure.id,
      {},
      WORKSPACE_ID,
      {
        onNodeStart: (execId, nodeId) => events.push(`start:${nodeId}`),
        onNodeComplete: (execId, nodeId) => events.push(`complete:${nodeId}`),
        onExecutionComplete: (_execId) => events.push('exec_complete'),
      }
    );

    await waitForExecution(executionId);

    expect(events).toContain('start:cb_node');
    expect(events).toContain('complete:cb_node');
    expect(events).toContain('exec_complete');

    const startIdx = events.indexOf('start:cb_node');
    const completeIdx = events.indexOf('complete:cb_node');
    const execCompleteIdx = events.indexOf('exec_complete');
    expect(startIdx).toBeLessThan(completeIdx);
    expect(completeIdx).toBeLessThan(execCompleteIdx);
  }, 30000);
});

// ============================================================
// 10. ERROR HANDLING
// ============================================================
describeIfKey('Error handling', () => {
  it('throws when procedure does not exist', async () => {
    await expect(
      engine.execute('nonexistent-id-12345', {}, WORKSPACE_ID)
    ).rejects.toThrow('Procedure not found');
  });

  it('throws when graph has no entry node', async () => {
    const proc = await createProcedure({
      slug: 'e2e-no-entry',
      name: 'No Entry Node',
      graph: {
        nodes: [
          {
            id: 'a',
            type: 'llm_generate',
            name: 'A',
            config: { prompt_template: 'hi' },
          },
          {
            id: 'b',
            type: 'llm_generate',
            name: 'B',
            config: { prompt_template: 'hi' },
          },
        ],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'a' },
        ],
      },
    });

    await expect(engine.execute(proc.id, {}, WORKSPACE_ID)).rejects.toThrow(
      'no entry node'
    );
  });

  it('throws when graph has multiple entry nodes', async () => {
    const proc = await createProcedure({
      slug: 'e2e-multi-entry',
      name: 'Multiple Entry Nodes',
      graph: {
        nodes: [
          {
            id: 'a',
            type: 'llm_generate',
            name: 'A',
            config: { prompt_template: 'hi' },
          },
          {
            id: 'b',
            type: 'llm_generate',
            name: 'B',
            config: { prompt_template: 'hi' },
          },
        ],
        edges: [],
      },
    });

    await expect(engine.execute(proc.id, {}, WORKSPACE_ID)).rejects.toThrow(
      'multiple entry nodes'
    );
  });
});

// ============================================================
// 11. getNestedValue utility
// ============================================================
describeIfKey('getNestedValue', () => {
  const ctx = {
    variables: { step1: 'hello', nested: { inner: { deep: 42 } } },
    parameters: { user_name: 'Nitish', config: { timeout: 5000 } },
  };

  it('resolves simple variable', () => {
    expect(getNestedValue(ctx, 'step1')).toBe('hello');
  });

  it('resolves nested path', () => {
    expect(getNestedValue(ctx, 'nested.inner.deep')).toBe(42);
  });

  it('resolves parameters when not in variables', () => {
    expect(getNestedValue(ctx, 'user_name')).toBe('Nitish');
  });

  it('resolves nested parameter path', () => {
    expect(getNestedValue(ctx, 'config.timeout')).toBe(5000);
  });

  it('returns undefined for missing path', () => {
    expect(getNestedValue(ctx, 'nonexistent')).toBeUndefined();
  });

  it('returns undefined for invalid nested path', () => {
    expect(getNestedValue(ctx, 'step1.doesnt.exist')).toBeUndefined();
  });

  it('prefers variables over parameters', () => {
    const ctxOverlap = {
      variables: { shared: 'from_vars' },
      parameters: { shared: 'from_params' },
    };
    expect(getNestedValue(ctxOverlap, 'shared')).toBe('from_vars');
  });
});

// ============================================================
// 12. ContextManager
// ============================================================
describeIfKey('ContextManager', () => {
  const makeProcedure = () => ({
    id: 'test',
    slug: 'test',
    name: 'Test Procedure',
    description: 'A test',
    level: 'task',
    maturity: 'curated',
    graph: { nodes: [], edges: [] },
    parameters: {},
    constraints: {},
    organizationId: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('initializes with system and sop items', () => {
    const cm = new ContextManager();
    const window = cm.initialize(makeProcedure());

    expect(window.items).toHaveLength(2);
    expect(window.items[0].type).toBe('system');
    expect(window.items[1].type).toBe('sop');
    expect(window.totalTokensUsed).toBeGreaterThan(0);
    expect(window.budget.total).toBe(128000);
  });

  it('adds node output and tracks tokens', () => {
    const cm = new ContextManager();
    const window = cm.initialize(makeProcedure());
    const initialTokens = window.totalTokensUsed;

    cm.update(window, 'node1', 'Some LLM output text', 100);

    expect(window.items).toHaveLength(3);
    expect(window.items[2].type).toBe('node_output');
    expect(window.totalTokensUsed).toBe(initialTokens + 100);
  });

  it('evicts lowest priority items when over budget', () => {
    const cm = new ContextManager();
    const window = cm.initialize(makeProcedure());
    window.budget.total = 100;

    cm.update(window, 'n1', 'x'.repeat(200), 50);
    cm.update(window, 'n2', 'y'.repeat(200), 50);

    expect(window.evictedItems.length).toBeGreaterThan(0);
    expect(window.items.some((i) => i.type === 'system')).toBe(true);
  });

  it('assembles items sorted by priority', () => {
    const cm = new ContextManager();
    const window = cm.initialize(makeProcedure());
    const assembled = cm.assemble(window);

    expect(typeof assembled).toBe('string');
    expect(assembled.length).toBeGreaterThan(0);
  });

  it('countTokens handles null/empty gracefully', () => {
    const cm = new ContextManager();
    expect(cm.countTokens('')).toBe(0);
    expect(cm.countTokens(null)).toBe(0);
    expect(cm.countTokens(undefined)).toBe(0);
    expect(cm.countTokens('hello')).toBe(2);
  });
});
