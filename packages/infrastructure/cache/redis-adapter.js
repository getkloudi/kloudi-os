import RedisPkg from 'ioredis';
const Redis = RedisPkg;
import { Config } from '@kloudi/shared/config';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('cache');

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
 *
 * @class RedisAdapter
 * @description Redis adapter for caching (no fallback)
 */
export class RedisAdapter {
  constructor(options = {}) {
    this.config = {
      redisUrl: options.redisUrl || Config.get('cache.redisUrl') || process.env.REDIS_URL,
      defaultTtl: options.defaultTtl || Config.get('cache.defaultTtl', 3600),
      retryDelayOnFailover: options.retryDelayOnFailover || 100,
      maxRetriesPerRequest: options.maxRetriesPerRequest || 3,
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
  static getInstance(options = {}) {
    if (!RedisAdapter.instance) {
      RedisAdapter.instance = new RedisAdapter(options);
    }
    return RedisAdapter.instance;
  }

  /**
   * Initialize cache connection
   */
  async initialize() {
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
  async connectToRedis() {
    this.redis = new Redis(this.config.redisUrl, {
      retryDelayOnFailover: this.config.retryDelayOnFailover,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    // Event handlers
    this.redis.on('connect', () => {
      logger.info('✅ Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      logger.error('❌ Redis connection error:', error.message);
      this.stats.errors++;
    });

    this.redis.on('reconnecting', () => {
      logger.info('🔄 Redis reconnecting...');
    });

    this.redis.on('ready', () => {
      logger.info('🚀 Redis ready for operations');
    });

    // Test connection - will throw if Redis is unavailable
    try {
      await this.redis.connect();
      await this.redis.ping();
      logger.info('✅ Cache: Using Redis for caching');
    } catch (error) {
      logger.error(`❌ Redis connection failed: ${error.message}`);
      throw new Error(`Redis connection failed: ${error.message}`);
    }
  }

  /**
   * Get value from cache
   *
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null
   * @throws {Error} If Redis operation fails
   */
  async get(key) {
    if (!this.redis) {
      throw new Error('Redis client is not initialized');
    }

    try {
      const value = await this.redis.get(key);
      if (value !== null) {
        this.stats.hits++;
        return JSON.parse(value);
      }

      this.stats.misses++;
      return null;
    } catch (error) {
      logger.error('❌ Cache get error:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Set value in cache
   *
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (default: config.defaultTtl)
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If Redis operation fails
   */
  async set(key, value, ttl = null) {
    if (!this.redis) {
      throw new Error('Redis client is not initialized');
    }

    const actualTtl = ttl || this.config.defaultTtl;

    try {
      await this.redis.setex(key, actualTtl, JSON.stringify(value));
      this.stats.sets++;
      return true;
    } catch (error) {
      logger.error('❌ Cache set error:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Delete value from cache
   *
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If Redis operation fails
   */
  async delete(key) {
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
      logger.error('❌ Cache delete error:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   *
   * @param {string} pattern - Pattern to match (e.g., "user:*")
   * @returns {Promise<number>} Number of keys deleted
   * @throws {Error} If Redis operation fails
   */
  async deletePattern(pattern) {
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
      logger.error('❌ Cache pattern delete error:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Clear all cache entries
   *
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If Redis operation fails
   */
  async clear() {
    if (!this.redis) {
      throw new Error('Redis client is not initialized');
    }

    try {
      await this.redis.flushall();
      logger.info('🧹 Cache cleared successfully');
      return true;
    } catch (error) {
      logger.error('❌ Cache clear error:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
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
      const retrieved = await this.get(testKey);
      await this.delete(testKey);

      const isHealthy = retrieved === testValue;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        type: 'redis',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        type: 'redis',
      };
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.redis) {
      await this.redis.disconnect();
      this.redis = null;
    }
  }
}
