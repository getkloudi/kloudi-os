import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { Config } from '@kloudi-os/shared/config';
import { Logger } from '@kloudi-os/shared/logger';

/** Logger interface from shared package */
interface LoggerInstance {
  info: (message: string, metadata?: Record<string, unknown>) => void;
  error: (
    message: string,
    error?: Error | null,
    metadata?: Record<string, unknown>
  ) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  debug: (message: string, metadata?: Record<string, unknown>) => void;
}

const logger: LoggerInstance = Logger.getInstance('events');

/** Configuration options for EventBus */
interface EventBusConfig {
  /** Whether the event bus is enabled */
  enabled?: boolean;
  /** Redis connection URL */
  redisUrl?: string;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Base retry delay in milliseconds */
  retryDelay?: number;
  /** Maximum retry delay in milliseconds */
  maxRetryDelay?: number;
  /** Whether dead letter queue is enabled */
  deadLetterEnabled?: boolean;
  /** Maximum number of subscribers */
  maxSubscribers?: number;
  /** Event store TTL in seconds */
  eventStoreTtl?: number;
  /** Maximum size of event store */
  eventStoreMaxSize?: number;
  /** Maximum size of dead letter queue */
  deadLetterMaxSize?: number;
  /** Additional options */
  [key: string]: unknown;
}

/** Event object structure */
interface DomainEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
  correlationId: string;
  source: string;
  version: string;
  metadata: EventMetadata;
}

/** Event metadata */
interface EventMetadata {
  retryCount: number;
  priority: number;
  lastError?: string;
  retryScheduledAt?: Date;
  [key: string]: unknown;
}

/** Subscription options */
interface SubscriptionOptions {
  priority?: number;
  maxRetries?: number;
  timeout?: number;
  [key: string]: unknown;
}

/** Subscription statistics */
interface SubscriptionStats {
  delivered: number;
  failed: number;
  lastError: string | null;
}

/** Subscription object */
interface Subscription {
  id: string;
  eventType: string;
  handler: EventHandler;
  options: Required<
    Pick<SubscriptionOptions, 'priority' | 'maxRetries' | 'timeout'>
  > &
    SubscriptionOptions;
  stats: SubscriptionStats;
}

/** Event handler function type */
type EventHandler = (event: DomainEvent) => Promise<void> | void;

/** Event bus statistics */
interface EventBusStats {
  published: number;
  delivered: number;
  failed: number;
  retries: number;
  deadLettered: number;
}

/** Publishing options */
interface PublishOptions {
  correlationId?: string;
  source?: string;
  version?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

/** Dead letter entry */
interface DeadLetterEntry {
  event: DomainEvent;
  subscription: {
    id: string;
    eventType: string;
  };
  error: string;
  timestamp: Date;
  retryCount: number;
}

/** Health check result */
interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  enabled: boolean;
  processing?: boolean;
  redis?: {
    publisher: string;
    subscriber: string;
    storage: string;
  };
  error?: string;
}

/**
 * Production event bus with Redis Pub/Sub, error handling, retry logic, and dead letter queue
 *
 * Provides reliable event publishing and subscription with:
 * - Redis Pub/Sub for distributed event messaging
 * - Automatic retry with exponential backoff
 * - Dead letter queue for failed events (Redis list)
 * - Event store with TTL (Redis list)
 * - Event validation and serialization
 * - Subscriber management with error isolation
 * - Performance monitoring and metrics
 * - Graceful shutdown and cleanup
 */
export class EventBus {
  private static instance: EventBus | null = null;

  private config: Required<
    Pick<
      EventBusConfig,
      | 'enabled'
      | 'redisUrl'
      | 'maxRetries'
      | 'retryDelay'
      | 'maxRetryDelay'
      | 'deadLetterEnabled'
      | 'maxSubscribers'
      | 'eventStoreTtl'
      | 'eventStoreMaxSize'
      | 'deadLetterMaxSize'
    >
  > &
    EventBusConfig;
  private subscribers: Map<string, Subscription[]>;
  private redisPublisher: Redis | null;
  private redisSubscriber: Redis | null;
  private redisStorage: Redis | null;
  private stats: EventBusStats;
  private isProcessing: boolean;
  private processingPromise: Promise<void> | null;
  private connectionPromise: Promise<void> | null;

  constructor(options: EventBusConfig = {}) {
    this.config = {
      enabled:
        options.enabled ?? (Config.get('events.enabled', true) as boolean),
      redisUrl:
        options.redisUrl ??
        (Config.get('cache.redisUrl') as string | null) ??
        process.env['REDIS_URL'] ??
        '',
      maxRetries:
        options.maxRetries ?? (Config.get('events.retryAttempts', 3) as number),
      retryDelay: options.retryDelay ?? 1000,
      maxRetryDelay: options.maxRetryDelay ?? 30000,
      deadLetterEnabled: options.deadLetterEnabled ?? true,
      maxSubscribers: options.maxSubscribers ?? 1000,
      eventStoreTtl: options.eventStoreTtl ?? 86400, // 24 hours
      eventStoreMaxSize: options.eventStoreMaxSize ?? 10000,
      deadLetterMaxSize: options.deadLetterMaxSize ?? 1000,
      ...options,
    };

    // Local subscriber registry
    this.subscribers = new Map();

    // Redis clients
    this.redisPublisher = null;
    this.redisSubscriber = null;
    this.redisStorage = null;

    // Statistics
    this.stats = {
      published: 0,
      delivered: 0,
      failed: 0,
      retries: 0,
      deadLettered: 0,
    };

    // Processing state
    this.isProcessing = false;
    this.processingPromise = null;
    this.connectionPromise = null;

    // Note: initialize() must be called explicitly - no auto-connect
  }

  /**
   * Get singleton instance
   */
  static getInstance(options: EventBusConfig = {}): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus(options);
    }
    return EventBus.instance;
  }

  /**
   * Initialize Redis connections
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
   * Connect to Redis with separate clients for pub/sub and storage
   */
  private async connectToRedis(): Promise<void> {
    try {
      const redisOptions: RedisOptions = {
        retryStrategy: (times: number) => {
          if (times > 3) {
            return null;
          }
          return Math.min(times * 100, 2000);
        },
        lazyConnect: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
      };

      // Publisher client for publishing events
      this.redisPublisher = new Redis(this.config.redisUrl, redisOptions);

      // Subscriber client for receiving events
      this.redisSubscriber = new Redis(this.config.redisUrl, redisOptions);

      // Storage client for event store and dead letter queue
      this.redisStorage = new Redis(this.config.redisUrl, redisOptions);

      // Event handlers
      this.redisPublisher.on('error', (error: Error) => {
        logger.error('Redis publisher error', error);
      });

      this.redisSubscriber.on('error', (error: Error) => {
        logger.error('Redis subscriber error', error);
      });

      this.redisStorage.on('error', (error: Error) => {
        logger.error('Redis storage error', error);
      });

      // Connect all clients
      await Promise.all([
        this.redisPublisher.connect(),
        this.redisSubscriber.connect(),
        this.redisStorage.connect(),
      ]);

      // Test connections
      await Promise.all([
        this.redisPublisher.ping(),
        this.redisSubscriber.ping(),
        this.redisStorage.ping(),
      ]);

      // Set up message handler for subscriber
      this.redisSubscriber.on('message', (channel: string, message: string) => {
        this.handleRedisMessage(channel, message);
      });

      logger.info('EventBus: Redis Pub/Sub initialized successfully');

      // Start background processing
      this.startProcessing();
    } catch (error) {
      const err = error as Error;
      logger.error('EventBus: Redis initialization failed', err);
      throw new Error(`EventBus initialization failed: ${err.message}`);
    }
  }

  /**
   * Publish event to all subscribers via Redis Pub/Sub
   *
   * @param eventType - Type of event to publish
   * @param data - Event data
   * @param options - Publishing options
   * @returns Success status
   */
  async publish(
    eventType: string,
    data: Record<string, unknown> = {},
    options: PublishOptions = {}
  ): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    try {
      const event = this.createEvent(eventType, data, options);

      // Validate event
      this.validateEvent(event);

      // Store event in Redis list with TTL
      await this.storeEvent(event);

      this.stats.published++;

      // Publish to Redis Pub/Sub channel
      const channel = `event:${eventType}`;
      await this.redisPublisher!.publish(channel, JSON.stringify(event));

      return true;
    } catch (error) {
      const err = error as Error;
      logger.error('Event publishing failed', err);
      this.stats.failed++;
      throw new Error(`Event publishing failed: ${err.message}`);
    }
  }

  /**
   * Subscribe to event type
   *
   * @param eventType - Event type to subscribe to
   * @param handler - Event handler function
   * @param options - Subscription options
   * @returns Subscription ID
   */
  subscribe(
    eventType: string,
    handler: EventHandler,
    options: SubscriptionOptions = {}
  ): string {
    if (!this.config.enabled) {
      throw new Error('Event bus is disabled');
    }

    if (typeof handler !== 'function') {
      throw new Error('Event handler must be a function');
    }

    // Check subscriber limits
    const currentSubscribers = Array.from(this.subscribers.values()).flat()
      .length;
    if (currentSubscribers >= this.config.maxSubscribers) {
      throw new Error(
        `Maximum number of subscribers (${this.config.maxSubscribers}) exceeded`
      );
    }

    const subscription: Subscription = {
      id: this.generateSubscriptionId(),
      eventType,
      handler,
      options: {
        priority: options.priority ?? 0,
        maxRetries: options.maxRetries ?? this.config.maxRetries,
        timeout: options.timeout ?? 30000,
        ...options,
      },
      stats: {
        delivered: 0,
        failed: 0,
        lastError: null,
      },
    };

    // Add to local subscribers map
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
      // Subscribe to Redis channel for this event type
      void this.subscribeToRedisChannel(eventType);
    }

    this.subscribers.get(eventType)!.push(subscription);

    // Sort by priority (higher priority first)
    this.subscribers
      .get(eventType)!
      .sort((a, b) => b.options.priority - a.options.priority);

    logger.info(`Subscribed to event: ${eventType} (ID: ${subscription.id})`);

    return subscription.id;
  }

  /**
   * Subscribe to Redis channel
   */
  private async subscribeToRedisChannel(eventType: string): Promise<void> {
    try {
      const channel = `event:${eventType}`;
      await this.redisSubscriber!.subscribe(channel);
      logger.debug(`Subscribed to Redis channel: ${channel}`);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to subscribe to Redis channel', err);
      throw error;
    }
  }

  /**
   * Unsubscribe from Redis channel
   */
  private async unsubscribeFromRedisChannel(eventType: string): Promise<void> {
    try {
      const channel = `event:${eventType}`;
      await this.redisSubscriber!.unsubscribe(channel);
      logger.debug(`Unsubscribed from Redis channel: ${channel}`);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to unsubscribe from Redis channel', err);
    }
  }

  /**
   * Handle incoming Redis message
   */
  private handleRedisMessage(_channel: string, message: string): void {
    try {
      const event = JSON.parse(message) as DomainEvent;
      // Deliver to local subscribers
      void this.deliverEvent(event);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to handle Redis message', err);
    }
  }

  /**
   * Unsubscribe from events
   *
   * @param subscriptionId - Subscription ID to remove
   * @returns Success status
   */
  async unsubscribe(subscriptionId: string): Promise<boolean> {
    for (const [eventType, subscribers] of this.subscribers.entries()) {
      const index = subscribers.findIndex((sub) => sub.id === subscriptionId);
      if (index !== -1) {
        subscribers.splice(index, 1);

        // If no more local subscribers, unsubscribe from Redis channel
        if (subscribers.length === 0) {
          this.subscribers.delete(eventType);
          await this.unsubscribeFromRedisChannel(eventType);
        }

        logger.info(`Unsubscribed: ${subscriptionId} from ${eventType}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Create event object
   */
  private createEvent(
    eventType: string,
    data: Record<string, unknown>,
    options: PublishOptions = {}
  ): DomainEvent {
    return {
      id: this.generateEventId(),
      type: eventType,
      data,
      timestamp: new Date(),
      correlationId: options.correlationId ?? this.generateCorrelationId(),
      source: options.source ?? 'event-bus',
      version: options.version ?? '1.0',
      metadata: {
        retryCount: 0,
        priority: options.priority ?? 0,
        ...options.metadata,
      },
    };
  }

  /**
   * Validate event structure
   */
  private validateEvent(event: DomainEvent): void {
    if (!event.type || typeof event.type !== 'string') {
      throw new Error('Event must have a valid type string');
    }

    if (!event.id) {
      throw new Error('Event must have an ID');
    }

    if (!(event.timestamp instanceof Date)) {
      throw new Error('Event must have a valid timestamp');
    }
  }

  /**
   * Store event in Redis list with TTL
   */
  private async storeEvent(event: DomainEvent): Promise<void> {
    try {
      const key = 'eventbus:events';
      const serialized = JSON.stringify(event);

      // Add to Redis list
      await this.redisStorage!.lpush(key, serialized);

      // Trim list to max size
      await this.redisStorage!.ltrim(key, 0, this.config.eventStoreMaxSize - 1);

      // Set TTL on the list
      await this.redisStorage!.expire(key, this.config.eventStoreTtl);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to store event', err);
      // Don't throw - storing is optional
    }
  }

  /**
   * Deliver event to subscribers
   */
  private async deliverEvent(event: DomainEvent): Promise<void> {
    const subscribers = this.subscribers.get(event.type) ?? [];

    const deliveryPromises = subscribers.map((subscription) =>
      this.deliverToSubscriber(event, subscription)
    );

    await Promise.allSettled(deliveryPromises);
  }

  /**
   * Deliver event to specific subscriber with retry logic
   */
  private async deliverToSubscriber(
    event: DomainEvent,
    subscription: Subscription
  ): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Handler timeout')),
          subscription.options.timeout
        );
      });

      // Execute handler with timeout
      const handlerPromise = Promise.resolve(subscription.handler(event));

      await Promise.race([handlerPromise, timeoutPromise]);

      // Success - clear the timeout
      clearTimeout(timeoutId);
      subscription.stats.delivered++;
      this.stats.delivered++;
    } catch (error) {
      // Clear timeout on error as well
      if (timeoutId) clearTimeout(timeoutId);

      const err = error as Error;
      logger.error(
        `Event delivery failed for subscriber ${subscription.id}`,
        err
      );

      subscription.stats.failed++;
      subscription.stats.lastError = err.message;
      this.stats.failed++;

      // Handle retry logic
      await this.handleDeliveryFailure(event, subscription, err);
    }
  }

  /**
   * Handle delivery failure with retry logic
   */
  private async handleDeliveryFailure(
    event: DomainEvent,
    subscription: Subscription,
    error: Error
  ): Promise<void> {
    const retryCount = event.metadata.retryCount;
    const maxRetries = subscription.options.maxRetries;

    if (retryCount < maxRetries) {
      // Schedule retry
      const delay = this.calculateRetryDelay(retryCount);

      logger.info(
        `Scheduling retry ${retryCount + 1}/${maxRetries} for event ${event.id} in ${delay}ms`
      );

      const retryEvent: DomainEvent = {
        ...event,
        metadata: {
          ...event.metadata,
          retryCount: retryCount + 1,
          lastError: error.message,
          retryScheduledAt: new Date(Date.now() + delay),
        },
      };

      this.scheduleRetry(retryEvent, subscription, delay);
      this.stats.retries++;
    } else {
      // Send to dead letter queue
      if (this.config.deadLetterEnabled) {
        await this.sendToDeadLetterQueue(event, subscription, error);
      }

      logger.error(
        `Event ${event.id} sent to dead letter queue after ${maxRetries} retries`,
        null
      );
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateRetryDelay(retryCount: number): number {
    const baseDelay = this.config.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitteredDelay = exponentialDelay + Math.random() * 1000;

    return Math.min(jitteredDelay, this.config.maxRetryDelay);
  }

  /**
   * Schedule event retry
   */
  private scheduleRetry(
    event: DomainEvent,
    subscription: Subscription,
    delay: number
  ): void {
    setTimeout(() => {
      void this.deliverToSubscriber(event, subscription);
    }, delay);
  }

  /**
   * Send event to Redis dead letter queue
   */
  private async sendToDeadLetterQueue(
    event: DomainEvent,
    subscription: Subscription,
    error: Error
  ): Promise<void> {
    try {
      const key = 'eventbus:deadletter';
      const deadLetterEntry: DeadLetterEntry = {
        event,
        subscription: {
          id: subscription.id,
          eventType: subscription.eventType,
        },
        error: error.message,
        timestamp: new Date(),
        retryCount: event.metadata.retryCount,
      };

      // Add to Redis list
      await this.redisStorage!.lpush(key, JSON.stringify(deadLetterEntry));

      // Trim list to max size
      await this.redisStorage!.ltrim(key, 0, this.config.deadLetterMaxSize - 1);

      this.stats.deadLettered++;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to send to dead letter queue', err);
    }
  }

  /**
   * Start background processing
   */
  private startProcessing(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.processingPromise = this.processBackground();
  }

  /**
   * Background processing loop
   */
  private async processBackground(): Promise<void> {
    while (this.isProcessing) {
      try {
        // Process any pending operations
        await this.processRetryQueue();

        // Wait before next iteration
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        const err = error as Error;
        logger.error('Background processing error', err);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Process retry queue
   */
  private async processRetryQueue(): Promise<void> {
    // Implementation for processing delayed retries
    // This is a simplified version - in production you might use a proper queue system
  }

  /**
   * Get dead letter queue entries from Redis
   */
  async getDeadLetterQueue(): Promise<DeadLetterEntry[]> {
    try {
      const key = 'eventbus:deadletter';
      const entries = await this.redisStorage!.lrange(key, 0, -1);
      return entries.map((entry) => JSON.parse(entry) as DeadLetterEntry);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get dead letter queue', err);
      return [];
    }
  }

  /**
   * Replay events from store
   */
  async replayEvents(
    eventType: string | null = null,
    fromTimestamp: Date | null = null
  ): Promise<number> {
    try {
      const key = 'eventbus:events';
      const entries = await this.redisStorage!.lrange(key, 0, -1);
      let events = entries.map((entry) => JSON.parse(entry) as DomainEvent);

      if (eventType) {
        events = events.filter((event) => event.type === eventType);
      }

      if (fromTimestamp) {
        events = events.filter(
          (event) => new Date(event.timestamp) >= fromTimestamp
        );
      }

      logger.info(`Replaying ${events.length} events...`);

      for (const event of events) {
        await this.deliverEvent(event);
      }

      return events.length;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to replay events', err);
      return 0;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const testEvent = {
        type: '__health_check__',
        data: { timestamp: Date.now() },
        test: true,
      };

      // Test event creation and validation
      const event = this.createEvent(testEvent.type, testEvent.data);
      this.validateEvent(event);

      // Test Redis connections
      await Promise.all([
        this.redisPublisher!.ping(),
        this.redisSubscriber!.ping(),
        this.redisStorage!.ping(),
      ]);

      return {
        status: 'healthy',
        enabled: this.config.enabled,
        processing: this.isProcessing,
        redis: {
          publisher: 'connected',
          subscriber: 'connected',
          storage: 'connected',
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        status: 'unhealthy',
        error: err.message,
        enabled: this.config.enabled,
      };
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate correlation ID
   */
  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Disconnect from Redis and cleanup
   */
  async disconnect(): Promise<void> {
    this.isProcessing = false;

    if (this.processingPromise) {
      await this.processingPromise;
    }

    if (this.redisPublisher) {
      await this.redisPublisher.disconnect();
      this.redisPublisher = null;
    }

    if (this.redisSubscriber) {
      await this.redisSubscriber.disconnect();
      this.redisSubscriber = null;
    }

    if (this.redisStorage) {
      await this.redisStorage.disconnect();
      this.redisStorage = null;
    }

    logger.info('EventBus disconnected from Redis');
  }
}

// Create and export default singleton instance
const defaultEventBus = EventBus.getInstance();

// Export the Events class for backward compatibility with existing templates
export class Events {
  static getInstance(): EventBus {
    return defaultEventBus;
  }

  static async publish(
    eventType: string,
    data: Record<string, unknown>,
    options: PublishOptions = {}
  ): Promise<boolean> {
    return defaultEventBus.publish(eventType, data, options);
  }

  static subscribe(
    eventType: string,
    handler: EventHandler,
    options: SubscriptionOptions = {}
  ): string {
    return defaultEventBus.subscribe(eventType, handler, options);
  }

  static async unsubscribe(subscriptionId: string): Promise<boolean> {
    return defaultEventBus.unsubscribe(subscriptionId);
  }

  static async getDeadLetterQueue(): Promise<DeadLetterEntry[]> {
    return defaultEventBus.getDeadLetterQueue();
  }

  static async replayEvents(
    eventType: string | null,
    fromTimestamp: Date | null
  ): Promise<number> {
    return defaultEventBus.replayEvents(eventType, fromTimestamp);
  }

  static async healthCheck(): Promise<HealthCheckResult> {
    return defaultEventBus.healthCheck();
  }
}

export default defaultEventBus;
