# @kloudi-os/infrastructure

Production-ready service clients for kloudi services: PostgreSQL via Prisma, Redis cache, Redis Pub/Sub event bus, and a multi-provider AI client. Singleton-managed with graceful shutdown, health checks, and connection pooling.

For pure utilities (logger, config, crypto), see [`@kloudi-os/shared`](https://www.npmjs.com/package/@kloudi-os/shared).

## Installation

```bash
npm install @kloudi-os/infrastructure
# or
pnpm add @kloudi-os/infrastructure
```

**Requires:**

- Node.js ≥ 20
- A running PostgreSQL instance (for `database`)
- A running Redis instance (for `cache` and `events`)
- `prisma` as a peer dependency: `npm install -D prisma`

`@kloudi-os/shared` is a transitive dependency — installed automatically.

## What's in the box

| Subpath                              | Use it for                                                                                         | Singleton?                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------- |
| `@kloudi-os/infrastructure/database` | Prisma client wrapper. Connection pooling (50 max), graceful shutdown, transactions, health checks | Yes                           |
| `@kloudi-os/infrastructure/cache`    | Redis adapter (ioredis): `set/get/delete` with TTL, namespacing                                    | Yes                           |
| `@kloudi-os/infrastructure/events`   | Redis Pub/Sub event bus: `publish/subscribe`, dead-letter queue, event store with TTL              | Yes                           |
| `@kloudi-os/infrastructure/ai`       | Multi-provider AI client (OpenAI, Anthropic) with telemetry and cost tracking                      | No — instantiate per use case |

## Quick start

### Initialize once at app boot

```typescript
import initializeInfrastructure from '@kloudi-os/infrastructure';

async function startApp() {
  await initializeInfrastructure();
  // Connects in order: cache → database → events.
  // Throws if any required service is unavailable.
}
```

`initializeInfrastructure()` reads connection strings from env vars (see below), creates singletons, and verifies connectivity. Call this before any `getInstance()`.

### Database

```typescript
import { Database } from '@kloudi-os/infrastructure/database';

const db = Database.getInstance();
const client = await db.getClient(); // Prisma client

const user = await client.user.findUnique({ where: { id: '123' } });

// Transactions
await db.withTransaction(async (tx) => {
  await tx.user.create({ data: { email: 'test@example.com' } });
  await tx.session.create({ data: { userId: 'new', token: 'abc' } });
});
```

### Cache

```typescript
import { Cache } from '@kloudi-os/infrastructure/cache';

const cache = Cache.getInstance();

await cache.set('user:123', { name: 'Sarah' }, 3600); // TTL in seconds
const user = await cache.get('user:123');
await cache.delete('user:123');
```

### Events

```typescript
import { EventBus } from '@kloudi-os/infrastructure/events';

const bus = EventBus.getInstance();

await bus.publish('user.created', { userId: '123', email: 'a@b.com' });

bus.subscribe('user.created', async (event) => {
  console.log('new user:', event.data);
});
```

Failed handlers go to a dead-letter queue (Redis list); events are persisted with TTL for replay.

### AI (per-instance, not singleton)

```typescript
import { AIClient } from '@kloudi-os/infrastructure/ai';

const ai = new AIClient({
  context: 'support-bot',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  businessDomain: 'customer-support',
});

const result = await ai.generateText([
  { role: 'user', content: 'How do I reset my password?' },
]);
```

Built-in telemetry tracks token usage, latency, and cost per `businessDomain` for chargeback.

## Environment

| Var                        | Required for              | Notes                                                         |
| -------------------------- | ------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`             | `database`                | `postgresql://user:pass@host:5432/db`                         |
| `DATABASE_MAX_CONNECTIONS` | `database` (optional)     | default `50`                                                  |
| `REDIS_URL`                | `cache`, `events`         | `redis://host:6379` or `rediss://` for TLS                    |
| `CACHE_TTL`                | `cache` (optional)        | default TTL in seconds for `set()` calls without explicit TTL |
| `OPENAI_API_KEY`           | `ai` (if using OpenAI)    | —                                                             |
| `ANTHROPIC_API_KEY`        | `ai` (if using Anthropic) | —                                                             |
| `LOG_LEVEL`                | all                       | inherited from `@kloudi-os/shared`                            |

## Singleton vs per-instance

| Component                       | Why                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Database`, `Cache`, `EventBus` | Shared connection pools — one per process                                                                       |
| `AIClient`                      | Each context (e.g., support-bot vs code-reviewer) wants its own model, telemetry namespace, and business domain |

## Companion package

For logging, config, types, and crypto utilities, see [`@kloudi-os/shared`](https://www.npmjs.com/package/@kloudi-os/shared).

## License

MIT — see [LICENSE](https://github.com/getkloudi/kloudi-os/blob/main/LICENSE).

Source: https://github.com/getkloudi/kloudi-os/tree/main/packages/infrastructure
