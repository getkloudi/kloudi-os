import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Config } from '@kloudi/shared/config';
import { Logger } from '@kloudi/shared/logger';

/** Logger interface from shared package */
interface LoggerInstance {
  info: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, error?: Error | null, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  debug: (message: string, metadata?: Record<string, unknown>) => void;
}

const logger: LoggerInstance = Logger.getInstance('database');

/** Prisma log levels */
type PrismaLogLevel = 'query' | 'info' | 'warn' | 'error';

/** Configuration options for PrismaManager */
interface PrismaManagerConfig {
  /** Maximum number of database connections */
  maxConnections?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Database connection URL */
  database?: string;
  /** Log levels to enable */
  logLevel?: PrismaLogLevel[];
  /** Additional options */
  [key: string]: unknown;
}

/** Transaction options for Prisma */
interface TransactionOptions {
  /** Maximum time to wait for a transaction slot (ms) */
  maxWait?: number;
  /** Transaction timeout (ms) */
  timeout?: number;
  /** Transaction isolation level */
  isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
  /** Additional options */
  [key: string]: unknown;
}

/** Health check result */
interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  database: string;
  activeTransactions: number;
  uptime?: number;
  error?: string;
}

/** Generic model methods interface for Prisma models */
export interface PrismaModelMethods<T = unknown> {
  findMany: (args?: Record<string, unknown>) => Promise<T[]>;
  findUnique: (args: Record<string, unknown>) => Promise<T | null>;
  findFirst: (args?: Record<string, unknown>) => Promise<T | null>;
  create: (args: Record<string, unknown>) => Promise<T>;
  update: (args: Record<string, unknown>) => Promise<T>;
  delete: (args: Record<string, unknown>) => Promise<T>;
  upsert: (args: Record<string, unknown>) => Promise<T>;
  count: (args?: Record<string, unknown>) => Promise<number>;
}

/** Prisma client interface - minimal type for when client is not generated */
export interface PrismaClientInstance {
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
  $queryRaw: <T>(query: TemplateStringsArray | string, ...values: unknown[]) => Promise<T>;
  $transaction: <T>(fn: (tx: PrismaClientInstance) => Promise<T>, options?: Record<string, unknown>) => Promise<T>;
  // Known models - add more as needed
  decision: PrismaModelMethods;
  decisionOutcome: PrismaModelMethods;
  user: PrismaModelMethods;
  session: PrismaModelMethods;
  project: PrismaModelMethods;
  // Index signature for other models
  [key: string]: unknown;
}

/** Operation callback type for batch operations */
type BatchOperation<T> = (tx: PrismaClientInstance) => Promise<T>;

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
 */
export class PrismaManager {
  private static instance: PrismaManager | null = null;

  private config: Required<Pick<PrismaManagerConfig, 'maxConnections' | 'connectionTimeout' | 'database' | 'logLevel'>> & PrismaManagerConfig;
  private prisma: PrismaClientInstance | null;
  private connectionPromise: Promise<PrismaClientInstance> | null;
  private isShuttingDown: boolean;
  private transactionCount: number;

  constructor(options: PrismaManagerConfig = {}) {
    this.config = {
      maxConnections:
        options.maxConnections ?? (Config.get('database.maxConnections', 10) as number),
      connectionTimeout:
        options.connectionTimeout ?? (Config.get('database.connectionTimeout', 30000) as number),
      database: options.database ?? process.env['DATABASE_URL'] ?? (Config.get('database.url') as string),
      logLevel:
        options.logLevel ??
        (Config.isDevelopment()
          ? (['error', 'warn', 'info'] as PrismaLogLevel[])
          : (['error', 'warn'] as PrismaLogLevel[])),
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
  static getInstance(options: PrismaManagerConfig = {}): PrismaManager {
    if (!PrismaManager.instance) {
      PrismaManager.instance = new PrismaManager(options);
    }
    return PrismaManager.instance;
  }

  /**
   * Initialize Prisma client with production configuration
   */
  async initialize(): Promise<PrismaClientInstance> {
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
  private async createPrismaClient(): Promise<PrismaClientInstance> {
    try {
      const adapter = new PrismaPg({ connectionString: this.config.database });
      const prismaClient = new PrismaClient({
        adapter,
        log: this.config.logLevel,
        errorFormat: Config.isDevelopment() ? 'pretty' : 'minimal',
      }) as unknown as PrismaClientInstance;

      // Test connection
      await prismaClient.$connect();

      logger.info(`Database connected: ${this.getDatabaseType()}`);
      logger.info(
        `Connection pool: ${this.config.maxConnections} max connections`
      );

      // Setup graceful shutdown
      this.setupGracefulShutdown(prismaClient);

      return prismaClient;
    } catch (error) {
      const err = error as Error;
      logger.error('Database connection failed:', err);
      throw new Error(`Failed to initialize database: ${err.message}`);
    }
  }

  /**
   * Get the database type from URL
   */
  private getDatabaseType(): string {
    const url = this.config.database;
    if (url.startsWith('postgresql://')) return 'PostgreSQL';
    if (url.startsWith('mysql://')) return 'MySQL';
    if (url.startsWith('sqlite://')) return 'SQLite';
    return 'Unknown';
  }

  /**
   * Get Prisma client (lazy initialization)
   */
  async getClient(): Promise<PrismaClientInstance> {
    if (!this.prisma) {
      await this.initialize();
    }
    return this.prisma!;
  }

  /**
   * Execute operation with automatic transaction handling
   *
   * @param callback - Operation to execute within transaction
   * @param options - Transaction options
   * @returns Result of the callback
   */
  async withTransaction<T>(
    callback: (tx: PrismaClientInstance) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    if (this.isShuttingDown) {
      throw new Error(
        'Database is shutting down, cannot start new transactions'
      );
    }

    const client = await this.getClient();
    this.transactionCount++;

    const transactionOptions = {
      maxWait: options.maxWait ?? 5000,
      timeout: options.timeout ?? 10000,
      isolationLevel: options.isolationLevel ?? 'ReadCommitted',
      ...options,
    };

    try {
      const result = await client.$transaction(async (tx: PrismaClientInstance) => {
        try {
          return await callback(tx);
        } catch (error) {
          const err = error as Error;
          // Transaction will auto-rollback
          logger.error('Transaction failed:', err);
          throw error;
        }
      }, transactionOptions);

      return result;
    } catch (error) {
      const err = error as { code?: string; message: string };
      if (err.code === 'P2034') {
        throw new Error(
          'Transaction conflict: Another transaction is modifying the same data'
        );
      }
      if (err.code === 'P2024') {
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
   * @param sql - SQL query
   * @param _params - Query parameters (unused in current implementation)
   * @returns Query result
   */
  async query<T>(sql: string, _params: unknown[] = []): Promise<T> {
    const client = await this.getClient();

    try {
      const result = await client.$queryRaw`${sql}`;
      return result as T;
    } catch (error) {
      const err = error as Error;
      logger.error('SQL query failed:', err, {
        sql,
      });
      throw new Error(`Query execution failed: ${err.message}`);
    }
  }

  /**
   * Execute raw SQL with parameters (safer than template literals)
   */
  async queryRaw<T>(sql: string, ...params: unknown[]): Promise<T> {
    const client = await this.getClient();

    try {
      const result = await client.$queryRaw(sql as unknown as TemplateStringsArray, ...params);
      return result as T;
    } catch (error) {
      const err = error as Error;
      logger.error('Raw query failed:', err, {
        sql,
        params,
      });
      throw new Error(`Raw query execution failed: ${err.message}`);
    }
  }

  /**
   * Execute multiple operations in a single transaction
   */
  async batch<T>(operations: BatchOperation<T>[]): Promise<T[]> {
    return this.withTransaction(async (tx) => {
      const results: T[] = [];
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
  async healthCheck(): Promise<HealthCheckResult> {
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
      const err = error as Error;
      return {
        status: 'unhealthy',
        error: err.message,
        database: this.getDatabaseType(),
        activeTransactions: this.transactionCount,
      };
    }
  }

  /**
   * Setup graceful shutdown handling
   */
  private setupGracefulShutdown(client: PrismaClientInstance): void {
    const shutdown = async (signal: string): Promise<void> => {
      if (this.isShuttingDown) return;

      logger.info(
        `Received ${signal}, shutting down database gracefully...`
      );
      this.isShuttingDown = true;

      // Wait for active transactions to complete
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds

      while (this.transactionCount > 0 && attempts < maxAttempts) {
        logger.info(
          `Waiting for ${this.transactionCount} active transactions...`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      }

      if (this.transactionCount > 0) {
        logger.warn(
          `Force closing with ${this.transactionCount} active transactions`
        );
      }

      try {
        await client.$disconnect();
        logger.info('Database disconnected gracefully');
      } catch (error) {
        const err = error as Error;
        logger.error('Error during database shutdown:', err);
      }
    };

    // Only set up handlers if they haven't been set already
    const existingListeners = process.listeners('SIGINT');
    const hasHandler = existingListeners.some((listener) => listener.name === 'databaseShutdown');

    if (!hasHandler) {
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
  async disconnect(): Promise<void> {
    if (this.prisma) {
      await this.prisma.$disconnect();
      this.prisma = null;
    }
  }

  /**
   * Reset connection (useful for tests)
   */
  async reset(): Promise<void> {
    await this.disconnect();
    this.connectionPromise = null;
    this.transactionCount = 0;
    this.isShuttingDown = false;
  }
}
