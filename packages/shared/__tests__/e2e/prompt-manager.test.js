import { describe, test, expect } from '@jest/globals';
import { PromptManager } from '@kloudi/shared/prompt-manager';

describe('Prompt Manager Module Test', () => {
  test('should initialize prompt manager and register helpers', () => {
    // Test prompt manager initialization
    const promptManager = new PromptManager();
    expect(promptManager).toBeDefined();

    // Test default helper registration - should not throw
    expect(() => {
      promptManager.registerDefaultHelpers();
    }).not.toThrow();

    // Test that the manager has required methods
    expect(typeof promptManager.render).toBe('function');
    expect(typeof promptManager.renderFromBraintrust).toBe('function');
  });
});
