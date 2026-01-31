# lore.dev

Multiplayer OS for EPD teams. Everything is an SOP.

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
    "lore": {
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
  core/             Procedures domain (entities, repository, service)
  agent/            SOP execution runtime (graph traversal, context mgmt)
  tools/            Tool registry + built-ins (filesystem, shell, github)
  auth/             JWT + bcrypt
  infrastructure/   Database (Prisma), cache (Redis), events, AI
  shared/           Config, logger, utils
```

## API

```
GET  /health                    Health check
GET  /api/procedures            List procedures
GET  /api/procedures/:slug      Get procedure
POST /api/procedures            Create procedure
PUT  /api/procedures/:slug      Update procedure
DEL  /api/procedures/:slug      Delete procedure
POST /api/procedures/:slug/run  Execute procedure
GET  /api/executions            List executions
GET  /api/executions/:id        Execution status
GET  /api/fs                    Filesystem root
GET  /api/fs/*                  Read path
WS   /ws                        Real-time execution updates
```

## License

MIT
