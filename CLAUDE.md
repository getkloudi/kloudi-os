# AGENTS.md

This file contains essential information for agentic coding agents working in this JS monorepo boilerplate repository.

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills:
- `/plan-ceo-review` — Founder/CEO mode: rethink the problem, find the 10-star product
- `/plan-eng-review` — Eng manager mode: lock in architecture, data flow, edge cases, tests
- `/plan-design-review` — Designer mode: 80-item design audit with letter grades
- `/review` — Paranoid staff engineer code review
- `/ship` — Sync main, run tests, push, open PR
- `/browse` — Give the agent eyes: log in, click through app, take screenshots
- `/qa` — Test app, find bugs, fix them, re-verify
- `/qa-only` — Report-only QA testing (no fixes)
- `/qa-design-review` — Design audit + fix what it finds
- `/setup-browser-cookies` — Import cookies from your browser for authenticated testing
- `/retro` — Engineering retrospective with per-person feedback
- `/document-release` — Update docs to match what you just shipped

## 🏗️ Current Build: ExecutionEngine (Phase 1)

**READ FIRST:** `docs/specs/execution-engine-plan.md` contains all locked architecture decisions, PR breakdown, file plan, error handling, state machine, and UI design from CEO/eng/design reviews.

**Key rules for implementation:**
- Engine-first build order — don't build CRUD for tables the engine doesn't use yet
- Async execution — POST /procedures/:id/run returns 202, graph runs via setImmediate
- Node revisit guard — any node visited >1 triggers waiting_input + WebSocket human approval
- Engine owns AIClient, passes to executors via context
- SubEntityExecutor receives engine at call time (not construction) to avoid circular dep
- All relative imports need .js extensions (nodenext ESM)
- Single-line conventional commits, no co-author branding

## 🖥️ Environment Setup

This project uses `fnm` for Node version management. Before running any command, you must activate the correct Node version in your shell:

```bash
eval "$(fnm env)" && fnm use 22
```

All commands below assume this has been run first. If you're an agent running shell commands, **prefix every command** with `eval "$(fnm env)" && fnm use 22 &&` to ensure the correct Node version is active.

Infrastructure requires Docker:

```bash
docker compose up -d            # Start PostgreSQL and Redis
```

## 🚀 Build/Lint/Test Commands

### Primary Commands

```bash
# Development
pnpm dev:api                    # Start API server with hot-reload (port 3001)
pnpm dev:web                    # Start Next.js web UI (port 3000)
pnpm dev:mcp                    # Start MCP server
pnpm test                       # Run all tests in parallel via turbo
pnpm lint                       # Run ESLint on all .js files
pnpm build                      # Build for production

# Single Test Commands
pnpm --filter @kloudi/api test  # Run tests for API package only
NODE_OPTIONS='--experimental-vm-modules' jest  # Run Jest directly
jest <path-to-test-file>        # Run specific test file
jest --testNamePattern="<test>" # Run tests matching name pattern
jest --watch                    # Run tests in watch mode
jest --coverage                 # Generate coverage report

# Database
pnpm db:generate                # Generate Prisma client
pnpm db:push                    # Push schema to database
pnpm db:migrate                 # Create and run migrations
pnpm db:studio                  # Open Prisma Studio GUI
pnpm schema:build               # Build combined Prisma schema from domains
pnpm schema:validate            # Validate built schema
```

### Domain Generation

```bash
pnpm mastishk scaffold <domain> --usecase=<usecase> --capabilities=<caps>
# Examples:
pnpm mastishk scaffold user --usecase=create --capabilities=persistence,auth
pnpm mastishk scaffold product --usecase=create --capabilities=persistence,events
```

## 🎯 Code Style Guidelines

### Import Conventions

```javascript
// ✅ Use explicit imports from capabilities
import { UserPersistence } from '../capabilities/persistence.js';
import { UserAuth } from '../capabilities/auth.js';

// ✅ Use relative imports within domain
import { User } from '../core/user.js';

// ✅ Use workspace imports for shared packages
import { Database } from '@kloudi/infrastructure/database.js';

// ❌ Avoid deep relative imports
import { Something } from '../../../infrastructure/database.js';
```

### File Naming

- **Files**: kebab-case (register-user.js, authenticate-api.js)
- **Classes**: PascalCase (User, RegisterUser, UserPersistence)
- **Methods**: camelCase (requireAuth, findById)
- **Domains**: kebab-case (user, product, order-management)

### ESLint Configuration

- Uses ESLint 9.31.0 with flat config
- Prettier integration for formatting
- Boundaries plugin enforces clean architecture layers
- Module source type with latest ECMA version

### Prettier Configuration

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2
}
```

## 🏗️ Architecture Patterns

### Clean Architecture Layers

```
interface/          # API endpoints, external interfaces (outermost)
application/        # Use cases, orchestration
capabilities/       # Static methods for cross-cutting concerns
infrastructure/     # Implementation details, external services
core/              # Domain entities, business logic (innermost)
shared/            # Shared utilities, helpers
```

### Import Rules (Enforced by ESLint)

- Interface → Application
- Application → Core, Capabilities, Shared
- Capabilities → Infrastructure, Core, Shared
- Infrastructure → Core, Shared
- Core → Shared
- Shared → Shared

### Capability Pattern

```javascript
// ✅ Use static methods in capability classes
export class UserPersistence {
  static async save(user) {
    const db = Database.getInstance();
    return await db.users.insert(user);
  }

  static async findById(id) {
    const db = Database.getInstance();
    return await db.users.findById(id);
  }
}

// ✅ Import and use capabilities explicitly
import { UserPersistence } from '../capabilities/persistence.js';
import { UserAuth } from '../capabilities/auth.js';

export class RegisterUser {
  async execute(userData, userContext) {
    await UserAuth.requirePermission(userContext, 'user.create');
    const user = new User(userData);
    await UserPersistence.save(user);
    return user;
  }
}
```

## 🧪 Testing Guidelines

### Test Structure

- **Unit Tests**: Test individual functions/classes
- **Integration Tests**: Test component interactions
- **End-to-End Tests**: Test complete user workflows
- **Test Files**: `*.test.js` or `*.spec.js` in `__tests__/` directories

### Jest Configuration

- Node.js test environment
- ES modules support with `--experimental-vm-modules`
- Coverage threshold: 80% for all metrics
- Coverage collection from `apps/*/src/**/*.js` and `packages/*/src/**/*.js`

### Test Commands

```bash
# Run all tests
pnpm test

# Run specific test file
jest apps/api/src/user/__tests__/register-user.test.js

# Run tests in watch mode
jest --watch

# Generate coverage report
jest --coverage

# Run tests with coverage threshold
pnpm test --coverage
```

## 📦 Package Management

### Workspace Structure

- **pnpm** workspace manager (version 10.13.1+)
- **Node.js** 22.17.0+ required
- Workspace config: `pnpm-workspace.yaml`

### Package Scripts

- Each package has its own `package.json` with scripts
- Use `pnpm --filter <package-name> <command>` for package-specific operations
- Turbo handles parallel execution and caching

## 🔧 Development Workflow

### Before Committing

```bash
pnpm lint             # ✅ No linting errors
pnpm test             # ✅ All tests pass
pnpm build            # ✅ Builds successfully
```

### Domain Creation Workflow

1. Analyze requirements to determine if new domain is needed
2. Use decision framework in GUIDELINES.md
3. Generate domain with appropriate capabilities
4. Validate structure and naming
5. Run tests and linting

### Error Handling

- Use proper error classes with descriptive messages
- Include error context and stack traces
- Handle async errors with try/catch or proper promise handling
- Log errors appropriately without exposing sensitive data

## 🚨 Common Issues & Solutions

### Port Conflicts

```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Or use different port
PORT=3002 pnpm dev:api
```

### Database Setup Issues

```bash
# Approve build scripts (one-time)
pnpm approve-builds
# Select: @prisma/client, @prisma/engines, prisma, bcrypt

# Clear and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Test Failures

```bash
# Run tests with detailed output
jest --verbose

# Check for open handles
jest --detectOpenHandles

# Run specific failing test
jest --testNamePattern="failing test name"
```

## 📋 Validation Checklist

### Code Quality

- [ ] ESLint passes without errors or warnings
- [ ] Prettier formatting applied
- [ ] No unused variables or imports
- [ ] Proper error handling implemented

### Architecture

- [ ] Correct layer boundaries respected
- [ ] Capability pattern used correctly
- [ ] Explicit imports from capabilities
- [ ] Static methods in capability classes

### Testing

- [ ] Tests written for all business logic
- [ ] Coverage threshold met (80%+)
- [ ] No hanging processes or open handles
- [ ] Test files properly named and located

### Domain Structure

- [ ] Required directories present (core/, application/, capabilities/, infrastructure/, interface/, **tests**/)
- [ ] Proper naming conventions followed
- [ ] Capability classes match domain naming
- [ ] Core entity file exists

## 🌐 Deployment

### Platform Layout

| Workload | Platform | URL |
|---|---|---|
| **Web** (Next.js) | Vercel | `kloudi-os-web` project |
| **API** (Express) | Railway | `https://kloudiapi-production.up.railway.app` |
| **MCP server** | Railway | `https://kloudimcp-server-production.up.railway.app` |
| **CLI** | npm publish | TBD |

### Vercel (Web)

- **Project**: `kloudi-os-web` on team `nitish-mehrotras-projects-cd0dbf7d`
- **Root Directory**: `apps/web`
- **Build Command**: `turbo run build` (auto-detected)
- **GitHub repo**: `nitishMehrotra/kloudi-os` (private)
- **PR previews**: Automatic — every push gets a unique preview URL
- **Production**: Deploys on push to `main`

### Railway (API + MCP Server)

- **Project**: `energetic-reprieve` (ID: `8aac04af-3f5d-41da-8279-f5381800087d`)
- **Services**:
  - `@kloudi/api` → `https://kloudiapi-production.up.railway.app`
  - `@kloudi/mcp-server` → `https://kloudimcp-server-production.up.railway.app`
  - `Postgres` — managed PostgreSQL 15 (internal: `postgres.railway.internal:5432`)
  - `Redis` — managed Redis 7 (internal: `redis.railway.internal:6379`)
- **Environment**: `production`
- **GitHub repo**: `nitishMehrotra/kloudi-os` (connect in Railway dashboard for auto-deploys)

### MCP Access (for agents)

Vercel and Railway MCP servers are configured for Claude Code. Agents can use
`mcp__vercel__*` and `mcp__Railway__*` tools to manage deployments.

```bash
# Already configured:
claude mcp add --transport http vercel https://mcp.vercel.com
claude mcp add Railway -- npx @railway/mcp-server
# Authenticate Vercel with: /mcp inside a Claude Code session
# Authenticate Railway with: railway login (one-time)
```

## ⚙️ Configuration System

Configuration lives in `packages/shared/config/`. The resolution hierarchy
(highest priority first):

```
.env                              # Secrets & connection strings (gitignored)
custom-environment-variables.yml  # Maps env vars → config keys
local-development.yml             # Per-developer overrides (gitignored)
development.yml                   # Environment-specific defaults
default.yml                       # Base defaults (production-safe)
```

- **`.env`** is the single source of truth for secrets (`DATABASE_URL`, `JWT_SECRET`, etc.)
- The Config module auto-loads `.env` from the monorepo root before `node-config` initializes
- `populateProcessEnv()` pushes resolved config values back to `process.env` for external tools (Prisma CLI, etc.)
- New developers: `cp .env.example .env` and fill in values

## Design System
Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## 🔍 Key Files to Understand

- `package.json` - Root package configuration and scripts
- `eslint.config.js` - Linting rules and architecture boundaries
- `jest.config.js` - Test configuration and coverage settings
- `turbo.json` - Build system configuration
- `GUIDELINES.md` - Detailed development guidelines and decision framework
- `apps/api/` - Main API application
- `apps/web/` - Next.js web UI (deployed on Vercel)
- `packages/shared/config/` - Configuration system with YAML hierarchy
- `packages/infrastructure/` - Shared infrastructure components
- `.env.example` - Template for local environment variables

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
- Use 'bd' for task tracking
