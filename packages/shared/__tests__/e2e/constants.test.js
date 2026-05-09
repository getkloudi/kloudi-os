import { describe, test, expect } from '@jest/globals';
import { API_LIMITS, REGEX_PATTERNS } from '@kloudi-os/shared/constants';

describe('Constants Module Test', () => {
  test('should provide platform-wide constants', () => {
    // Test API limits - demonstrates centralized configuration
    expect(API_LIMITS.MAX_PAGE_SIZE).toBe(100);
    expect(API_LIMITS.DEFAULT_PAGE_SIZE).toBe(20);
    expect(typeof API_LIMITS).toBe('object');

    // Test regex patterns - demonstrates validation patterns
    expect(typeof REGEX_PATTERNS.EMAIL.source).toBe('string');
    const emailRegex = REGEX_PATTERNS.EMAIL;
    expect(emailRegex.test('test@example.com')).toBe(true);
    expect(emailRegex.test('invalid-email')).toBe(false);
  });
});
