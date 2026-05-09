import { describe, test, expect, beforeEach } from '@jest/globals';

// @kloudi-os/infrastructure/database is mapped to a test mock via jest.config.js
// moduleNameMapper — no live DB connection is required.
import { securityInspect } from '../inspectors/security.js';
import { repetitionInspect } from '../inspectors/repetition.js';
import { trustInspect } from '../inspectors/trust.js';
import { runInspectors } from '../inspectors/index.js';
import { ToolRegistry } from '../registry.js';
import { GatewayImpl } from '../gateway.js';
import { buildBuiltinApiTools } from '../tools/builtin/adapters/api.js';
import { buildGitHubApiTools } from '../tools/github/adapters/api.js';
import { buildJiraApiTools } from '../tools/jira/adapters/api.js';
import { builtin } from '../providers/builtin/index.js';
import type { OrgContext } from '../types.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const ctx: OrgContext = {
  organizationId: 'org-test',
  userId: 'user-test',
  executionId: `exec-${Date.now()}`,
  nodeId: 'node-1',
};

// ─── Security inspector ───────────────────────────────────────────────────────

describe('security inspector', () => {
  const bashTool = buildBuiltinApiTools().find(
    (t) => t.definition.name === 'bash'
  )!;
  const readTool = buildBuiltinApiTools().find(
    (t) => t.definition.name === 'read_file'
  )!;

  test('blocks rm -rf in params', () => {
    const result = securityInspect(bashTool, { command: 'rm -rf /tmp/foo' });
    expect(result.verdict).toBe('block');
    expect(result.inspector).toBe('security');
  });

  test('blocks DROP TABLE in params', () => {
    const result = securityInspect(bashTool, { command: 'DROP TABLE users' });
    expect(result.verdict).toBe('block');
  });

  test('prompts for any bash command (even safe ones)', () => {
    const result = securityInspect(bashTool, { command: 'ls -la' });
    expect(result.verdict).toBe('prompt');
  });

  test('allows read_file (not bash, no dangerous patterns)', () => {
    const result = securityInspect(readTool, { path: '/tmp/test.txt' });
    expect(result.verdict).toBe('allow');
  });
});

// ─── Trust inspector ──────────────────────────────────────────────────────────

describe('trust inspector', () => {
  test('returns prompt for write_file (defaultTrust: prompt)', async () => {
    const writeTool = buildBuiltinApiTools().find(
      (t) => t.definition.name === 'write_file'
    )!;
    const result = await trustInspect(writeTool, ctx);
    expect(result.verdict).toBe('prompt');
  });

  test('returns allow for read_file (defaultTrust: auto)', async () => {
    const readTool = buildBuiltinApiTools().find(
      (t) => t.definition.name === 'read_file'
    )!;
    const result = await trustInspect(readTool, ctx);
    expect(result.verdict).toBe('allow');
  });

  test('returns prompt for github_create_pr (defaultTrust: prompt)', async () => {
    const createPrTool = buildGitHubApiTools().find(
      (t) => t.definition.name === 'github_create_pr'
    )!;
    const result = await trustInspect(createPrTool, ctx);
    expect(result.verdict).toBe('prompt');
  });
});

// ─── Repetition inspector ─────────────────────────────────────────────────────

describe('repetition inspector', () => {
  const readTool = buildBuiltinApiTools().find(
    (t) => t.definition.name === 'read_file'
  )!;

  test('allows first 3 identical calls, prompts on 4th', () => {
    const uniqueCtx: OrgContext = {
      ...ctx,
      executionId: `exec-repetition-${Date.now()}`,
    };
    const params = { path: '/tmp/loop-test.txt' };

    const r1 = repetitionInspect(readTool, params, uniqueCtx);
    const r2 = repetitionInspect(readTool, params, uniqueCtx);
    const r3 = repetitionInspect(readTool, params, uniqueCtx);
    const r4 = repetitionInspect(readTool, params, uniqueCtx);

    expect(r1.verdict).toBe('allow');
    expect(r2.verdict).toBe('allow');
    expect(r3.verdict).toBe('allow');
    expect(r4.verdict).toBe('prompt');
    expect(r4.reason).toMatch(/4 times/);
  });

  test('different params do not accumulate', () => {
    const uniqueCtx: OrgContext = {
      ...ctx,
      executionId: `exec-diff-params-${Date.now()}`,
    };

    const r1 = repetitionInspect(readTool, { path: '/a.txt' }, uniqueCtx);
    const r2 = repetitionInspect(readTool, { path: '/b.txt' }, uniqueCtx);
    const r3 = repetitionInspect(readTool, { path: '/c.txt' }, uniqueCtx);
    const r4 = repetitionInspect(readTool, { path: '/d.txt' }, uniqueCtx);

    expect(r1.verdict).toBe('allow');
    expect(r2.verdict).toBe('allow');
    expect(r3.verdict).toBe('allow');
    expect(r4.verdict).toBe('allow');
  });
});

// ─── Full inspector pipeline ──────────────────────────────────────────────────

describe('runInspectors pipeline', () => {
  test('write_file returns prompt (trust inspector fires)', async () => {
    const writeTool = buildBuiltinApiTools().find(
      (t) => t.definition.name === 'write_file'
    )!;
    const result = await runInspectors(
      writeTool,
      { path: '/tmp/x.txt', content: 'hi' },
      ctx
    );
    expect(result.verdict).toBe('prompt');
  });

  test('bash with rm -rf returns block (security fires before trust)', async () => {
    const bashTool = buildBuiltinApiTools().find(
      (t) => t.definition.name === 'bash'
    )!;
    const result = await runInspectors(
      bashTool,
      { command: 'rm -rf /tmp' },
      ctx
    );
    expect(result.verdict).toBe('block');
    expect(result.inspector).toBe('security');
  });
});

// ─── read_file integration ────────────────────────────────────────────────────

describe('builtin read_file', () => {
  const tmpFile = join(tmpdir(), `mcp-gateway-test-${Date.now()}.txt`);

  test('reads a real file and returns content', () => {
    writeFileSync(tmpFile, 'hello from mcp-gateway test', 'utf-8');
    const result = builtin.readFile(tmpFile);
    expect(result.content).toBe('hello from mcp-gateway test');
    expect(result.path).toBe(tmpFile);
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  });

  test('throws on missing file', () => {
    expect(() => builtin.readFile('/tmp/does-not-exist-xyz.txt')).toThrow();
  });
});

// ─── GatewayImpl + registry ───────────────────────────────────────────────────

describe('GatewayImpl', () => {
  let registry: ToolRegistry;
  let gateway: GatewayImpl;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerMany(buildBuiltinApiTools());
    gateway = new GatewayImpl(registry);
  });

  test('returns error for unknown tool', async () => {
    const result = await gateway.call('nonexistent_tool', {}, ctx);
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/Tool not found/);
  });

  test('listTools returns all registered tools', async () => {
    const tools = await gateway.listTools('org-test');
    const names = tools.map((t) => t.name);
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('bash');
    expect(names).toContain('search_files');
  });

  test('getTool returns definition for known tool', () => {
    const def = gateway.getTool('read_file');
    expect(def).toBeDefined();
    expect(def?.name).toBe('read_file');
    expect(def?.authType).toBe('none');
  });

  test('read_file executes and returns content', async () => {
    const tmpFile = join(tmpdir(), `gateway-read-test-${Date.now()}.txt`);
    writeFileSync(tmpFile, 'gateway test content', 'utf-8');

    const result = await gateway.call('read_file', { path: tmpFile }, ctx);
    expect(result.status).toBe('success');
    expect((result.output as { content: string }).content).toBe(
      'gateway test content'
    );
    expect(result.meta?.toolName).toBe('read_file');

    unlinkSync(tmpFile);
  });

  test('resumeAfterApproval returns error for missing gate', async () => {
    const result = await gateway.resumeAfterApproval(
      'exec-x',
      'node-x',
      'approve'
    );
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/No pending trust gate/);
  });

  test('resumeAfterApproval returns blocked on reject', async () => {
    const readTool = registry.get('read_file')!;
    gateway.setPendingTrustGate('exec-r:node-r', {
      tool: readTool,
      params: { path: '/tmp/x.txt' },
      context: ctx,
      trustCtx: {
        toolName: 'read_file',
        description: 'test',
        params: {},
        riskLevel: 'low',
        isDestructive: false,
        requiresUserLevel: false,
        executionId: 'exec-r',
        nodeId: 'node-r',
      },
      credentials: {},
    });
    const result = await gateway.resumeAfterApproval(
      'exec-r',
      'node-r',
      'reject'
    );
    expect(result.status).toBe('blocked');
  });
});

// ─── GitHub tools registration ────────────────────────────────────────────────

describe('GitHub tools', () => {
  test('all 6 tools are defined and registered', () => {
    const registry = new ToolRegistry();
    registry.registerMany(buildGitHubApiTools());

    const names = [
      'github_read_file',
      'github_list_prs',
      'github_create_pr',
      'github_post_comment',
      'github_get_issue',
      'github_list_commits',
    ];

    for (const name of names) {
      const tool = registry.get(name);
      expect(tool).toBeDefined();
      expect(tool?.definition.integration).toBe('github');
      expect(tool?.adapters[0].type).toBe('api');
    }
  });

  test('github_create_pr has defaultTrust: prompt', () => {
    const tools = buildGitHubApiTools();
    const createPr = tools.find(
      (t) => t.definition.name === 'github_create_pr'
    )!;
    expect(createPr.definition.defaultTrust).toBe('prompt');
  });

  test('github_read_file api adapter calls fetch with correct URL', async () => {
    const tools = buildGitHubApiTools();
    const readFile = tools.find(
      (t) => t.definition.name === 'github_read_file'
    )!;

    const mockFetch = async (url: string): Promise<Response> => {
      expect(url).toBe(
        'https://api.github.com/repos/acme/api/contents/README.md'
      );
      return new Response(
        JSON.stringify({
          content: 'SGVsbG8=',
          encoding: 'base64',
          name: 'README.md',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const result = await readFile.adapters[0].execute(
        { owner: 'acme', repo: 'api', path: 'README.md' },
        { token: 'ghp_test' },
        ctx
      );
      expect(result).toMatchObject({ name: 'README.md' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ─── Jira tools registration ──────────────────────────────────────────────────

describe('Jira tools', () => {
  test('all 5 tools are defined and registered', () => {
    const registry = new ToolRegistry();
    registry.registerMany(buildJiraApiTools());

    const names = [
      'jira_get_issue',
      'jira_update_issue',
      'jira_add_comment',
      'jira_search_issues',
      'jira_list_projects',
    ];

    for (const name of names) {
      const tool = registry.get(name);
      expect(tool).toBeDefined();
      expect(tool?.definition.integration).toBe('jira');
      expect(tool?.adapters[0].type).toBe('api');
    }
  });

  test('jira_update_issue and jira_add_comment have defaultTrust: prompt', () => {
    const tools = buildJiraApiTools();
    const updateIssue = tools.find(
      (t) => t.definition.name === 'jira_update_issue'
    )!;
    const addComment = tools.find(
      (t) => t.definition.name === 'jira_add_comment'
    )!;
    expect(updateIssue.definition.defaultTrust).toBe('prompt');
    expect(addComment.definition.defaultTrust).toBe('prompt');
  });

  test('jira_get_issue api adapter calls correct Jira URL', async () => {
    const tools = buildJiraApiTools();
    const getIssue = tools.find((t) => t.definition.name === 'jira_get_issue')!;

    const mockFetch = async (url: string): Promise<Response> => {
      expect(url).toContain('acme.atlassian.net');
      expect(url).toContain('/issue/PROJ-123');
      return new Response(
        JSON.stringify({
          id: '10001',
          key: 'PROJ-123',
          fields: { summary: 'Test issue' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const result = await getIssue.adapters[0].execute(
        { issueKey: 'PROJ-123' },
        { domain: 'acme', email: 'test@acme.com', token: 'jira-token' },
        ctx
      );
      expect(result).toMatchObject({ key: 'PROJ-123' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ─── SDK typed import surface ─────────────────────────────────────────────────

describe('SDK provider modules', () => {
  test('github provider has expected methods', async () => {
    // Import tested at compile-time via TypeScript — runtime check here
    const { github: ghModule } = await import('../providers/github/index.js');
    expect(typeof ghModule.readFile).toBe('function');
    expect(typeof ghModule.listPrs).toBe('function');
    expect(typeof ghModule.createPr).toBe('function');
    expect(typeof ghModule.postComment).toBe('function');
    expect(typeof ghModule.getIssue).toBe('function');
    expect(typeof ghModule.listCommits).toBe('function');
  });

  test('jira provider has expected methods', async () => {
    const { jira: jiraModule } = await import('../providers/jira/index.js');
    expect(typeof jiraModule.getIssue).toBe('function');
    expect(typeof jiraModule.updateIssue).toBe('function');
    expect(typeof jiraModule.addComment).toBe('function');
    expect(typeof jiraModule.searchIssues).toBe('function');
    expect(typeof jiraModule.listProjects).toBe('function');
  });

  test('builtin provider has expected methods', async () => {
    const { builtin: builtinModule } =
      await import('../providers/builtin/index.js');
    expect(typeof builtinModule.readFile).toBe('function');
    expect(typeof builtinModule.writeFile).toBe('function');
    expect(typeof builtinModule.bash).toBe('function');
    expect(typeof builtinModule.search).toBe('function');
  });
});
