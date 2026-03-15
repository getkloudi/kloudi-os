import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { Config } from '@kloudi/shared/config';
import { Logger } from '@kloudi/shared/logger';

/** Logger interface from shared package */
interface LoggerInstance {
  info: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, error?: Error | null, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  debug: (message: string, metadata?: Record<string, unknown>) => void;
}

const logger: LoggerInstance = Logger.getInstance('cache');

/** Configuration options for RedisAdapter */
interface RedisAdapterConfig {
  /** Redis connection URL */
  redisUrl?: string;
  /** Default TTL for cache entries in seconds */
  defaultTtl?: number;
  /** Retry delay on failover in milliseconds */
  retryDelayOnFailover?: number;
  /** Maximum retries per request */
  maxRetriesPerRequest?: number;
  /** Additional options */
  [key: string]: unknown;
}

/** Cache statistics */
interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

/** Health check result */
interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  type: 'redis';
  error?: string;
}

/**
 * Redis cache adapter
 *
 * Provides a Redis-based caching interface. Requires Redis to be available.
 * The application will fail if Redis is not accessible.
 *
 * Features:
 * - Redis connection with retry logic
 * - TTL support with configurable defaults
 * - Pattern-based cache invalidation
 * - Performance metrics and monitoring
 * - Strict error handling (no fallback)
 */
export class RedisAdapter {
  private static instance: RedisAdapter | null = null;

  private config: Required<Pick<RedisAdapterConfig, 'redisUrl' | 'defaultTtl' | 'retryDelayOnFailover' | 'maxRetriesPerRequest'>> & RedisAdapterConfig;
  private redis: Redis | null;
  private connectionPromise: Promise<void> | null;
  private stats: CacheStats;

  constructor(options: RedisAdapterConfig = {}) {
    this.config = {
      redisUrl: options.redisUrl ?? (Config.get('cache.redisUrl') as string | null) ?? process.env['REDIS_URL'] ?? '',
      defaultTtl: options.defaultTtl ?? (Config.get('cache.defaultTtl', 3600) as number),
      retryDelayOnFailover: options.retryDelayOnFailover ?? 100,
      maxRetriesPerRequest: options.maxRetriesPerRequest ?? 3,
      ...options,
    };

    this.redis = null;
    this.connectionPromise = null;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };

    // Note: initialize() must be called explicitly - no auto-connect
  }

  /**
   * Get singleton instance
   */
  static getInstance(options: RedisAdapterConfig = {}): RedisAdapter {
    if (!RedisAdapter.instance) {
      RedisAdapter.instance = new RedisAdapter(options);
    }
    return RedisAdapter.instance;
  }

  /**
   * Initialize cache connection
   */
  async initialize(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.connectToRedis();
    await this.connectionPromise;
    this.connectionPromise = null;
  }

  /**
   * Connect to Redis with error handling
   */
  private async connectToRedis(): Promise<void> {
    const redisOptions: RedisOptions = {
      retryStrategy: (times: number) => {
        if (times > this.config.maxRetriesPerRequest) {
          return null;
        }
        return Math.min(times * this.config.retryDelayOnFailover, 2000);
      },
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
    };

    this.redis = new Redis(this.config.redisUrl, redisOptions);

    // Event handlers
    this.redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.redis.on('error', (error: Error) => {
      logger.error('Redis connection error', error);
      this.stats.errors++;
    });

    this.redis.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    this.redis.on('ready', () => {
      logger.info('Redis ready for operations');
    });

    // Test connection - will throw if Redis is unavailable
    try {
      await this.redis.connect();
      await this.redis.ping();
      logger.info('Cache: Using Redis for caching');
    } catch (error) {
      const err = error as Error;
      logger.error('Redis connection failed', err);
      throw new Error(`Redis connection failed: ${err.message}`);
    }
  }

  /**
   * Get value from cache
   *
   * @param key - Cache key
   * @returns Cached value or null
   * @throws If Redis operation fails
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) {
      throw new Error('Redis client is not initialized');
    }

    try {
      const value = await this.redis.get(key);
      if (value !== null) {
        this.stats.hits++;
        return JSON.parse(value) as T;
      }

      this.stats.misses++;
      return null;
    } catch (error) {
      const err = error as Error;
      logger.error('Cache get error', err);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Set value in cache
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in seconds (default: config.defaultTtl)
   * @returns Success status
   * @throws If Redis operation fails
   */
  async set<T>(key: string, value: T, ttl: number | null = null): Promise<boolean> {
    if (!this.redis) {
      throw new Error('Redis client is not initialized');
    }

    const actualTtl = ttl ?? this.config.defaultTtl;

    try {
      await this.redis.setex(key, actualTtl, JSON.stringify(value));
      this.stats.sets++;
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error('Cache set error', err);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Delete value from cache
   *
   * @param key - Cache key
   * @returns Success status
   * @throws If Redis operation fails
   */
  async delete(key: string): Promise<boolean> {
    if (!this.redis) {
      throw new Error('Redis client is not initialized');
    }

    try {
      const result = await this.redis.del(key);
      const deleted = result > 0;

      if (deleted) {
        this.stats.deletes++;
      }

      return deleted;
    } catch (error) {
      const err = error as Error;
      logger.error('Cache delete error', err);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   *
   * @param pattern - Pattern to match (e.g., "user:*")
   * @returns Number of keys deleted
   * @throws If Redis operation fails
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.redis) {
      throw new Error('Redis client is not initialized');
    }

    try {
      let deletedCount = 0;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        deletedCount = await this.redis.del(...keys);
      }

      this.stats.deletes += deletedCount;
      return deletedCount;
    } catch (error) {
      const err = error as Error;
      logger.error('Cache pattern delete error', err);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Clear all cache entries
   *
   * @returns Success status
   * @throws If Redis operation fails
   */
  async clear(): Promise<boolean> {
    if (!this.redis) {
      throw new Error('Redis client is not initialized');
    }

    try {
      await this.redis.flushall();
      logger.info('Cache cleared successfully');
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error('Cache clear error', err);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.redis) {
      return {
        status: 'unhealthy',
        error: 'Redis client is not initialized',
        type: 'redis',
      };
    }

    try {
      const testKey = '__health_check__';
      const testValue = Date.now();

      await this.set(testKey, testValue, 10);
      const retrieved = await this.get<number>(testKey);
      await this.delete(testKey);

      const isHealthy = retrieved === testValue;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        type: 'redis',
      };
    } catch (error) {
      const err = error as Error;
      return {
        status: 'unhealthy',
        error: err.message,
        type: 'redis',
      };
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect();
      this.redis = null;
    }
  }
}
