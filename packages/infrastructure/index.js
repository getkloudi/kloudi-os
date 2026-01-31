/**
 * @kloudi/infrastructure
 *
 * Production-grade infrastructure components for domain-driven development
 *
 * This package provides working implementations for:
 * - Database (Prisma with connection pooling)
 * - Cache (Redis - requires Redis to be available)
 * - Events (Redis Pub/Sub for distributed messaging)
 * - Auth (JWT + bcrypt)
 * - AI (Business-aware AI with provider abstraction)
 * - File System (File operations with logging)
 *
 * Usage (named exports only):
 *   import { Database } from '@kloudi/infrastructure/database';
 *   import { Cache } from '@kloudi/infrastructure/cache';
 *   import { EventBus } from '@kloudi/infrastructure/events';
 *   import { JwtManager } from '@kloudi/infrastructure/auth';
 *   import { AIClient } from '@kloudi/infrastructure/ai';
 *
 *   // Get singleton instances
 *   const db = Database.getInstance();
 *   const cache = Cache.getInstance();
 *   const events = EventBus.getInstance();
 *   const auth = JwtManager.getInstance();
 *
 * For initialization, import the default from main entry:
 *   import initializeInfrastructure from '@kloudi/infrastructure';
 *   await initializeInfrastructure();  // Connects to PostgreSQL, Redis, etc.
 */

import { Config } from '@kloudi/shared/config';
import { Logger } from '@kloudi/shared/logger';
import { RedisAdapter } from './cache/redis-adapter.js';
import { PrismaManager } from './database/prisma-manager.js';
import { EventBus } from './events/event-bus.js';

const logger = Logger.getInstance('infrastructure');

/**
 * Initialize critical infrastructure components for application bootstrap
 *
 * Handles only the essential setup operations that must occur at startup:
 * - Configuration loading and validation
 * - Global logging configuration
 * - Essential service connections (cache, database, AI)
 *
 * Note: This function initializes singleton instances internally.
 * Individual components can be accessed via their respective getInstance() methods.
 *
 * @returns {Promise<void>}
 * @throws {Error} If initialization fails
 */
async function initializeInfrastructure() {
  try {
    logger.info('🚀 Initializing infrastructure components...');

    // 1. Configuration is already loaded via singleton import
    logger.info('✅ Configuration loaded');

    // 2. Configure global logging level
    const logLevel = Config.get('environment.logLevel', 'info');
    Logger.setGlobalLogLevel(logLevel);
    logger.info(`✅ Logger configured (level: ${logLevel})`);

    // 3. Initialize cache (Redis required)
    const cacheInstance = RedisAdapter.getInstance();
    await cacheInstance.initialize();
    logger.info('✅ Cache connections established');

    // 4. Initialize database (PostgreSQL required)
    const dbInstance = PrismaManager.getInstance();
    await dbInstance.initialize();
    logger.info('✅ Database connections established');

    // 5. Initialize EventBus (Redis Pub/Sub required)
    const eventBusInstance = EventBus.getInstance();
    await eventBusInstance.initialize();
    logger.info('✅ EventBus connections established');

    // 6. AI client available for lazy initialization
    logger.info('✅ AI client ready');

    logger.info('🎉 Infrastructure initialization complete');
  } catch (error) {
    logger.error('❌ Infrastructure initialization failed:', error);
    logger.error('Run "docker compose up -d" to start PostgreSQL and Redis');
    throw new Error(`Infrastructure initialization failed: ${error.message}`);
  }
}

export default initializeInfrastructure;
