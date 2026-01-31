## 📡 EventBus - Distributed Event System

The EventBus provides Redis-backed pub/sub messaging for distributed event-driven architecture.

```bash
export EVENTS_ENABLED=true
export EVENTS_RETRY_ATTEMPTS=3
export EVENTS_EVENT_TTL=86400  # Event store TTL in seconds (default: 24 hours)
export EVENTS_DLQ_TTL=604800   # Dead letter queue TTL (default: 7 days)
```

### Overview

- **Redis Pub/Sub**: Real-time distributed messaging across instances
- **Event Store**: Persistent event history in Redis lists with configurable TTL
- **Dead Letter Queue**: Failed events stored for debugging and replay
- **Automatic Retries**: Configurable retry logic with exponential backoff
- **Type Safety**: Typed event payloads with metadata
- **Singleton Pattern**: One EventBus instance per application

### Architecture

```
┌─────────────┐                  ┌─────────────┐
│  Publisher  │──┐            ┌──│ Subscriber  │
└─────────────┘  │            │  └─────────────┘
                 │            │
┌─────────────┐  │  ┌─────┐  │  ┌─────────────┐
│  Publisher  │──┼─▶│Redis│◀─┼──│ Subscriber  │
└─────────────┘  │  │Pub/ │  │  └─────────────┘
                 │  │ Sub │  │
┌─────────────┐  │  └─────┘  │  ┌─────────────┐
│  Publisher  │──┘     │      └──│ Subscriber  │
└─────────────┘        │         └─────────────┘
                       ▼
              ┌────────────────┐
              │ Event Store    │ (24h TTL)
              │ Dead Letter Q  │ (7d TTL)
              └────────────────┘
```

### Basic Usage

#### Publishing Events

```javascript
import { EventBus } from '@kloudi/infrastructure/events';

// Get singleton instance
const eventBus = EventBus.getInstance();

// Publish simple event
await eventBus.publish('user.created', {
  userId: '123',
  email: 'user@example.com',
  name: 'John Doe'
});

// Publish with options
await eventBus.publish(
  'order.completed',
  {
    orderId: '456',
    total: 99.99,
    items: ['item1', 'item2']
  },
  {
    priority: 'high',
    source: 'checkout-service',
    correlationId: 'abc-123'
  }
);
```

#### Subscribing to Events

```javascript
import { EventBus } from '@kloudi/infrastructure/events';

const eventBus = EventBus.getInstance();

// Subscribe to specific event
eventBus.subscribe('user.created', async (event) => {
  console.log('New user:', event.data);
  // Process event...
});

// Subscribe with retry options
eventBus.subscribe(
  'payment.processed',
  async (event) => {
    // Handle payment...
  },
  {
    maxRetries: 3,
    retryDelay: 1000  // milliseconds
  }
);

// Multiple subscribers to same event
eventBus.subscribe('user.created', sendWelcomeEmail);
eventBus.subscribe('user.created', createUserProfile);
eventBus.subscribe('user.created', logUserActivity);
```

### Event Structure

Every event has this structure:

```typescript
{
  id: string;              // Unique event ID (UUID)
  type: string;            // Event type (e.g., 'user.created')
  data: any;               // Event payload
  timestamp: number;       // Unix timestamp
  version: string;         // Event version (default: '1.0')
  source: string;          // Publishing service/component
  priority: string;        // Event priority: 'low' | 'normal' | 'high'
  correlationId?: string;  // For tracing related events
  metadata: {
    attempts: number;      // Retry attempt count
    lastError?: string;    // Last error message (if retried)
  }
}
```

### Advanced Patterns

#### Event Replay

```javascript
// Get events from event store (last 100 by default)
const recentEvents = await eventBus.getRecentEvents('user.created', 50);

// Replay events
for (const event of recentEvents) {
  await eventBus.publish(event.type, event.data, {
    correlationId: `replay-${event.id}`
  });
}
```

#### Dead Letter Queue Monitoring

```javascript
// Get failed events from DLQ
const failedEvents = await eventBus.getDeadLetterQueue(20);

console.log('Failed events:', failedEvents.length);

// Analyze failures
failedEvents.forEach(event => {
  console.log({
    type: event.type,
    attempts: event.metadata.attempts,
    lastError: event.metadata.lastError
  });
});

// Retry failed events
for (const event of failedEvents) {
  await eventBus.publish(event.type, event.data);
}
```

#### Unsubscribing

```javascript
// Store handler reference
const handler = async (event) => {
  console.log('Processing:', event);
};

// Subscribe
eventBus.subscribe('user.created', handler);

// Later, unsubscribe
eventBus.unsubscribe('user.created', handler);
```

#### Cleanup on Shutdown

```javascript
// Graceful shutdown
async function shutdown() {
  const eventBus = EventBus.getInstance();
  await eventBus.disconnect();
  console.log('EventBus disconnected');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### Common Event Patterns

#### Domain Events

```javascript
// User domain
await eventBus.publish('user.created', userData);
await eventBus.publish('user.updated', userData);
await eventBus.publish('user.deleted', { userId });

// Order domain
await eventBus.publish('order.placed', orderData);
await eventBus.publish('order.paid', { orderId, amount });
await eventBus.publish('order.shipped', { orderId, trackingNumber });
await eventBus.publish('order.delivered', { orderId, deliveredAt });
```

#### Saga/Choreography Pattern

```javascript
// Service A: User Registration
await eventBus.publish('user.registered', {
  userId,
  email,
  correlationId: sagaId
});

// Service B: Profile Creation
eventBus.subscribe('user.registered', async (event) => {
  await createProfile(event.data.userId);
  await eventBus.publish('profile.created', {
    userId: event.data.userId,
    correlationId: event.correlationId
  });
});

// Service C: Welcome Email
eventBus.subscribe('profile.created', async (event) => {
  await sendWelcomeEmail(event.data.userId);
  await eventBus.publish('email.sent', {
    userId: event.data.userId,
    type: 'welcome',
    correlationId: event.correlationId
  });
});
```

### Error Handling

```javascript
// Subscriber with error handling
eventBus.subscribe('payment.processed', async (event) => {
  try {
    await processPayment(event.data);
  } catch (error) {
    console.error('Payment processing failed:', error);

    // Publish error event
    await eventBus.publish('payment.failed', {
      orderId: event.data.orderId,
      error: error.message,
      originalEvent: event
    });

    throw error; // Will trigger retry or DLQ
  }
});
```

### Performance Considerations

- **Event Store TTL**: Events are kept for 24 hours by default. Adjust `EVENTS_EVENT_TTL` for your needs.
- **DLQ TTL**: Failed events are kept for 7 days. Adjust `EVENTS_DLQ_TTL` accordingly.
- **Subscriber Performance**: Async handlers run concurrently. Use rate limiting if needed.
- **Redis Connection**: EventBus uses 3 Redis connections (publisher, subscriber, storage).

### Troubleshooting

#### Events not being received

```javascript
// Check if EventBus is initialized
const eventBus = EventBus.getInstance();
console.log('EventBus initialized:', eventBus.isInitialized());

// Check subscriber count
console.log('Active subscribers:', eventBus.getSubscribers('user.created').length);
```

#### Connection issues

```javascript
// EventBus will throw on initialization if Redis is unavailable
try {
  await eventBus.initialize();
} catch (error) {
  console.error('Failed to connect to Redis:', error);
}
```

#### High memory usage

- Reduce `EVENTS_EVENT_TTL` to keep fewer events in memory
- Implement event filtering in subscribers
- Monitor Redis memory usage

### Testing

```javascript
// In tests, you can mock the EventBus
jest.mock('@kloudi/infrastructure/events', () => ({
  EventBus: {
    getInstance: jest.fn(() => ({
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    })),
  },
}));

// Or use a test Redis instance
process.env.REDIS_URL = 'redis://localhost:6380'; // Test Redis
```