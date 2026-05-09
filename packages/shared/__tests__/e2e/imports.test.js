import { describe, test, expect } from '@jest/globals';

// Import ALL exported submodules - this will fail if any export is broken
import { UserRole } from '@kloudi-os/shared/types';
import { slugify, generateId } from '@kloudi-os/shared/utils';
import { API_LIMITS } from '@kloudi-os/shared/constants';
import { Config } from '@kloudi-os/shared/config';
import { Logger } from '@kloudi-os/shared/logger';
import { PromptManager } from '@kloudi-os/shared/prompt-manager';

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
