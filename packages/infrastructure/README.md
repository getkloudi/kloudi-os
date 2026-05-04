# Infrastructure Package

Production-grade infrastructure services providing AI, caching, database, events, and observability capabilities.

## 📦 Components Overview

### 🤖 AI & LLM Integration

- **Multi-provider support** (OpenAI, Anthropic, etc.)
- **Business context tracking** with cost monitoring
- **Built-in telemetry** with automatic trace flushing
- **[→ Full AI Documentation](./ai/README.md)**

### 📊 Observability

- **OpenTelemetry integration** (Jaeger, SigNoz, Datadog)
- **Automatic telemetry flushing** for reliable tracing
- **Health monitoring** and performance metrics

### 📡 Event Management

- **EventBus** - Redis Pub/Sub event system for domain events
- **Distributed messaging** with Redis for scalable event handling
- **Decoupled communication** between application components
- **Async event processing** with subscriber management
- **Dead letter queue** for failed events (Redis list)
- **Event store** with TTL for event replay (Redis list)

### Data & Storage

- **Database** - Prisma ORM with connection management
- **Caching** - Redis adapter (requires Redis to be available)

## ⚡ Quick Start

### Import Pattern (Named Exports Only)

All infrastructure components use **named exports only** (consistent with `@kloudi/shared`):

```javascript
// ✅ Correct - Named imports (use either full or aliased names)
import { AIClient } from '@kloudi/infrastructure/ai';
import { Database } from '@kloudi/infrastructure/database'; // or PrismaManager
import { Cache } from '@kloudi/infrastructure/cache'; // or RedisAdapter
import { EventBus } from '@kloudi/infrastructure/events';
```

### Initialization

```javascript
import initializeInfrastructure from '@kloudi/infrastructure';

async function startApp() {
  // Initialize all infrastructure (config, cache, database, AI)
  await initializeInfrastructure();

  // Now ready to use components
  const db = Database.getInstance();
  const cache = Cache.getInstance();

  // Your app logic...
}
```

### Using Components

```javascript
// Database (singleton) - use either Database or PrismaManager
import { Database } from '@kloudi/infrastructure/database';
const db = Database.getInstance();
await db.initialize();
const client = await db.getClient();

// With transactions
await db.withTransaction(async (tx) => {
  await tx.user.create({ data: { email: 'test@example.com' } });
});

// Cache (singleton) - use either Cache or RedisAdapter
import { Cache } from '@kloudi/infrastructure/cache';
const cache = Cache.getInstance();
await cache.set('key', { data: 'value' }, 3600);
const value = await cache.get('key');

// AI (create per use case - NOT a singleton)
import { AIClient } from '@kloudi/infrastructure/ai';
const ai = new AIClient({
  context: 'chat-bot',
  provider: 'openai',
  model: 'gpt-4',
  businessDomain: 'customer-support',
});

const result = await ai.generateText([{ role: 'user', content: 'Hello!' }]);

// Events (singleton)
import { EventBus } from '@kloudi/infrastructure/events';
await EventBus.publish('user.created', {
  userId: '123',
  email: 'user@example.com',
});

// Subscribe to events
EventBus.subscribe('user.created', (event) => {
  console.log('User created:', event.data);
});
```

### Environment Setup

```bash
# AI Providers
export OPENAI_API_KEY="your-openai-key"
export ANTHROPIC_API_KEY="your-anthropic-key"

# Observability (choose one)
export JAEGER_ENDPOINT="http://localhost:14268/api/traces"  # Local
export SIGNOZ_OTLP_ENDPOINT="https://ingest.us.signoz.cloud:443"  # Cloud
```

### Database

```bash
export DATABASE_URL="postgresql://user:pass@localhost/db"
export DATABASE_MAX_CONNECTIONS=20
```

### Cache & Events

```bash
export REDIS_URL="redis://localhost:6379"  # Used by Cache and EventBus
export CACHE_TTL=3600
```

## 🌟 Key Features

- ✅ **Automatic telemetry flushing** - Reliable tracing for short-lived processes
- ✅ **Business context tracking** - Cost centers and compliance by domain
- ✅ **Multi-provider AI** - OpenAI, Anthropic with seamless switching
- ✅ **Production-ready** - Error handling, retries, health checks
- ✅ **Zero-config observability** - Works with Jaeger, SigNoz, Datadog

## 🎯 Singleton vs Non-Singleton

Components that use **singleton pattern** (one instance per app):

- ✅ **Database** (PrismaManager) - One database connection pool to PostgreSQL
- ✅ **Cache** (RedisAdapter) - One Redis connection (requires Redis)
- ✅ **EventBus** - One event bus instance for pub/sub messaging

Components that **don't use singleton** (create per use case):

- ❌ **AIClient** - Create new instance per context/model

## 📖 Detailed Documentation

- **[AI & LLM Integration](./ai/README.md)** - Complete AI infrastructure guide
- **[Event Bus](./events//README.md)** = Complete Event Bus guide

## 🏗️ Architecture

```
@kloudi/infrastructure/
├── ai/                    # AI infrastructure with telemetry
│   ├── telemetry/        # OpenTelemetry configuration
│   ├── monitoring/       # Usage tracking
│   └── providers/        # Multi-provider support
├── database/             # Prisma ORM integration
├── cache/                # Redis caching
└── events/               # Event bus for pub/sub messaging
```
