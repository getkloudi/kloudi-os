# Configuration System

Built on [node-config](https://github.com/node-config/node-config) for hierarchical configuration.

## File Loading Order

```
default.yml → {NODE_ENV}.yml → local-{NODE_ENV}.yml → env vars
```

| NODE_ENV | Files loaded |
|----------|--------------|
| development | default.yml → local-development.yml → env vars |
| test | default.yml → test.yml → env vars |
| production | default.yml → production.yml → env vars |

## Files

| File | Purpose | Git |
|------|---------|-----|
| `default.yml` | Base defaults for all environments | ✅ Committed |
| `test.yml` | Test environment settings | ✅ Committed |
| `production.yml` | Production environment settings | ✅ Committed |
| `local-development.yml` | Development config (from 1Password) | ❌ Gitignored |
| `custom-environment-variables.yml` | Env var → config mapping | ✅ Committed |

## Setup

1. Get `local-development.yml` from 1Password vault
2. Place in `packages/shared/config/`
3. Run `docker-compose up -d` for Postgres/Redis
4. Start dev server

## Usage

```javascript
import { Config } from '@kloudi/shared/config';

// Get config value using dot notation
const port = Config.get('application.port');
const dbUrl = Config.get('database.url');

// With default value
const logLevel = Config.get('environment.logLevel', 'info');

// Convenience methods
Config.isDevelopment();
Config.isProduction();
Config.getCorsConfig();
```

## CI/CD

CI/CD uses environment variables which override config via `custom-environment-variables.yml`:

```yaml
# custom-environment-variables.yml
database:
  url: 'DATABASE_URL'  # DATABASE_URL env var → database.url
```

Set these in your CI/CD secrets:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- etc.
