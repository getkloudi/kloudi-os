import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { UsageTracker } from '@kloudi/infrastructure/ai';

describe('UsageTracker', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Initialization', () => {
    test('should initialize with required properties', () => {
      const tracker = new UsageTracker({
        provider: 'infrastructure.ai',
        context: 'test',
        businessDomain: 'testing',
        costCenter: 'TEST_CENTER',
      });

      expect(tracker.provider).toBe('infrastructure.ai');
      expect(tracker.context).toBe('test');
      expect(tracker.businessDomain).toBe('testing');
      expect(tracker.costCenter).toBe('TEST_CENTER');
      expect(tracker.tracker).toBeDefined();
    });

    test('should initialize without cost center', () => {
      const tracker = new UsageTracker({
        provider: 'infrastructure.ai',
        context: 'test',
        businessDomain: 'testing',
      });

      expect(tracker.costCenter).toBeUndefined();
      expect(tracker.tracker).toBeDefined();
    });
  });

  describe('Tracking Methods', () => {
    let usageTracker;

    beforeEach(() => {
      usageTracker = new UsageTracker({
        provider: 'infrastructure.ai',
        context: 'test-context',
        businessDomain: 'test-domain',
        costCenter: 'TEST_CENTER',
      });

      usageTracker.tracker = {
        track: jest.fn().mockResolvedValue(true),
      };
    });

    test('should track operations with enriched metadata', async () => {
      const metadata = { provider: 'openai', messageCount: 2 };
      const result = { text: 'test response', usage: { totalTokens: 100 } };

      await usageTracker.track('generateText', metadata, result);

      expect(usageTracker.tracker.track).toHaveBeenCalledWith(
        'generateText',
        {
          ...metadata,
          context: 'test-context',
          businessDomain: 'test-domain',
          operation: 'generateText',
          timestamp: expect.any(String),
        },
        result
      );
    });

    test('should not throw when tracking fails', async () => {
      usageTracker.tracker.track = jest
        .fn()
        .mockRejectedValue(new Error('Tracking failed'));

      await expect(
        usageTracker.track('generateText', {}, {})
      ).resolves.toBeUndefined();

      expect(usageTracker.tracker.track).toHaveBeenCalled();
    });

    test('should add timestamp to metadata', async () => {
      const metadata = { provider: 'openai' };
      const result = { text: 'response' };

      await usageTracker.track('generateText', metadata, result);

      const call = usageTracker.tracker.track.mock.calls[0];
      const enrichedMetadata = call[1];

      expect(enrichedMetadata.timestamp).toBeDefined();
      expect(typeof enrichedMetadata.timestamp).toBe('string');
      expect(new Date(enrichedMetadata.timestamp)).toBeInstanceOf(Date);
    });
  });
});
