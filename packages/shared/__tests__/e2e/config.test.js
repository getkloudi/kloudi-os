import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Config } from '@kloudi/shared/config';

describe('Config Module Test', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should get and set configuration values', () => {
    // Test getting from environment variable (LOG_LEVEL is mapped in environment-variables.yml)
    process.env.LOG_LEVEL = 'debug';
    // Force reload to pick up env var change
    Config.reload();
    expect(Config.get('LOG_LEVEL')).toBe('debug');

    // Test default value when key doesn't exist
    expect(Config.get('NONEXISTENT_KEY', 'default-value')).toBe(
      'default-value'
    );

    // Test getting YAML path (e.g., 'ai.defaults.provider')
    const yamlValue = Config.get('environment.logLevel', 'info');
    expect(typeof yamlValue).toBe('string');

    // Test setting runtime value
    Config.set('PORT', 4000);
    expect(Config.get('PORT')).toBe(4000);
  });
});
