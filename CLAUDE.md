# AGENTS.md

This file contains essential information for agentic coding agents working in this JS monorepo boilerplate repository.

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

## 🔍 Key Files to Understand

- `package.json` - Root package configuration and scripts
- `eslint.config.js` - Linting rules and architecture boundaries
- `jest.config.js` - Test configuration and coverage settings
- `turbo.json` - Build system configuration
- `GUIDELINES.md` - Detailed development guidelines and decision framework
- `apps/api/` - Main API application
- `packages/infrastructure/` - Shared infrastructure components

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
