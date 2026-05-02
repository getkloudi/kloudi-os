# kloudi

The Machine — an always-on organizational intelligence for software teams.
SOPs encode how your org works. The Machine watches, plans, and executes.

**New here?** Read `docs/current/00-start-here.md` first.

## Setup

```bash
pnpm install
docker compose up -d
```

## Running

```bash
# Terminal 1: API server (localhost:3001)
pnpm dev:api

# Terminal 2: Web UI (localhost:3000)
pnpm dev:web
```

Or run everything at once:

```bash
pnpm dev           # All apps in parallel (turbo)
```

### Individual apps

```bash
pnpm dev:api       # API server on :3001
pnpm dev:web       # Next.js UI on :3000
pnpm dev:cli       # CLI tool
pnpm dev:mcp       # MCP server (Claude Desktop)
```

### Database

```bash
pnpm db:generate   # Generate Prisma client
pnpm db:push       # Push schema to database
pnpm db:migrate    # Run migrations
pnpm db:studio     # Open Prisma Studio GUI
```

### MCP (Claude Desktop)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kloudi": {
      "command": "node",
      "args": ["<path-to-repo>/apps/mcp-server/index.js"]
    }
  }
}
```

## Structure

```
apps/
  api/              Express 5 API server (:3001)
  web/              Next.js 16 UI (:3000)
  cli/              CLI tool
  mcp-server/       Claude Desktop MCP integration

packages/
  core/             SOPs domain (entities, repository, service)
  agent/            SOP execution runtime (graph traversal, context mgmt)
  tools/            Tool registry + built-ins (filesystem, shell, github)
  auth/             JWT + bcrypt
  infrastructure/   Database (Prisma), cache (Redis), events, AI
  shared/           Config, logger, utils
```

## API

```
GET  /health                    Health check
GET  /api/sops            List procedures
GET  /api/sops/:slug      Get procedure
POST /api/sops            Create procedure
PUT  /api/sops/:slug      Update procedure
DEL  /api/sops/:slug      Delete procedure
POST /api/sops/:slug/run  Execute procedure
GET  /api/executions            List executions
GET  /api/executions/:id        Execution status
GET  /api/fs                    Filesystem root
GET  /api/fs/*                  Read path
WS   /ws                        Real-time execution updates
```

## License

MIT
