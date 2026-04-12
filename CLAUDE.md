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
- Always use `git pull --rebase` — never create merge commits on pull
- All work happens on `develop` — never commit directly to `main`
- `main` only receives code through PRs from `develop`
- Do not create or modify GitHub Actions workflows
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

### Branching & Environments

| Branch | Environment | Deploy trigger |
|---|---|---|
| `develop` | Beta | Auto on push |
| `main` | Production | Auto on push |

CLI publishes to npm only from `main` via `cli-v*` GitHub release tags.

### Platform Layout

| | Beta | Production |
|---|---|---|
| **API** (Render) | `kloudi-api-beta` → https://kloudi-api-beta-wivn.onrender.com | `kloudi-api-prod` → https://kloudi-api-prod.onrender.com |
| **Database** (Neon) | `kloudi-os-beta` (curly-grass-31791879) | `kloudi-os` (dry-fog-30866369) |
| **Cache** (Upstash) | `kloudios-beta-redis` (KloudiOS Beta team) | `kloudios-prod-redis` (KloudiOS Prod team) |
| **Web** (Vercel) | PR previews | `kloudi-os-web` on push to `main` |
| **CLI** (npm) | — | `@kloudi/cli` on `cli-v*` tag |
| **MCP** | Mounted on API (future) | Mounted on API (future) |
| **Internal API** (Render) | `kloudi-internal-api` (Beta workspace) | — |
| **Ops Dashboard** (Vercel) | `kloudi-os-ops` | — |

All services in **us-east / Virginia**. All free tier. Each environment has fully isolated workspaces across Render, Neon, and Upstash.

### Render

| | Beta | Prod |
|---|---|---|
| **Workspace** | KloudiOS Beta (tea-d7dq40jeo5us73fr9ve0) | KloudiOS Prod (tea-d7dnd8vaqgkc73fomlmg) |
| **Service** | `kloudi-api-beta` (srv-d7dqddt7vvec73fog8ng) | `kloudi-api-prod` (srv-d7dqhre7r5hc73d5regg) |
| **Branch** | `develop` | `main` |
| **Runtime** | Docker | Docker |
| **Region** | Virginia | Virginia |
| **Plan** | Free | Free |
| **Health** | `GET /health` | `GET /health` |

### Neon (PostgreSQL)

| | Beta | Prod |
|---|---|---|
| **Org** | KloudiOS Beta | KloudiOS Prod |
| **Project** | `kloudi-os-beta` (curly-grass-31791879) | `kloudi-os` (dry-fog-30866369) |
| **Region** | aws-us-east-1 | aws-us-east-1 |
| **PG version** | 17 | 17 |

### Upstash (Redis)

| | Beta | Prod |
|---|---|---|
| **Team** | KloudiOS Beta | KloudiOS Prod |
| **Database** | `kloudios-beta-redis` | `kloudios-prod-redis` |
| **Region** | us-east-1 | us-east-1 |

### Vercel (Web)

- **Project**: `kloudi-os-web` on team `nitish-mehrotras-projects-cd0dbf7d`
- **Root Directory**: `apps/web`
- **Build Command**: `turbo run build` (auto-detected)
- **PR previews**: Automatic
- **Production**: Deploys on push to `main`

### Internal Dashboard

**Internal API** (Render):
- **Service**: `kloudi-internal-api` in KloudiOS Beta workspace
- **Runtime**: Docker (root-dir: `apps/internal-api`)
- **Branch**: `develop`
- **Port**: 3002
- **Health**: `GET /health`
- **Auth**: Google OAuth + email allowlist (`OPS_ALLOWED_EMAILS`)
- **DB**: Same Neon beta instance (shared `DATABASE_URL`)

**Ops Dashboard** (Vercel):
- **Project**: `kloudi-os-ops`
- **Root Directory**: `apps/ops`
- **Port**: 3003 (dev)
- **Env**: `NEXT_PUBLIC_OPS_API_URL` points to internal-api Render URL

### CLI Tools

```bash
# Render
render login
render deploys list srv-d7dqhre7r5hc73d5regg --output text  # prod
render deploys list srv-d7dqddt7vvec73fog8ng --output text   # beta

# Neon
neonctl projects list
neonctl connection-string --project-id dry-fog-30866369       # prod
neonctl connection-string --project-id curly-grass-31791879   # beta

# Upstash
npx @upstash/cli redis list --json

# Vercel (MCP configured)
claude mcp add --transport http vercel https://mcp.vercel.com

# CLI publish (from main only)
git tag cli-v0.1.0 && git push origin cli-v0.1.0
# Then create GitHub release from the tag
```

## ⚙️ Configuration System

Configuration uses **env vars only** — no YAML files, no `node-config`.

```
.env              # Local dev secrets (gitignored)
.env.test         # Test env overrides (gitignored)
.env.example      # Template — commit to git
Dashboard         # Production values (Render, Vercel, etc.)
```

- `packages/shared/config/index.ts` loads `.env`, builds a typed config object with per-environment defaults
- Access via `Config.get('database.url')`, `Config.isDevelopment()`, `Config.getCorsConfig()`
- Env vars always win over defaults. No merge hierarchy.
- New developers: `cp .env.example .env` and fill in values
- Production: set env vars in the hosting dashboard (Render, Vercel, etc.)

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
- `packages/shared/config/` - Configuration system (env vars + defaults)
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
