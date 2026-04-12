import { describe, test, expect } from '@jest/globals';
import { EventBus } from '@kloudi/infrastructure/events';

describe('Events Module Test', () => {
  test('should publish and subscribe to events', async () => {
    const eventBus = new EventBus({ enabled: true });
    let receivedData = null;

    // Subscribe to test event
    const subscriptionId = eventBus.subscribe('test.event', (event) => {
      receivedData = event.data;
    });

    // Publish event
    await eventBus.publish('test.event', {
      message: 'hello world',
      timestamp: Date.now(),
    });

    // Small delay for async processing
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify event was received
    expect(receivedData).not.toBeNull();
    expect(receivedData.message).toBe('hello world');
    expect(receivedData.timestamp).toBeGreaterThan(0);

    // Clean up subscription
    eventBus.unsubscribe(subscriptionId);
  });
});
