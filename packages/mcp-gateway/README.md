# mcp-gateway

Federated MCP gateway for AI agents. The single interface between your agent and all tools.

**The problem:** Every AI agent integration (GitHub, Jira, Slack, Notion, ...) needs credentials, routing logic, and a trust layer. Building this from scratch for every agent is duplication. This is the shared infrastructure layer.

**What this is:** OpenRouter, but for MCP tools instead of LLM providers.

---

## Features

- **Federated** — orgs run their own gateway instance, or use a hosted one
- **Unified auth** — org-level (shared token) or user-level (personal token, attributed actions)
- **Trust inspector pipeline** — security → egress → trust → repetition, runs before every tool call
- **Tool marketplace** — install MCP servers from the registry, quality-scored from execution traces
- **Three tool types** — builtin (in-process), stdio (local MCP servers), HTTP (remote MCP servers)

---

## Quickstart

```bash
# As a standalone service
docker run -p 3010:3010 -e DATABASE_URL=... ghcr.io/kloudi/mcp-gateway:latest

# As a library (in-process)
pnpm add @kloudi/mcp-gateway
```

```typescript
import type { MCPGateway, OrgContext } from '@kloudi/mcp-gateway';

// The engine calls this — credentials are injected by the gateway
const result = await gateway.call(
  'github_create_pr',
  {
    title: 'feat: add safety check',
    base: 'main',
    head: 'feat/acme-456',
  },
  orgContext
);
```

---

## Architecture

```
AI Agent (execution engine)
    │  gateway.call(toolName, params, orgContext)
    ▼
MCP Gateway
    ├── trust inspector pipeline
    │     security → egress → trust → repetition
    │
    ├── credential injection
    │     reads from Integration table (never exposes raw tokens to agent)
    │
    ├── routing
    │     builtin/    read_file, write_file, bash (in-process)
    │     stdio/      local MCP servers
    │     http/       remote MCP servers (GitHub, Jira, Slack...)
    │
    └── marketplace (V4+)
          install MCP servers, versioned, quality-scored
```

---

## Running standalone

```bash
# Environment
PORT=3010
DATABASE_URL=postgresql://...

# Start
node dist/server.js

# Docker
docker build -f Dockerfile -t mcp-gateway .
docker run -p 3010:3010 -e DATABASE_URL=... mcp-gateway
```

### API

| Method   | Route                    | Description                      |
| -------- | ------------------------ | -------------------------------- |
| `POST`   | `/tools/call`            | Execute a tool call              |
| `GET`    | `/tools?organizationId=` | List available tools             |
| `POST`   | `/tools/resume`          | Resume after trust gate approval |
| `POST`   | `/servers/register`      | Register an MCP server           |
| `DELETE` | `/servers/:id`           | Unregister a server              |
| `GET`    | `/health`                | Health check                     |

---

## Development status

This package is under active development. The type contracts in `src/types.ts` are stable. The implementation is in progress.

- [x] Type contracts (`src/types.ts`)
- [x] Standalone server skeleton (`src/server.ts`)
- [ ] GatewayImpl — implements `MCPGateway`
- [ ] GitHub MCP server
- [ ] Jira MCP server
- [ ] Builtin tools (read_file, write_file, bash)
- [ ] Trust inspector pipeline
- [ ] Credential injection from Integration table

---

## License

MIT
