import { describe, test, expect } from '@jest/globals';
import { UsageTracker } from '@kloudi/infrastructure/ai';

// TODO: Expand tests when UsageTracker is implemented beyond no-op stub.
// Currently UsageTracker is a placeholder that accepts config but doesn't
// store properties or emit events. Once domain event pattern is wired up
// (see usage-tracker.ts TODO), add tests for:
// - Config is stored and accessible
// - track() emits domain events with enriched metadata
// - track() failures don't propagate (silent fail)

describe('UsageTracker', () => {
  test('should be constructable with config', () => {
    const tracker = new UsageTracker({
      provider: 'infrastructure.ai',
      context: 'test',
      businessDomain: 'testing',
      costCenter: 'TEST_CENTER',
    });

    expect(tracker).toBeDefined();
  });

  test('should resolve track() without throwing', async () => {
    const tracker = new UsageTracker({
      provider: 'infrastructure.ai',
      context: 'test',
      businessDomain: 'testing',
      costCenter: 'TEST_CENTER',
    });

    await expect(
      tracker.track(
        'generateText',
        { provider: 'openai' },
        { text: 'response' }
      )
    ).resolves.toBeUndefined();
  });
});
