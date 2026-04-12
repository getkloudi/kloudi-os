import { describe, test, expect } from '@jest/globals';
import { ProviderManager } from '@kloudi/infrastructure/ai';

describe('ProviderManager', () => {
  test('should be importable', () => {
    expect(ProviderManager).toBeDefined();
  });

  test('should have getModel method', () => {
    expect(typeof ProviderManager.getModel).toBe('function');
  });

  test('should throw error for unsupported provider', () => {
    expect(() => {
      ProviderManager.getModel('unsupported', 'model');
    }).toThrow();
  });
});
