/* eslint-disable no-console -- User error feedback, not operational logging */
import { randomUUID } from 'crypto';
import { Config } from '@kloudi/shared/config';

/**
 * Production-grade structured logger with observability features
 * Supports: OpenTelemetry, correlation IDs, multiple levels, JSON/pretty formats
 * Designed for scalability with external monitoring tools (DataDog, New Relic, etc.)
 */
class Logger {
  constructor(options = {}) {
    this.context = options.context || 'application';

    // Get log level from: globalLogLevel > config > default
    const configLogLevel =
      Config.get('LOG_LEVEL') || Config.get('environment.logLevel', 'error');
    this.level = this.parseLogLevel(Logger.globalLogLevel || configLogLevel);

    this.format = options.format || Config.get('LOG_FORMAT') || 'json';
    this.enableCorrelation =
      options.enableCorrelation ?? Config.get('LOG_CORRELATION') !== 'false';
    this.metadata = options.metadata || {};

    // Log levels with numeric values for comparison
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
  }

  static getInstance(context = 'default') {
    try {
      if (!Logger.instances) {
        Logger.instances = new Map();
      }

      if (!Logger.instances.has(context)) {
        Logger.instances.set(context, new Logger({ context }));
      }

      return Logger.instances.get(context);
    } catch (error) {
      // Fallback to console logging if Logger initialization fails
      console.warn(
        `Logger initialization failed for context "${context}":`,
        error.message
      );
      return Logger.createFallbackLogger(context);
    }
  }

  /**
   * Set log level for all existing and future logger instances
   * Useful for temporarily overriding log level (e.g., --verbose flag)
   */
  static setGlobalLogLevel(level) {
    Logger.globalLogLevel = level;
    process.env.LOG_LEVEL = level;

    // Update all existing instances
    if (Logger.instances) {
      for (const instance of Logger.instances.values()) {
        instance.level = instance.parseLogLevel(level);
      }
    }
  }

  static createFallbackLogger(context) {
    return {
      info: (message, metadata = {}) => {
        console.log(`[${context}] INFO: ${message}`, metadata);
      },
      error: (message, error = null, metadata = {}) => {
        console.error(
          `[${context}] ERROR: ${message}`,
          error?.message || error,
          metadata
        );
      },
      warn: (message, metadata = {}) => {
        console.warn(`[${context}] WARN: ${message}`, metadata);
      },
      debug: (message, metadata = {}) => {
        console.debug(`[${context}] DEBUG: ${message}`, metadata);
      },
      audit: (action, metadata = {}) => {
        console.log(`[${context}] AUDIT: ${action}`, metadata);
      },
      time: (label, metadata = {}) => {
        const startTime = Date.now();
        return {
          end: (additionalMetadata = {}) => {
            const duration = Date.now() - startTime;
            console.log(`[${context}] TIMER: ${label} (${duration}ms)`, {
              ...metadata,
              ...additionalMetadata,
            });
          },
        };
      },
      // eslint-disable-next-line no-unused-vars -- Fallback doesn't use metadata but maintains API compatibility
      child: (additionalMetadata = {}) => {
        return Logger.createFallbackLogger(`${context}-child`);
      },
    };
  }

  static createCorrelationId() {
    return randomUUID();
  }

  parseLogLevel(level) {
    return typeof level === 'string' ? level.toLowerCase() : 'info';
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  formatMessage(level, message, metadata = {}, error = null) {
    const timestamp = new Date().toISOString();
    const correlationId =
      metadata.correlationId || this.generateCorrelationId();

    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      context: this.context,
      message,
      ...(this.enableCorrelation && { correlationId }),
      ...this.metadata,
      ...metadata,
    };

    // Add error details if present
    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error.code && { code: error.code }),
        ...(error.statusCode && { statusCode: error.statusCode }),
      };
    }

    // Add OpenTelemetry trace context if available
    if (global.opentelemetry?.trace?.getActiveSpan) {
      const span = global.opentelemetry.trace.getActiveSpan();
      if (span) {
        const spanContext = span.spanContext();
        logEntry.tracing = {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
        };
      }
    }

    return this.format === 'pretty'
      ? this.formatPretty(logEntry)
      : JSON.stringify(logEntry);
  }

  formatPretty(logEntry) {
    const {
      timestamp,
      level,
      context,
      message,
      correlationId,
      error,
      ...rest
    } = logEntry;
    const levelColor = this.getLevelColor(level);

    let output = `${timestamp} ${levelColor}[${level}]${this.colors.reset} [${context}]`;

    if (correlationId) {
      output += ` [${correlationId.substring(0, 8)}]`;
    }

    output += ` ${message}`;

    if (Object.keys(rest).length > 0) {
      output += `\n  Metadata: ${JSON.stringify(rest, null, 2)}`;
    }

    if (error) {
      output += `\n  Error: ${error.message}\n  Stack: ${error.stack}`;
    }

    return output;
  }

  getLevelColor(level) {
    const colors = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m', // Yellow
      INFO: '\x1b[36m', // Cyan
      DEBUG: '\x1b[90m', // Gray
    };
    return colors[level] || colors.INFO;
  }

  get colors() {
    return {
      reset: '\x1b[0m',
    };
  }

  generateCorrelationId() {
    return this.enableCorrelation ? Logger.createCorrelationId() : undefined;
  }

  writeLog(level, message, metadata = {}, error = null) {
    try {
      if (!this.shouldLog(level)) {
        return;
      }

      const formattedMessage = this.formatMessage(
        level,
        message,
        metadata,
        error
      );

      // Route to appropriate output stream
      if (level === 'error') {
        process.stderr.write(formattedMessage + '\n');
      } else {
        process.stdout.write(formattedMessage + '\n');
      }

      // Hook for external monitoring systems
      this.sendToObservabilityPlatform(level, message, metadata, error);
    } catch (logError) {
      // Fallback to console if structured logging fails
      const fallbackMessage = `[${this.context}] ${level.toUpperCase()}: ${message}`;
      if (level === 'error') {
        console.error(fallbackMessage, error?.message || error, metadata);
      } else {
        console.log(fallbackMessage, metadata);
      }

      // Try to log the logging error itself (recursive fallback protection)
      if (logError.message !== 'Logger writeLog failed') {
        console.warn('Logger writeLog failed:', logError.message);
      }
    }
  }

  sendToObservabilityPlatform(level, message, metadata, error) {
    // Hook for integration with monitoring platforms
    // DataDog, New Relic, Splunk, etc. can be integrated here
    if (process.env.OBSERVABILITY_WEBHOOK_URL) {
      // Example: Send to webhook endpoint
      this.sendToWebhook(level, message, metadata, error);
    }

    // Example integrations:
    // - DataDog: datadog.increment('app.log.count', 1, [`level:${level}`]);
    // - New Relic: newrelic.recordLogEvent({ level, message, ...metadata });
    // - Custom metrics: this.incrementMetric(`log.${level}.count`);
  }

  async sendToWebhook(level, message, metadata, error) {
    try {
      const webhook = process.env.OBSERVABILITY_WEBHOOK_URL;
      if (!webhook) return;

      const payload = {
        level,
        message,
        metadata,
        error,
        timestamp: new Date().toISOString(),
        service: this.context,
      };

      // Non-blocking webhook call
      globalThis
        .fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        .catch(() => {
          // Silently fail webhook calls to avoid log loops
        });
    } catch {
      // Ignore webhook failures
    }
  }

  // Public API methods
  info(message, metadata = {}) {
    this.writeLog('info', message, metadata);
  }

  error(message, error = null, metadata = {}) {
    this.writeLog('error', message, metadata, error);
  }

  warn(message, metadata = {}) {
    this.writeLog('warn', message, metadata);
  }

  debug(message, metadata = {}) {
    this.writeLog('debug', message, metadata);
  }

  audit(action, metadata = {}) {
    this.writeLog('info', `AUDIT: ${action}`, {
      ...metadata,
      type: 'audit',
      action,
    });
  }

  // Performance logging
  time(label, metadata = {}) {
    const startTime = process.hrtime.bigint();
    return {
      end: (additionalMetadata = {}) => {
        const duration = Number(process.hrtime.bigint() - startTime) / 1e6; // Convert to milliseconds
        this.info(`Timer: ${label}`, {
          ...metadata,
          ...additionalMetadata,
          duration,
          type: 'performance',
        });
      },
    };
  }

  // Request/Response logging for Express middleware
  logRequest(req, res, next) {
    const correlationId = Logger.createCorrelationId();
    req.correlationId = correlationId;

    const startTime = process.hrtime.bigint();

    this.info('HTTP Request', {
      correlationId,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });

    // Hook into response to log completion
    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1e6;

      this.info('HTTP Response', {
        correlationId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
      });

      originalEnd.apply(res, args);
    }.bind(this);

    if (next) next();
  }

  // Create child logger with additional context
  child(additionalMetadata = {}) {
    return new Logger({
      context: this.context,
      level: this.level,
      format: this.format,
      enableCorrelation: this.enableCorrelation,
      metadata: { ...this.metadata, ...additionalMetadata },
    });
  }
}

// Export only the Logger class as named export (consistent with other modules)
export { Logger };
