# @kloudi-os/shared

Cross-cutting utilities for kloudi services: structured logging, env-based config, AES-256-GCM credential crypto, shared types, and Handlebars-based AI prompt templates.

No infrastructure dependencies. Safe to import from any TypeScript or JavaScript project — services, CLIs, tests, even browser tools that consume `./types` or `./constants`.

## Installation

```bash
npm install @kloudi-os/shared
# or
pnpm add @kloudi-os/shared
```

**Requires:** Node.js ≥ 20

## What's in the box

| Subpath                                | Use it for                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `@kloudi-os/shared/logger`             | Structured JSON logger with correlation IDs, log levels, fallback to console if init fails           |
| `@kloudi-os/shared/config`             | Type-safe env-var-based config: `Config.get('database.url')`, `isProduction()`, CORS helpers         |
| `@kloudi-os/shared/crypto/credentials` | AES-256-GCM `encryptCredentials()` / `decryptCredentials()` for storing OAuth tokens, API keys, etc. |
| `@kloudi-os/shared/types`              | Cross-domain TypeScript types: `User`, `Decision`, `Project`, etc.                                   |
| `@kloudi-os/shared/utils`              | Pure functions: `formatDate`, `slugify`, `generateId`                                                |
| `@kloudi-os/shared/constants`          | Enums: `Priority`, `DecisionStatus`, `UserRole`                                                      |
| `@kloudi-os/shared/prompt-manager`     | Handlebars-based AI prompt template loader                                                           |

## Quick start

### Logger

```typescript
import { Logger } from '@kloudi-os/shared/logger';

const logger = Logger.getInstance('my-service');

logger.info('user signed up', { userId: '123', plan: 'pro' });
logger.error('failed to send email', err, { recipient: 'a@b.com' });

// Per-request correlation
const reqLogger = logger.child({ correlationId: req.id });
reqLogger.info('request received');
```

Output is structured JSON in production, pretty-printed in development. Reads `LOG_LEVEL` from env (default `info`).

### Config

```typescript
import { Config } from '@kloudi-os/shared/config';

const dbUrl = Config.get('DATABASE_URL');
const port = Config.get('PORT', 3001); // with default

if (Config.isProduction()) {
  // production-only logic
}
```

### Credential encryption

```typescript
import {
  encryptCredentials,
  decryptCredentials,
} from '@kloudi-os/shared/crypto/credentials';

// Requires ENCRYPTION_KEY env var (32-byte hex — generate: openssl rand -hex 32)
const encrypted = encryptCredentials({ token: 'github_pat_xxx' });
// Store `encrypted` in your database

const restored = decryptCredentials(encrypted);
// → { token: 'github_pat_xxx' }
```

## Environment

| Var              | Purpose                                                            | Default       |
| ---------------- | ------------------------------------------------------------------ | ------------- |
| `LOG_LEVEL`      | `error` \| `warn` \| `info` \| `debug`                             | `info`        |
| `NODE_ENV`       | environment detection                                              | `development` |
| `ENCRYPTION_KEY` | 32-byte hex for `crypto/credentials` (only required if you use it) | —             |

## Companion package

For database/cache/events/AI clients, see [`@kloudi-os/infrastructure`](https://www.npmjs.com/package/@kloudi-os/infrastructure).

## License

MIT — see [LICENSE](https://github.com/getkloudi/kloudi-os/blob/main/LICENSE).

Source: https://github.com/getkloudi/kloudi-os/tree/main/packages/shared
