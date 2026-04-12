import { describe, test, expect } from '@jest/globals';

// Import ALL exported submodules - this will fail if any export is broken
import { UserRole } from '@kloudi/shared/types';
import { slugify, generateId } from '@kloudi/shared/utils';
import { API_LIMITS } from '@kloudi/shared/constants';
import { Config } from '@kloudi/shared/config';
import { Logger } from '@kloudi/shared/logger';
import { PromptManager } from '@kloudi/shared/prompt-manager';

describe('Package Import Test', () => {
  test('should import all submodules successfully', () => {
    // TypeScript source modules
    expect(UserRole).toBeDefined();

    // Utils module
    expect(slugify).toBeDefined();
    expect(generateId).toBeDefined();

    // Constants module
    expect(API_LIMITS).toBeDefined();

    // JavaScript source modules
    expect(Config).toBeDefined();
    expect(Logger).toBeDefined();
    expect(PromptManager).toBeDefined();
  });
});
