# @kloudi/mcp-gateway

OpenRouter for MCP tools. Single call routes to GitHub, Jira, or any tool — with credentials and governance built in.

```typescript
import { gateway } from '@kloudi/mcp-gateway';

const result = await gateway.call('github_create_pr', params, context);
```

---

## Access modes

The same tools are accessible four ways. Pick based on your consumer.

### SDK — TypeScript in-process

```typescript
import { gateway } from '@kloudi/mcp-gateway';

const result = await gateway.call(
  'github_create_pr',
  {
    owner: 'acme',
    repo: 'api',
    title: 'fix: auth',
    body: '...',
    base: 'main',
    head: 'feat/fix',
  },
  {
    organizationId: 'org_123',
    userId: 'usr_456',
    executionId: 'exec_789',
    nodeId: 'node_1',
  }
);
```

No inspectors in SDK mode — bare tool routing. Use when your agent runs in the same process.

Need a custom tool set? Use `createGateway()`:

```typescript
import { createGateway, ToolRegistry } from '@kloudi/mcp-gateway';

const registry = new ToolRegistry();
// register only what you need
const myGateway = createGateway({ registry });
```

### HTTP API — any language

```bash
# Execute a tool
curl -X POST http://localhost:3010/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "github_create_pr",
    "params": { "owner": "acme", "repo": "api", "title": "fix: auth", "body": "...", "base": "main", "head": "feat/fix" },
    "context": { "organizationId": "org_123", "userId": "usr_456", "executionId": "exec_789", "nodeId": "node_1" }
  }'

# List available tools
curl "http://localhost:3010/tools?organizationId=org_123"

# Resume after trust gate approval
curl -X POST http://localhost:3010/tools/resume \
  -H "Content-Type: application/json" \
  -d '{ "executionId": "exec_789", "nodeId": "node_1", "decision": "approve" }'
```

HTTP mode adds the governance layer: inspector pipeline runs, credentials are injected from the database.

### MCP — Claude Desktop, Cursor, any MCP-compatible LLM

```json
{
  "mcpServers": {
    "kloudi": {
      "url": "http://localhost:3010/mcp"
    }
  }
}
```

The gateway exposes itself as an MCP server — LLMs auto-discover all registered tools. _(Stub — phase 2)_

### CLI — human testing, scripting

```bash
npx @kloudi/mcp-github create-pr --owner=acme --repo=api --title="fix: auth"
npx @kloudi/mcp-jira get-issue --issueKey=PROJ-123
```

_(Phase 2 — individual provider CLI packages)_

---

## Providers

### GitHub

```typescript
// Typed client — no gateway needed
import { github } from '@kloudi/mcp-gateway/github';
const pr = await github.createPr(
  { owner, repo, title, body, base, head },
  token
);
```

| Tool                  | Description                      | Trust      | Auth |
| --------------------- | -------------------------------- | ---------- | ---- |
| `github_read_file`    | Read a file from a repository    | auto       | org  |
| `github_list_prs`     | List pull requests               | auto       | org  |
| `github_create_pr`    | Create a pull request            | **prompt** | org  |
| `github_post_comment` | Post a comment on an issue or PR | **prompt** | org  |
| `github_get_issue`    | Get issue details                | auto       | org  |
| `github_list_commits` | List recent commits              | auto       | org  |

**Credentials** (stored in `Integration` table, type: `github`):

```json
{ "token": "ghp_..." }
```

**Adapters available:** `api` (default), `mcp` _(stub)_, `cli` _(stub)_

---

### Jira

```typescript
import { jira } from '@kloudi/mcp-gateway/jira';
const issue = await jira.getIssue('acme', 'PROJ-123', email, token);
```

| Tool                 | Description         | Trust      | Auth |
| -------------------- | ------------------- | ---------- | ---- |
| `jira_get_issue`     | Get issue details   | auto       | org  |
| `jira_search_issues` | Search with JQL     | auto       | org  |
| `jira_list_projects` | List all projects   | auto       | org  |
| `jira_update_issue`  | Update issue fields | **prompt** | org  |
| `jira_add_comment`   | Add a comment       | **prompt** | org  |

**Credentials** (stored in `Integration` table, type: `jira`):

```json
{ "domain": "acme", "email": "bot@acme.com", "token": "ATATT3x..." }
```

**Adapters available:** `api` (default), `mcp` _(stub)_

---

### Builtin

```typescript
import { builtin } from '@kloudi/mcp-gateway/builtin';
const file = builtin.readFile('/path/to/file.ts');
const result = builtin.bash('git log --oneline -10');
```

| Tool           | Description                           | Trust      | Auth |
| -------------- | ------------------------------------- | ---------- | ---- |
| `read_file`    | Read a file from the local filesystem | auto       | none |
| `search_files` | Search for a pattern in files         | auto       | none |
| `write_file`   | Write content to a file               | **prompt** | none |
| `bash`         | Run a bash command                    | **prompt** | none |

No credentials required. `bash` and `write_file` always trigger a trust gate.

---

## Inspector pipeline

Runs before every tool call in **HTTP API mode only** (not SDK). First non-`allow` verdict wins.

```
gateway.call(toolName, params, context)
    │
    ├─ 1. security    — blocks rm -rf, DROP TABLE, force-push to main/master, kubectl delete
    │                   bash tool always returns 'prompt' regardless of other inspectors
    │
    ├─ 2. egress      — blocks unapproved external destinations (V0: allow all)
    │
    ├─ 3. trust       — checks tool's defaultTrust level (V0: uses definition, V1: per-user DB scores)
    │
    └─ 4. repetition  — >3 identical calls in same execution → prompt (loop detection)
```

**Verdicts:**

| Verdict  | Meaning               | Server response                                   |
| -------- | --------------------- | ------------------------------------------------- |
| `allow`  | Execute immediately   | `{ status: 'success', output: ... }`              |
| `prompt` | Pause, wait for human | `{ status: 'trust_gate', trustGateContext: ... }` |
| `block`  | Never execute         | `{ status: 'blocked', blockReason: ... }`         |

**Trust gate flow:**

```
POST /tools/call → { status: 'trust_gate', trustGateContext: { executionId, nodeId, ... } }
    │
    │  (human sees context, clicks approve or reject)
    │
POST /tools/resume { executionId, nodeId, decision: 'approve' | 'reject' }
    │
    └─ { status: 'success', output: ... } or { status: 'blocked' }
```

---

## Adapters

Every tool can be backed by multiple adapter implementations. The adapter is set once at registration — invisible to the LLM and execution engine.

| Adapter | How it works                                         | Status         |
| ------- | ---------------------------------------------------- | -------------- |
| `api`   | Direct REST calls via typed provider clients         | ✅ Default     |
| `mcp`   | Wraps provider's official MCP server process (stdio) | Stub — phase 2 |
| `cli`   | Shells out to CLI utility (e.g. `gh`, `jira`)        | Stub — phase 2 |

**Selecting an adapter:**

```bash
# Via environment variable (operator decision — set once)
GITHUB_ADAPTER=api
JIRA_ADAPTER=mcp

# Or in code
registerGitHub(credentials)                          // auto-detect
registerGitHub(credentials, { adapter: 'api' })      // explicit

// Priority cascade — try mcp, fall back to api on failure
registerGitHub(credentials, { adapters: ['mcp', 'api'] })

// Tool-level override — mcp for reads, api for writes
registerGitHub(credentials, {
  adapters: [
    { type: 'mcp', tools: ['github_read_file', 'github_list_prs'] },
    { type: 'api', tools: ['github_create_pr', 'github_post_comment'] },
  ]
})
```

**Multiple adapters for the same tool** (same tool registered twice):

| Scenario                          | Behavior                         |
| --------------------------------- | -------------------------------- |
| Different tools from each adapter | Merge — all tools available      |
| Same tool, explicit priority      | Try in order, first success wins |
| Same tool, no priority            | Error at registration time       |

---

## Adding a provider

Four steps to add a new integration (e.g. Slack):

**1. Create the typed provider client**

```
packages/mcp-gateway/src/providers/slack/
  types.ts     ← Slack-specific types (SendMessageParams, SlackChannel, etc.)
  client.ts    ← typed REST calls
  index.ts     ← exports { slack }
```

```typescript
// providers/slack/client.ts
export const slack = {
  sendMessage: (
    channel: string,
    text: string,
    token: string
  ): Promise<SlackMessage> =>
    slackFetch('/chat.postMessage', token, {
      method: 'POST',
      body: JSON.stringify({ channel, text }),
    }),

  listChannels: (token: string): Promise<SlackChannel[]> =>
    slackFetch('/conversations.list', token),
};
```

**2. Create the api adapter**

```
packages/mcp-gateway/src/tools/slack/
  adapters/
    api.ts    ← wraps providers/slack, returns InternalTool[]
    mcp.ts    ← stub
  index.ts   ← registerSlackTools(registry)
```

```typescript
// tools/slack/adapters/api.ts
import { slack } from '../../../providers/slack/index.js';
import type { InternalTool } from '../../../registry.js';

export function buildSlackApiTools(): InternalTool[] {
  return [
    {
      definition: {
        name: 'slack_send_message',
        description: 'Send a message to a Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel ID or name' },
            text: { type: 'string', description: 'Message text' },
          },
          required: ['channel', 'text'],
        },
        integration: 'slack',
        authType: 'org',
        defaultTrust: 'prompt', // sending messages = always ask
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, credentials, _context) =>
            slack.sendMessage(
              params['channel'] as string,
              params['text'] as string,
              credentials['token'] as string
            ),
        },
      ],
    },
  ];
}
```

**3. Register in `tools/index.ts`**

```typescript
import { registerSlackTools } from './slack/index.js';

export function registerAllTools(registry: ToolRegistry): void {
  registerBuiltinTools(registry);
  registerGitHubTools(registry);
  registerJiraTools(registry);
  registerSlackTools(registry); // ← add this
}
```

**4. Add subpath export to `package.json`**

```json
{
  "exports": {
    "./slack": {
      "types": "./dist/providers/slack/index.d.ts",
      "import": "./dist/providers/slack/index.js"
    }
  }
}
```

Done. The tool is now available via all four access modes.

---

## HTTP API reference

**Base URL:** `http://localhost:3010` (default port)

| Method   | Route               | Body                                | Description                    |
| -------- | ------------------- | ----------------------------------- | ------------------------------ |
| `GET`    | `/health`           | —                                   | Health check                   |
| `GET`    | `/tools`            | `?organizationId=`                  | List all tools                 |
| `POST`   | `/tools/call`       | `{ toolName, params, context }`     | Execute a tool                 |
| `POST`   | `/tools/resume`     | `{ executionId, nodeId, decision }` | Resume trust gate              |
| `POST`   | `/servers/register` | `MCPServerConfig`                   | Register MCP server _(stub)_   |
| `DELETE` | `/servers/:id`      | —                                   | Unregister MCP server _(stub)_ |
| `GET`    | `/mcp`              | —                                   | MCP protocol surface _(stub)_  |

**`OrgContext`** (required on every call):

```typescript
{
  organizationId: string; // used to look up Integration credentials
  userId: string; // used for trust scoring and attribution
  executionId: string; // ties tool calls to a specific execution trace
  nodeId: string; // which SOP node is making this call
}
```

**`ToolCallResult`** (returned by every call):

```typescript
// Success
{ status: 'success', output: unknown, meta: { durationMs, integration, toolName, authType } }

// Trust gate fired — wait for human approval
{ status: 'trust_gate', trustGateContext: { toolName, description, params, riskLevel, isDestructive, executionId, nodeId } }

// Blocked by security inspector
{ status: 'blocked', blockReason: string }

// Execution error
{ status: 'error', error: string }
```

---

## Running standalone

```bash
# Environment variables
PORT=3010
DATABASE_URL=postgresql://...    # for credential injection (HTTP API mode)

# Local
node dist/server.js

# Docker
docker build -f Dockerfile -t mcp-gateway .
docker run -p 3010:3010 -e DATABASE_URL=... mcp-gateway
```

---

## Status

- [x] Type contracts (`src/types.ts`)
- [x] `GatewayImpl` — SDK tier, multi-adapter execution, trust gate resume
- [x] `ToolRegistry` — merge/priority adapter registration
- [x] Providers — typed clients for GitHub, Jira, Builtin
- [x] HTTP server — governance wrapper (inspectors + credential injection)
- [x] Inspector pipeline — security, egress, trust, repetition
- [x] Tool adapters — api (implemented), mcp/cli (stubs)
- [x] Subpath exports — `./github`, `./jira`, `./builtin`, `./server`
- [ ] MCP protocol surface (`/mcp`) — phase 2
- [ ] `mcp` adapter — wraps provider MCP server processes — phase 2
- [ ] `cli` adapter — phase 2
- [ ] Trust scores from DB — V1
- [ ] Per-org egress allowlist — V1

---

## License

MIT
