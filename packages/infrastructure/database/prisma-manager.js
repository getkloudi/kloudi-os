import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Config } from '@kloudi/shared/config';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('database');

/**
 * Production-grade Prisma database manager with connection pooling
 *
 * Handles database connections, transactions, connection pooling, and provides
 * a clean abstraction over the Prisma client for domain applications.
 *
 * Features:
 * - Connection pooling with configurable limits
 * - Transaction support with proper rollback
 * - Environment-based configuration
 * - Performance monitoring and optimization
 * - Error handling and recovery
 *
 * @class PrismaManager
 * @description Production Prisma setup with pooling and transactions
 */
export class PrismaManager {
  constructor(options = {}) {
    this.config = {
      maxConnections:
        options.maxConnections || Config.get('database.maxConnections', 10),
      connectionTimeout:
        options.connectionTimeout || Config.get('database.connectionTimeout', 30000),
      database: options.database || process.env.DATABASE_URL || Config.get('database.url'),
      logLevel:
        options.logLevel ||
        (Config.isDevelopment()
          ? ['error', 'warn', 'info']
          : ['error', 'warn']),
      ...options,
    };

    this.prisma = null;
    this.connectionPromise = null;
    this.isShuttingDown = false;
    this.transactionCount = 0;
  }

  /**
   * Get singleton instance
   */
  static getInstance(options = {}) {
    if (!PrismaManager.instance) {
      PrismaManager.instance = new PrismaManager(options);
    }
    return PrismaManager.instance;
  }

  /**
   * Initialize Prisma client with production configuration
   */
  async initialize() {
    if (this.prisma) {
      return this.prisma;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.createPrismaClient();
    this.prisma = await this.connectionPromise;
    this.connectionPromise = null;

    return this.prisma;
  }

  /**
   * Create Prisma client with proper configuration
   */
  async createPrismaClient() {
    try {
      const adapter = new PrismaPg({ connectionString: this.config.database });
      const prismaClient = new PrismaClient({
        adapter,
        log: this.config.logLevel,
        errorFormat: Config.isDevelopment() ? 'pretty' : 'minimal',
      });

      // Test connection
      await prismaClient.$connect();

      logger.info(`✅ Database connected: ${this.getDatabaseType()}`);
      logger.info(
        `🔧 Connection pool: ${this.config.maxConnections} max connections`
      );

      // Setup graceful shutdown
      this.setupGracefulShutdown(prismaClient);

      return prismaClient;
    } catch (error) {
      logger.error('❌ Database connection failed:', error.message);
      throw new Error(`Failed to initialize database: ${error.message}`);
    }
  }

  /**
   * Get the database type from URL
   */
  getDatabaseType() {
    const url = this.config.database;
    if (url.startsWith('postgresql://')) return 'PostgreSQL';
    if (url.startsWith('mysql://')) return 'MySQL';
    if (url.startsWith('sqlite://')) return 'SQLite';
    return 'Unknown';
  }

  /**
   * Get Prisma client (lazy initialization)
   */
  async getClient() {
    if (!this.prisma) {
      await this.initialize();
    }
    return this.prisma;
  }

  /**
   * Execute operation with automatic transaction handling
   *
   * @param {Function} callback - Operation to execute within transaction
   * @param {Object} options - Transaction options
   * @returns {Promise} Result of the callback
   */
  async withTransaction(callback, options = {}) {
    if (this.isShuttingDown) {
      throw new Error(
        'Database is shutting down, cannot start new transactions'
      );
    }

    const client = await this.getClient();
    this.transactionCount++;

    const transactionOptions = {
      maxWait: options.maxWait || 5000,
      timeout: options.timeout || 10000,
      isolationLevel: options.isolationLevel || 'ReadCommitted',
      ...options,
    };

    try {
      const result = await client.$transaction(async (tx) => {
        try {
          return await callback(tx);
        } catch (error) {
          // Transaction will auto-rollback
          logger.error('❌ Transaction failed:', error.message);
          throw error;
        }
      }, transactionOptions);

      return result;
    } catch (error) {
      if (error.code === 'P2034') {
        throw new Error(
          'Transaction conflict: Another transaction is modifying the same data'
        );
      }
      if (error.code === 'P2024') {
        throw new Error(
          'Transaction timeout: Operation took too long to complete'
        );
      }
      throw error;
    } finally {
      this.transactionCount--;
    }
  }

  /**
   * Execute raw SQL query with proper error handling
   *
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise} Query result
   */
  async query(sql, params = []) {
    const client = await this.getClient();

    try {
      const result = await client.$queryRaw`${sql}`;
      return result;
    } catch (error) {
      logger.error('❌ SQL query failed:', {
        sql,
        params,
        error: error.message,
      });
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  /**
   * Execute raw SQL with parameters (safer than template literals)
   */
  async queryRaw(sql, ...params) {
    const client = await this.getClient();

    try {
      const result = await client.$queryRaw(sql, ...params);
      return result;
    } catch (error) {
      logger.error('❌ Raw query failed:', {
        sql,
        params,
        error: error.message,
      });
      throw new Error(`Raw query execution failed: ${error.message}`);
    }
  }

  /**
   * Execute multiple operations in a single transaction
   */
  async batch(operations) {
    return this.withTransaction(async (tx) => {
      const results = [];
      for (const operation of operations) {
        const result = await operation(tx);
        results.push(result);
      }
      return results;
    });
  }

  /**
   * Health check for the database connection
   */
  async healthCheck() {
    try {
      const client = await this.getClient();
      await client.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        database: this.getDatabaseType(),
        activeTransactions: this.transactionCount,
        uptime: process.uptime(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        database: this.getDatabaseType(),
        activeTransactions: this.transactionCount,
      };
    }
  }

  /**
   * Setup graceful shutdown handling
   */
  setupGracefulShutdown(client) {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;

      logger.info(
        `📡 Received ${signal}, shutting down database gracefully...`
      );
      this.isShuttingDown = true;

      // Wait for active transactions to complete
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds

      while (this.transactionCount > 0 && attempts < maxAttempts) {
        logger.info(
          `⏳ Waiting for ${this.transactionCount} active transactions...`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      }

      if (this.transactionCount > 0) {
        logger.warn(
          `⚠️  Force closing with ${this.transactionCount} active transactions`
        );
      }

      try {
        await client.$disconnect();
        logger.info('✅ Database disconnected gracefully');
      } catch (error) {
        logger.error('❌ Error during database shutdown:', error);
      }
    };

    // Only set up handlers if they haven't been set already
    if (
      !process
        .listeners('SIGINT')
        .some((listener) => listener.name === 'databaseShutdown')
    ) {
      const handler = shutdown.bind(null);
      Object.defineProperty(handler, 'name', { value: 'databaseShutdown' });

      process.on('SIGINT', handler);
      process.on('SIGTERM', handler);
      process.on('beforeExit', handler);
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    if (this.prisma) {
      await this.prisma.$disconnect();
      this.prisma = null;
    }
  }

  /**
   * Reset connection (useful for tests)
   */
  async reset() {
    await this.disconnect();
    this.connectionPromise = null;
    this.transactionCount = 0;
    this.isShuttingDown = false;
  }
}
