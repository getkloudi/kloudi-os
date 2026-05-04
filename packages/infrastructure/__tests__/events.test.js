// TODO: Restore EventBus integration tests.
// Removed because:
// - EventBus({ enabled: true }) connects to Redis on construction.
//   The test had no Redis mock or graceful fallback, so it NPE'd on
//   null Redis client (subscribe, lpush, publish all failed).
// - Originally lived in packages/shared (layer violation — shared
//   should not depend on infrastructure). Moved here, then removed.
// To bring back:
// - Add a local-only / in-memory mode to EventBus for unit testing
//   (e.g. { enabled: true, transport: 'memory' }).
// - Or write as a proper integration test that requires REDIS_URL
//   and skip when Redis is unavailable.

import { describe, test } from '@jest/globals';

describe('EventBus', () => {
  test.todo('should publish and subscribe to events');
  test.todo('should unsubscribe from events');
  test.todo('should handle event store TTL');
});
