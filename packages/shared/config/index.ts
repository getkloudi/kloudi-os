/* eslint-disable no-console */
import { readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

type ConfigValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>;

/**
 * Load .env file from the nearest ancestor directory into process.env.
 * Walks up from this package's directory to find the monorepo root .env.
 * Does NOT override existing environment variables.
 */
function loadEnvFile(filename = '.env'): void {
  let dir = __dirname;
  // When running from dist/, start from the package root
  if (dir.includes('/dist/')) {
    dir = dir.replace(/\/dist\/.*$/, '');
  }
  const root = resolve('/');
  while (dir !== root) {
    const envPath = join(dir, filename);
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

// Load environment-specific .env file first (higher priority values),
// then base .env (fills in anything not already set)
const nodeEnv = process.env['NODE_ENV'] ?? 'development';
if (nodeEnv === 'test') {
  loadEnvFile('.env.test');
}
loadEnvFile('.env');

/**
 * Read an env var, returning undefined if missing.
 */
function env(key: string): string | undefined {
  return process.env[key];
}

/**
 * Build the full config object from environment variables + defaults.
 *
 * Priority: env var > default value
 * No YAML, no merge hierarchy, no node-config.
 */
function buildConfig() {
  const isBeta = nodeEnv === 'beta';
  const isProduction = nodeEnv === 'production' || isBeta;
  const isDevelopment = nodeEnv === 'development';

  return {
    database: {
      url: env('DATABASE_URL'),
      maxConnections: Number(
        env('DATABASE_MAX_CONNECTIONS') ?? (isProduction ? 50 : isDevelopment ? 5 : 10)
      ),
      connectionTimeout: Number(
        env('DATABASE_CONNECTION_TIMEOUT') ?? (isProduction ? 60000 : 30000)
      ),
      ssl: env('DB_SSL_ENABLED') === 'true',
    },
    cache: {
      type: env('CACHE_TYPE') ?? 'redis',
      redisUrl: env('REDIS_URL'),
      defaultTtl: Number(
        env('CACHE_DEFAULT_TTL') ?? (isProduction ? 7200 : isDevelopment ? 1800 : 300)
      ),
      maxMemory: env('CACHE_MAX_MEMORY'),
    },
    auth: {
      jwtSecret: env('JWT_SECRET'),
      jwtExpiresIn: env('JWT_EXPIRES_IN') ?? (isProduction ? '24h' : isDevelopment ? '12h' : '15m'),
      bcryptRounds: Number(env('BCRYPT_ROUNDS') ?? (isProduction ? 14 : 10)),
      sessionSecret: env('SESSION_SECRET'),
    },
    environment: {
      nodeEnv,
      logLevel:
        env('LOG_LEVEL') ?? (isBeta ? 'info' : isProduction ? 'warn' : isDevelopment ? 'debug' : 'error'),
    },
    events: {
      enabled: env('EVENTS_ENABLED') !== 'false',
      retryAttempts: Number(env('EVENTS_RETRY_ATTEMPTS') ?? (isProduction ? 5 : 3)),
    },
    application: {
      port: Number(env('PORT') ?? (isProduction ? 8080 : isDevelopment ? 3001 : 3002)),
      host: env('HOST') ?? (isDevelopment ? 'localhost' : '0.0.0.0'),
    },
    cors: {
      allowedOrigins: env('CORS_ALLOWED_ORIGINS') ?? '',
      allowedMethods: env('CORS_ALLOWED_METHODS') ?? 'GET,POST,PUT,DELETE',
      allowedHeaders:
        env('CORS_ALLOWED_HEADERS') ?? 'Content-Type,Authorization',
      allowCredentials:
        env('CORS_ALLOW_CREDENTIALS') === 'true' || false,
    },
    ai: {
      provider: env('AI_PROVIDER') ?? 'openai',
      model: env('AI_MODEL') ?? (isDevelopment ? 'gpt-3.5-turbo' : 'gpt-4'),
      temperature: Number(env('AI_TEMPERATURE') ?? (isDevelopment ? 0.8 : 0.3)),
      apiKeys: {
        openai: env('OPENAI_API_KEY'),
        anthropic: env('ANTHROPIC_API_KEY'),
        azure: env('AZURE_OPENAI_API_KEY'),
        google: env('GOOGLE_AI_API_KEY'),
      },
      endpoints: {
        openai: env('OPENAI_API_BASE_URL'),
        azure: env('AZURE_OPENAI_ENDPOINT'),
      },
      models: {
        defaultModel: env('AI_DEFAULT_MODEL'),
        fallbackModel: env('AI_FALLBACK_MODEL'),
      },
    },
    services: {
      stripe: {
        secretKey: env('STRIPE_SECRET_KEY'),
        webhookSecret: env('STRIPE_WEBHOOK_SECRET'),
      },
      aws: {
        accessKeyId: env('AWS_ACCESS_KEY_ID'),
        secretAccessKey: env('AWS_SECRET_ACCESS_KEY'),
        region: env('AWS_REGION'),
      },
      sendgrid: {
        apiKey: env('SENDGRID_API_KEY'),
      },
    },
    promptManagement: {
      braintrust: {
        projectName: env('BRAINTRUST_PROJECT_NAME'),
        apiKey: env('BRAINTRUST_API_KEY'),
      },
    },
  };
}

type NestedRecord = Record<string, unknown>;

/**
 * Resolve a dot-notation path against a nested object.
 * e.g. getByPath(config, 'database.url') → config.database.url
 */
function getByPath(obj: NestedRecord, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as NestedRecord)[part];
  }
  return current;
}

/**
 * Configuration — backed by env vars + sensible defaults.
 *
 * Same API as before: Config.get('database.url'), Config.isDevelopment(), etc.
 * No YAML files, no node-config, no merge hierarchy.
 */
class Environment {
  private static instance: Environment;
  private data: ReturnType<typeof buildConfig>;

  constructor() {
    this.data = buildConfig();
    console.info(
      `✅ [config] Configuration loaded (env: ${this.data.environment.nodeEnv})`
    );
  }

  static getInstance(): Environment {
    if (!Environment.instance) {
      Environment.instance = new Environment();
    }
    return Environment.instance;
  }

  /**
   * Get configuration value using dot notation.
   * e.g. Config.get('database.url'), Config.get('cache.defaultTtl', 3600)
   */
  get<T extends ConfigValue = ConfigValue>(
    key: string,
    defaultValue: T | null = null
  ): T | null {
    const value = getByPath(this.data as unknown as NestedRecord, key);
    if (value === undefined || value === null) {
      return defaultValue;
    }
    return value as T;
  }

  isDevelopment(): boolean {
    return this.data.environment.nodeEnv === 'development';
  }

  isProduction(): boolean {
    return this.data.environment.nodeEnv === 'production';
  }

  getCorsConfig() {
    return {
      allowedOrigins: this.data.cors.allowedOrigins,
      allowedMethods: this.data.cors.allowedMethods,
      allowedHeaders: this.data.cors.allowedHeaders,
      allowCredentials: this.data.cors.allowCredentials,
    };
  }
}

const Config = Environment.getInstance();
export { Config };
