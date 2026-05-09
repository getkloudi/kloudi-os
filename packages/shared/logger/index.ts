/* eslint-disable no-console -- User error feedback, not operational logging */
import { randomUUID } from 'crypto';
import { Config } from '@kloudi-os/shared/config';

/** Log level names */
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** Log level priority map */
type LogLevelPriority = Record<LogLevel, number>;

/** Metadata object for logging */
interface LogMetadata {
  correlationId?: string;
  [key: string]: unknown;
}

/** Error with optional code and statusCode */
interface LoggableError extends Error {
  code?: string | undefined;
  statusCode?: number | undefined;
}

/** Options for Logger constructor */
interface LoggerOptions {
  context?: string;
  format?: string;
  enableCorrelation?: boolean;
  metadata?: LogMetadata;
  level?: string;
}

/** Log entry structure */
interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  correlationId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    statusCode?: number;
  };
  tracing?: {
    traceId: string;
    spanId: string;
  };
  [key: string]: unknown;
}

/** Timer return type */
interface Timer {
  end: (additionalMetadata?: LogMetadata) => void;
}

/** Fallback logger interface */
interface FallbackLogger {
  info: (message: string, metadata?: LogMetadata) => void;
  error: (
    message: string,
    error?: Error | null,
    metadata?: LogMetadata
  ) => void;
  warn: (message: string, metadata?: LogMetadata) => void;
  debug: (message: string, metadata?: LogMetadata) => void;
  audit: (action: string, metadata?: LogMetadata) => void;
  time: (label: string, metadata?: LogMetadata) => Timer;
  child: (additionalMetadata?: LogMetadata) => FallbackLogger;
}

/** Express-like request object */
interface ExpressRequest {
  correlationId?: string;
  method: string;
  url: string;
  ip: string;
  get: (header: string) => string | undefined;
}

/** Express-like response object */
interface ExpressResponse {
  statusCode: number;
  end: (...args: unknown[]) => void;
}

/** Express-like next function */
type ExpressNextFunction = () => void;

/** OpenTelemetry span context */
interface OtelSpanContext {
  traceId: string;
  spanId: string;
}

/** OpenTelemetry span */
interface OtelSpan {
  spanContext: () => OtelSpanContext;
}

/** OpenTelemetry trace API */
interface OtelTraceApi {
  getActiveSpan: () => OtelSpan | undefined;
}

/** OpenTelemetry global extension */
interface OpenTelemetryGlobal {
  trace?: OtelTraceApi;
}

/** Level color map */
type LevelColorMap = Record<string, string>;

/**
 * Production-grade structured logger with observability features
 * Supports: OpenTelemetry, correlation IDs, multiple levels, JSON/pretty formats
 * Designed for scalability with external monitoring tools (DataDog, New Relic, etc.)
 */
class Logger {
  private static instances: Map<string, Logger>;
  private static globalLogLevel: string | undefined;

  private context: string;
  private level: string;
  private format: string;
  private enableCorrelation: boolean;
  private metadata: LogMetadata;
  private levels: LogLevelPriority;

  constructor(options: LoggerOptions = {}) {
    this.context = options.context ?? 'application';

    // Get log level from: globalLogLevel > config > default
    const configLogLevel =
      (Config.get('LOG_LEVEL') as string | null) ??
      (Config.get('environment.logLevel', 'error') as string | null);
    this.level = this.parseLogLevel(Logger.globalLogLevel ?? configLogLevel);

    this.format =
      options.format ?? (Config.get('LOG_FORMAT') as string | null) ?? 'json';
    this.enableCorrelation =
      options.enableCorrelation ??
      (Config.get('LOG_CORRELATION') as string | null) !== 'false';
    this.metadata = options.metadata ?? {};

    // Log levels with numeric values for comparison
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
  }

  static getInstance(context: string = 'default'): Logger | FallbackLogger {
    try {
      if (!Logger.instances) {
        Logger.instances = new Map();
      }

      if (!Logger.instances.has(context)) {
        Logger.instances.set(context, new Logger({ context }));
      }

      return Logger.instances.get(context) as Logger;
    } catch (error) {
      // Fallback to console logging if Logger initialization fails
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `Logger initialization failed for context "${context}":`,
        errorMessage
      );
      return Logger.createFallbackLogger(context);
    }
  }

  /**
   * Set log level for all existing and future logger instances
   * Useful for temporarily overriding log level (e.g., --verbose flag)
   */
  static setGlobalLogLevel(level: string): void {
    Logger.globalLogLevel = level;
    process.env['LOG_LEVEL'] = level;

    // Update all existing instances
    if (Logger.instances) {
      for (const instance of Logger.instances.values()) {
        instance.level = instance.parseLogLevel(level);
      }
    }
  }

  static createFallbackLogger(context: string): FallbackLogger {
    return {
      info: (message: string, metadata: LogMetadata = {}): void => {
        console.log(`[${context}] INFO: ${message}`, metadata);
      },
      error: (
        message: string,
        error: Error | null = null,
        metadata: LogMetadata = {}
      ): void => {
        console.error(
          `[${context}] ERROR: ${message}`,
          error?.message ?? error,
          metadata
        );
      },
      warn: (message: string, metadata: LogMetadata = {}): void => {
        console.warn(`[${context}] WARN: ${message}`, metadata);
      },
      debug: (message: string, metadata: LogMetadata = {}): void => {
        console.debug(`[${context}] DEBUG: ${message}`, metadata);
      },
      audit: (action: string, metadata: LogMetadata = {}): void => {
        console.log(`[${context}] AUDIT: ${action}`, metadata);
      },
      time: (label: string, metadata: LogMetadata = {}): Timer => {
        const startTime = Date.now();
        return {
          end: (additionalMetadata: LogMetadata = {}): void => {
            const duration = Date.now() - startTime;
            console.log(`[${context}] TIMER: ${label} (${duration}ms)`, {
              ...metadata,
              ...additionalMetadata,
            });
          },
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Fallback doesn't use metadata but maintains API compatibility
      child: (_additionalMetadata: LogMetadata = {}): FallbackLogger => {
        return Logger.createFallbackLogger(`${context}-child`);
      },
    };
  }

  static createCorrelationId(): string {
    return randomUUID();
  }

  parseLogLevel(level: string | null | undefined): string {
    return typeof level === 'string' ? level.toLowerCase() : 'info';
  }

  shouldLog(level: LogLevel): boolean {
    const levelPriority = this.levels[level];
    const currentLevelPriority = this.levels[this.level as LogLevel];
    return (
      levelPriority !== undefined &&
      currentLevelPriority !== undefined &&
      levelPriority <= currentLevelPriority
    );
  }

  formatMessage(
    level: string,
    message: string,
    metadata: LogMetadata = {},
    error: LoggableError | null = null
  ): string {
    const timestamp = new Date().toISOString();
    const correlationId =
      metadata.correlationId ?? this.generateCorrelationId();

    const logEntry: LogEntry = {
      timestamp,
      level: level.toUpperCase(),
      context: this.context,
      message,
      ...(this.enableCorrelation && correlationId ? { correlationId } : {}),
      ...this.metadata,
      ...metadata,
    };

    // Add error details if present
    if (error) {
      const errorDetails: LogEntry['error'] = {
        name: error.name,
        message: error.message,
      };
      if (error.stack) {
        errorDetails.stack = error.stack;
      }
      if (error.code) {
        errorDetails.code = error.code;
      }
      if (error.statusCode) {
        errorDetails.statusCode = error.statusCode;
      }
      logEntry.error = errorDetails;
    }

    // Add OpenTelemetry trace context if available
    const otel = (
      globalThis as unknown as { opentelemetry?: OpenTelemetryGlobal }
    ).opentelemetry;
    if (otel?.trace?.getActiveSpan) {
      const span = otel.trace.getActiveSpan();
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

  formatPretty(logEntry: LogEntry): string {
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
      output += `\n  Error: ${error.message}\n  Stack: ${error.stack ?? 'N/A'}`;
    }

    return output;
  }

  getLevelColor(level: string): string {
    const colors: LevelColorMap = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m', // Yellow
      INFO: '\x1b[36m', // Cyan
      DEBUG: '\x1b[90m', // Gray
    };
    return colors[level] ?? colors['INFO'] ?? '';
  }

  get colors(): { reset: string } {
    return {
      reset: '\x1b[0m',
    };
  }

  generateCorrelationId(): string | undefined {
    return this.enableCorrelation ? Logger.createCorrelationId() : undefined;
  }

  writeLog(
    level: LogLevel,
    message: string,
    metadata: LogMetadata = {},
    error: LoggableError | null = null
  ): void {
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
        console.error(fallbackMessage, error?.message ?? error, metadata);
      } else {
        console.log(fallbackMessage, metadata);
      }

      // Try to log the logging error itself (recursive fallback protection)
      const logErrorMessage =
        logError instanceof Error ? logError.message : String(logError);
      if (logErrorMessage !== 'Logger writeLog failed') {
        console.warn('Logger writeLog failed:', logErrorMessage);
      }
    }
  }

  sendToObservabilityPlatform(
    level: LogLevel,
    message: string,
    metadata: LogMetadata,
    error: LoggableError | null
  ): void {
    // Hook for integration with monitoring platforms
    // DataDog, New Relic, Splunk, etc. can be integrated here
    if (process.env['OBSERVABILITY_WEBHOOK_URL']) {
      // Example: Send to webhook endpoint
      void this.sendToWebhook(level, message, metadata, error);
    }

    // Example integrations:
    // - DataDog: datadog.increment('app.log.count', 1, [`level:${level}`]);
    // - New Relic: newrelic.recordLogEvent({ level, message, ...metadata });
    // - Custom metrics: this.incrementMetric(`log.${level}.count`);
  }

  async sendToWebhook(
    level: LogLevel,
    message: string,
    metadata: LogMetadata,
    error: LoggableError | null
  ): Promise<void> {
    try {
      const webhook = process.env['OBSERVABILITY_WEBHOOK_URL'];
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
  info(message: string, metadata: LogMetadata = {}): void {
    this.writeLog('info', message, metadata);
  }

  error(
    message: string,
    error: LoggableError | null = null,
    metadata: LogMetadata = {}
  ): void {
    this.writeLog('error', message, metadata, error);
  }

  warn(message: string, metadata: LogMetadata = {}): void {
    this.writeLog('warn', message, metadata);
  }

  debug(message: string, metadata: LogMetadata = {}): void {
    this.writeLog('debug', message, metadata);
  }

  audit(action: string, metadata: LogMetadata = {}): void {
    this.writeLog('info', `AUDIT: ${action}`, {
      ...metadata,
      type: 'audit',
      action,
    });
  }

  // Performance logging
  time(label: string, metadata: LogMetadata = {}): Timer {
    const startTime = process.hrtime.bigint();
    return {
      end: (additionalMetadata: LogMetadata = {}): void => {
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
  logRequest(
    req: ExpressRequest,
    res: ExpressResponse,
    next?: ExpressNextFunction
  ): void {
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
    const logger = this;
    res.end = function (this: ExpressResponse, ...args: unknown[]): void {
      const duration = Number(process.hrtime.bigint() - startTime) / 1e6;

      logger.info('HTTP Response', {
        correlationId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
      });

      originalEnd.apply(this, args);
    };

    if (next) next();
  }

  // Create child logger with additional context
  child(additionalMetadata: LogMetadata = {}): Logger {
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
export type {
  LogMetadata,
  LogLevel,
  LoggerOptions,
  Timer,
  FallbackLogger,
  LoggableError,
};
