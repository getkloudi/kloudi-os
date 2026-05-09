import { describe, test, expect } from '@jest/globals';
import { Logger } from '@kloudi-os/shared/logger';

describe('Logger Module Test', () => {
  test('should create correlation IDs and have logging methods', () => {
    // Test correlation ID generation - demonstrates UUID-like functionality
    const correlationId = Logger.createCorrelationId();
    expect(typeof correlationId).toBe('string');
    expect(correlationId).toMatch(/^[0-9a-f-]+$/); // UUID format
    expect(correlationId.length).toBeGreaterThan(20);

    // Test logger instance creation with fallback context
    const logger = Logger.getInstance('test-context');

    // Even if logger fails to initialize due to config, it should have fallback methods
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });
});
