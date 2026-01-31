/* eslint-disable no-console */
import { readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load .env file from the nearest ancestor directory into process.env.
 * Walks up from this package's directory to find the monorepo root .env.
 * Does NOT override existing environment variables — explicit env vars
 * (e.g., from the shell or CI) always take precedence.
 *
 * This runs before node-config initializes, so custom-environment-variables.yml
 * can correctly resolve env var mappings like DATABASE_URL, JWT_SECRET, etc.
 */
function loadEnvFile() {
  let dir = __dirname;
  const root = resolve('/');
  while (dir !== root) {
    const envPath = join(dir, '.env');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      return;
    }
    dir = dirname(dir);
  }
}

loadEnvFile();

// Set config directory before importing node-config
process.env.NODE_CONFIG_DIR = __dirname;

// Import node-config after .env is loaded and config dir is set
const config = (await import('config')).default;

/**
 * Configuration management using node-config
 *
 * Loads configuration from YAML files in this priority order:
 * 1. Environment variables (via custom-environment-variables.yml)
 * 2. local.yml (local overrides, gitignored)
 * 3. {NODE_ENV}.yml (development.yml, production.yml, test.yml)
 * 4. default.yml (base defaults)
 *
 * @description Simplified config wrapper around node-config
 */
class Environment {
  constructor() {
    this.config = config;
    this.populateProcessEnv();
    console.info(
      `✅ [config] Configuration loaded (env: ${this.get('environment.nodeEnv', process.env.NODE_ENV || 'development')})`
    );
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!Environment.instance) {
      Environment.instance = new Environment();
    }
    return Environment.instance;
  }

  /**
   * Populate process.env from config for external tools (Prisma, etc.)
   * Only sets values that aren't already in process.env
   */
  populateProcessEnv() {
    const envMappings = {
      DATABASE_URL: 'database.url',
      DATABASE_MAX_CONNECTIONS: 'database.maxConnections',
      REDIS_URL: 'cache.redisUrl',
      CACHE_TYPE: 'cache.type',
      CACHE_DEFAULT_TTL: 'cache.defaultTtl',
      JWT_SECRET: 'auth.jwtSecret',
      JWT_EXPIRES_IN: 'auth.jwtExpiresIn',
      BCRYPT_ROUNDS: 'auth.bcryptRounds',
      NODE_ENV: 'environment.nodeEnv',
      LOG_LEVEL: 'environment.logLevel',
      PORT: 'application.port',
      HOST: 'application.host',
      EVENTS_ENABLED: 'events.enabled',
      EVENTS_RETRY_ATTEMPTS: 'events.retryAttempts',
      CORS_ALLOWED_ORIGINS: 'cors.allowedOrigins',
      CORS_ALLOW_CREDENTIALS: 'cors.allowCredentials',
    };

    let count = 0;
    for (const [envKey, configPath] of Object.entries(envMappings)) {
      if (process.env[envKey] === undefined) {
        const value = this.get(configPath);
        if (value !== null && value !== undefined) {
          process.env[envKey] = String(value);
          count++;
        }
      }
    }

    if (count > 0) {
      console.info(`✅ [config] Populated ${count} environment variables`);
    }
  }
  /**
   * Get configuration value using dot notation
   * @param {string} key - Config key (e.g., 'database.url')
   * @param {*} defaultValue - Default value if key doesn't exist
   */
  get(key, defaultValue = null) {
    try {
      if (this.config.has(key)) {
        return this.config.get(key);
      }
      return defaultValue;
    } catch {
      return defaultValue;
    }
  }

  // Convenience methods
  isDevelopment() {
    return this.get('environment.nodeEnv') === 'development';
  }

  isProduction() {
    return this.get('environment.nodeEnv') === 'production';
  }

  getCorsConfig() {
    return {
      allowedOrigins: this.get('cors.allowedOrigins'),
      allowedMethods: this.get('cors.allowedMethods'),
      allowedHeaders: this.get('cors.allowedHeaders'),
      allowCredentials: this.get('cors.allowCredentials'),
    };
  }
}

// Export singleton instance
const Config = Environment.getInstance();
export { Config };
