import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { UsageTracker } from '../monitoring/usage-tracker.js';

describe('UsageTracker', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    // Mock console methods to avoid cluttering test output
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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

      // Mock the underlying tracker
      usageTracker.tracker = {
        track: vi.fn().mockResolvedValue(true),
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
      // Mock the tracker to throw an error
      usageTracker.tracker.track = vi
        .fn()
        .mockRejectedValue(new Error('Tracking failed'));

      // Should not throw
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
