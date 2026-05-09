import { describe, test, expect } from '@jest/globals';
import { slugify, generateId } from '@kloudi-os/shared/utils';

describe('Utils Module Test', () => {
  test('should perform utility functions correctly', () => {
    // Test slugify - demonstrates pure function behavior
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('Testing 123')).toBe('testing-123');

    // Test generateId - demonstrates random string generation
    const id = generateId(8);
    expect(id).toHaveLength(8);
    expect(typeof id).toBe('string');
    expect(/^[A-Za-z0-9]+$/.test(id)).toBe(true);
  });
});
