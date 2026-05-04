import { describe, test, expect } from '@jest/globals';
import { Config } from '@kloudi/shared/config';

describe('Config Module Test', () => {
  test('should get configuration values via dot notation', () => {
    // Use a key that always has a default value regardless of env vars
    const logLevel = Config.get('environment.logLevel');
    expect(logLevel).toBeDefined();
    expect(typeof logLevel).toBe('string');
  });

  test('should return default value when key does not exist', () => {
    expect(Config.get('nonexistent.key', 'fallback')).toBe('fallback');
  });

  test('should return null when key does not exist and no default', () => {
    expect(Config.get('nonexistent.key')).toBeNull();
  });

  test('should detect environment correctly', () => {
    // In test runs, NODE_ENV is "test"
    expect(Config.isDevelopment()).toBe(false);
    expect(Config.isProduction()).toBe(false);
  });

  test('should return cors config', () => {
    const cors = Config.getCorsConfig();
    expect(cors).toHaveProperty('allowedOrigins');
    expect(cors).toHaveProperty('allowedMethods');
    expect(cors).toHaveProperty('allowedHeaders');
    expect(cors).toHaveProperty('allowCredentials');
  });

  test('should resolve nested config paths', () => {
    const logLevel = Config.get('environment.logLevel');
    expect(typeof logLevel).toBe('string');

    const port = Config.get('application.port');
    expect(typeof port).toBe('number');
  });
});
