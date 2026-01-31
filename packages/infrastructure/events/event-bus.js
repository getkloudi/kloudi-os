import RedisPkg from 'ioredis';
const Redis = RedisPkg;
import { Config } from '@kloudi/shared/config';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('events');

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
 *
 * @class EventBus
 * @description Event bus with Redis Pub/Sub, retry and error handling for domain events
 */
export class EventBus {
  constructor(options = {}) {
    this.config = {
      enabled: options.enabled ?? Config.get('events.enabled', true),
      redisUrl: options.redisUrl || Config.get('cache.redisUrl') || process.env.REDIS_URL,
      maxRetries: options.maxRetries || Config.get('events.retryAttempts', 3),
      retryDelay: options.retryDelay || 1000,
      maxRetryDelay: options.maxRetryDelay || 30000,
      deadLetterEnabled: options.deadLetterEnabled ?? true,
      maxSubscribers: options.maxSubscribers || 1000,
      eventStoreTtl: options.eventStoreTtl || 86400, // 24 hours
      eventStoreMaxSize: options.eventStoreMaxSize || 10000,
      deadLetterMaxSize: options.deadLetterMaxSize || 1000,
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
  static getInstance(options = {}) {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus(options);
    }
    return EventBus.instance;
  }

  /**
   * Initialize Redis connections
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
   * Connect to Redis with separate clients for pub/sub and storage
   */
  async connectToRedis() {
    try {
      // Publisher client for publishing events
      this.redisPublisher = new Redis(this.config.redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
      });

      // Subscriber client for receiving events
      this.redisSubscriber = new Redis(this.config.redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
      });

      // Storage client for event store and dead letter queue
      this.redisStorage = new Redis(this.config.redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
      });

      // Event handlers
      this.redisPublisher.on('error', (error) => {
        logger.error('Redis publisher error:', error.message);
      });

      this.redisSubscriber.on('error', (error) => {
        logger.error('Redis subscriber error:', error.message);
      });

      this.redisStorage.on('error', (error) => {
        logger.error('Redis storage error:', error.message);
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
      this.redisSubscriber.on('message', (channel, message) => {
        this.handleRedisMessage(channel, message);
      });

      logger.info('✅ EventBus: Redis Pub/Sub initialized successfully');

      // Start background processing
      this.startProcessing();
    } catch (error) {
      logger.error(`❌ EventBus: Redis initialization failed: ${error.message}`);
      throw new Error(`EventBus initialization failed: ${error.message}`);
    }
  }

  /**
   * Publish event to all subscribers via Redis Pub/Sub
   *
   * @param {string} eventType - Type of event to publish
   * @param {Object} data - Event data
   * @param {Object} options - Publishing options
   * @returns {Promise<boolean>} Success status
   */
  async publish(eventType, data = {}, options = {}) {
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
      await this.redisPublisher.publish(channel, JSON.stringify(event));

      return true;
    } catch (error) {
      logger.error('❌ Event publishing failed:', error);
      this.stats.failed++;
      throw new Error(`Event publishing failed: ${error.message}`);
    }
  }

  /**
   * Subscribe to event type
   *
   * @param {string} eventType - Event type to subscribe to
   * @param {Function} handler - Event handler function
   * @param {Object} options - Subscription options
   * @returns {string} Subscription ID
   */
  subscribe(eventType, handler, options = {}) {
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

    const subscription = {
      id: this.generateSubscriptionId(),
      eventType,
      handler,
      options: {
        priority: options.priority || 0,
        maxRetries: options.maxRetries || this.config.maxRetries,
        timeout: options.timeout || 30000,
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
      this.subscribeToRedisChannel(eventType);
    }

    this.subscribers.get(eventType).push(subscription);

    // Sort by priority (higher priority first)
    this.subscribers
      .get(eventType)
      .sort((a, b) => b.options.priority - a.options.priority);

    logger.info(
      `📡 Subscribed to event: ${eventType} (ID: ${subscription.id})`
    );

    return subscription.id;
  }

  /**
   * Subscribe to Redis channel
   */
  async subscribeToRedisChannel(eventType) {
    try {
      const channel = `event:${eventType}`;
      await this.redisSubscriber.subscribe(channel);
      logger.debug(`📡 Subscribed to Redis channel: ${channel}`);
    } catch (error) {
      logger.error(`❌ Failed to subscribe to Redis channel: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unsubscribe from Redis channel
   */
  async unsubscribeFromRedisChannel(eventType) {
    try {
      const channel = `event:${eventType}`;
      await this.redisSubscriber.unsubscribe(channel);
      logger.debug(`📡 Unsubscribed from Redis channel: ${channel}`);
    } catch (error) {
      logger.error(`❌ Failed to unsubscribe from Redis channel: ${error.message}`);
    }
  }

  /**
   * Handle incoming Redis message
   */
  handleRedisMessage(channel, message) {
    try {
      const event = JSON.parse(message);
      const eventType = channel.replace('event:', '');

      // Deliver to local subscribers
      this.deliverEvent(event);
    } catch (error) {
      logger.error('❌ Failed to handle Redis message:', error);
    }
  }

  /**
   * Unsubscribe from events
   *
   * @param {string} subscriptionId - Subscription ID to remove
   * @returns {boolean} Success status
   */
  async unsubscribe(subscriptionId) {
    for (const [eventType, subscribers] of this.subscribers.entries()) {
      const index = subscribers.findIndex((sub) => sub.id === subscriptionId);
      if (index !== -1) {
        subscribers.splice(index, 1);

        // If no more local subscribers, unsubscribe from Redis channel
        if (subscribers.length === 0) {
          this.subscribers.delete(eventType);
          await this.unsubscribeFromRedisChannel(eventType);
        }

        logger.info(`📡 Unsubscribed: ${subscriptionId} from ${eventType}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Create event object
   */
  createEvent(eventType, data, options = {}) {
    return {
      id: this.generateEventId(),
      type: eventType,
      data,
      timestamp: new Date(),
      correlationId: options.correlationId || this.generateCorrelationId(),
      source: options.source || 'event-bus',
      version: options.version || '1.0',
      metadata: {
        retryCount: 0,
        priority: options.priority || 0,
        ...options.metadata,
      },
    };
  }

  /**
   * Validate event structure
   */
  validateEvent(event) {
    if (!event.type || typeof event.type !== 'string') {
      throw new Error('Event must have a valid type string');
    }

    if (!event.id) {
      throw new Error('Event must have an ID');
    }

    if ((!event.timestamp) instanceof Date) {
      throw new Error('Event must have a valid timestamp');
    }
  }

  /**
   * Store event in Redis list with TTL
   */
  async storeEvent(event) {
    try {
      const key = 'eventbus:events';
      const serialized = JSON.stringify(event);

      // Add to Redis list
      await this.redisStorage.lpush(key, serialized);

      // Trim list to max size
      await this.redisStorage.ltrim(key, 0, this.config.eventStoreMaxSize - 1);

      // Set TTL on the list
      await this.redisStorage.expire(key, this.config.eventStoreTtl);
    } catch (error) {
      logger.error('❌ Failed to store event:', error);
      // Don't throw - storing is optional
    }
  }

  /**
   * Deliver event to subscribers
   */
  async deliverEvent(event) {
    const subscribers = this.subscribers.get(event.type) || [];

    const deliveryPromises = subscribers.map((subscription) =>
      this.deliverToSubscriber(event, subscription)
    );

    await Promise.allSettled(deliveryPromises);
  }

  /**
   * Deliver event to specific subscriber with retry logic
   */
  async deliverToSubscriber(event, subscription) {
    let timeoutId;
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Handler timeout')),
          subscription.options.timeout
        );
      });

      // Execute handler with timeout
      const handlerPromise = subscription.handler(event);

      await Promise.race([handlerPromise, timeoutPromise]);

      // Success - clear the timeout
      clearTimeout(timeoutId);
      subscription.stats.delivered++;
      this.stats.delivered++;
    } catch (error) {
      // Clear timeout on error as well
      if (timeoutId) clearTimeout(timeoutId);

      logger.error(
        `❌ Event delivery failed for subscriber ${subscription.id}:`,
        error.message
      );

      subscription.stats.failed++;
      subscription.stats.lastError = error.message;
      this.stats.failed++;

      // Handle retry logic
      await this.handleDeliveryFailure(event, subscription, error);
    }
  }

  /**
   * Handle delivery failure with retry logic
   */
  async handleDeliveryFailure(event, subscription, error) {
    const retryCount = event.metadata.retryCount || 0;
    const maxRetries = subscription.options.maxRetries;

    if (retryCount < maxRetries) {
      // Schedule retry
      const delay = this.calculateRetryDelay(retryCount);

      logger.info(
        `🔄 Scheduling retry ${retryCount + 1}/${maxRetries} for event ${event.id} in ${delay}ms`
      );

      const retryEvent = {
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
        `💀 Event ${event.id} sent to dead letter queue after ${maxRetries} retries`
      );
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  calculateRetryDelay(retryCount) {
    const baseDelay = this.config.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitteredDelay = exponentialDelay + Math.random() * 1000;

    return Math.min(jitteredDelay, this.config.maxRetryDelay);
  }

  /**
   * Schedule event retry
   */
  scheduleRetry(event, subscription, delay) {
    setTimeout(() => {
      this.deliverToSubscriber(event, subscription);
    }, delay);
  }

  /**
   * Send event to Redis dead letter queue
   */
  async sendToDeadLetterQueue(event, subscription, error) {
    try {
      const key = 'eventbus:deadletter';
      const deadLetterEntry = {
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
      await this.redisStorage.lpush(key, JSON.stringify(deadLetterEntry));

      // Trim list to max size
      await this.redisStorage.ltrim(key, 0, this.config.deadLetterMaxSize - 1);

      this.stats.deadLettered++;
    } catch (error) {
      logger.error('❌ Failed to send to dead letter queue:', error);
    }
  }

  /**
   * Start background processing
   */
  startProcessing() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.processingPromise = this.processBackground();
  }

  /**
   * Background processing loop
   */
  async processBackground() {
    while (this.isProcessing) {
      try {
        // Process any pending operations
        await this.processRetryQueue();

        // Wait before next iteration
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error('❌ Background processing error:', error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Process retry queue
   */
  async processRetryQueue() {
    // Implementation for processing delayed retries
    // This is a simplified version - in production you might use a proper queue system
  }

  /**
   * Get dead letter queue entries from Redis
   */
  async getDeadLetterQueue() {
    try {
      const key = 'eventbus:deadletter';
      const entries = await this.redisStorage.lrange(key, 0, -1);
      return entries.map((entry) => JSON.parse(entry));
    } catch (error) {
      logger.error('❌ Failed to get dead letter queue:', error);
      return [];
    }
  }

  /**
   * Replay events from store
   */
  async replayEvents(eventType = null, fromTimestamp = null) {
    try {
      const key = 'eventbus:events';
      const entries = await this.redisStorage.lrange(key, 0, -1);
      let events = entries.map((entry) => JSON.parse(entry));

      if (eventType) {
        events = events.filter((event) => event.type === eventType);
      }

      if (fromTimestamp) {
        events = events.filter((event) => new Date(event.timestamp) >= fromTimestamp);
      }

      logger.info(`🔄 Replaying ${events.length} events...`);

      for (const event of events) {
        await this.deliverEvent(event);
      }

      return events.length;
    } catch (error) {
      logger.error('❌ Failed to replay events:', error);
      return 0;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
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
        this.redisPublisher.ping(),
        this.redisSubscriber.ping(),
        this.redisStorage.ping(),
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
      return {
        status: 'unhealthy',
        error: error.message,
        enabled: this.config.enabled,
      };
    }
  }

  /**
   * Generate unique event ID
   */
  generateEventId() {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique subscription ID
   */
  generateSubscriptionId() {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate correlation ID
   */
  generateCorrelationId() {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Disconnect from Redis and cleanup
   */
  async disconnect() {
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

    logger.info('✅ EventBus disconnected from Redis');
  }
}

// Create and export default singleton instance
const defaultEventBus = EventBus.getInstance();

// Export the Events class for backward compatibility with existing templates
export class Events {
  static getInstance() {
    return defaultEventBus;
  }

  static async publish(eventType, data, options = {}) {
    return defaultEventBus.publish(eventType, data, options);
  }

  static subscribe(eventType, handler, options = {}) {
    return defaultEventBus.subscribe(eventType, handler, options);
  }

  static async unsubscribe(subscriptionId) {
    return defaultEventBus.unsubscribe(subscriptionId);
  }

  static async getDeadLetterQueue() {
    return defaultEventBus.getDeadLetterQueue();
  }

  static async replayEvents(eventType, fromTimestamp) {
    return defaultEventBus.replayEvents(eventType, fromTimestamp);
  }

  static async healthCheck() {
    return defaultEventBus.healthCheck();
  }
}

export default defaultEventBus;
