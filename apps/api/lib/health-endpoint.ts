import type { Request, Response, RequestHandler } from 'express';
import { JwtManager } from '@kloudi/auth';
import { Cache } from '@kloudi/infrastructure/cache';
import { Database } from '@kloudi/infrastructure/database'; // TODO: Uncomment when schema has models
import { EventBus } from '@kloudi/infrastructure/events';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('health-endpoint');

interface HealthConfig {
  port?: string | number | undefined;
  environment?: string | undefined;
}

interface ComponentStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  error?: string;
  timestamp: string;
}

interface HealthResults {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  nodeVersion: string;
  memory: MemoryUsage;
  pid: number;
  uptime: number;
  port: string | number | undefined;
  environment: string | undefined;
  components: Record<string, ComponentStatus>;
  error?: string | undefined;
}

interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
}

/**
 * Health Check Endpoint
 *
 * Directly checks essential infrastructure components.
 * Simple, direct, no abstraction layers.
 */

/**
 * Create health check endpoint handler
 *
 * @param config - Configuration for health check
 * @returns Express route handler
 */
export function createHealthEndpoint(
  config: HealthConfig = {}
): RequestHandler {
  const startTime = Date.now();

  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const results: HealthResults = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] ?? '1.0.0',
        nodeVersion: process.version,
        memory: getMemoryUsage(),
        pid: process.pid,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        port: config.port,
        environment: config.environment,
        components: {},
      };

      // Check database
      try {
        const db = Database.getInstance();
        await db.healthCheck();

        results.components['database'] = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        const err = error as Error;
        results.components['database'] = {
          status: 'unhealthy',
          error: err.message,
          timestamp: new Date().toISOString(),
        };
      }

      // Check cache
      try {
        const cache = Cache.getInstance();
        const testKey = '__health_check__';
        const testValue = 'ok';
        await cache.set(testKey, testValue, 5);
        const retrieved = await cache.get(testKey);
        await cache.delete(testKey);

        results.components['cache'] = {
          status: retrieved === testValue ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        const err = error as Error;
        results.components['cache'] = {
          status: 'unhealthy',
          error: err.message,
          timestamp: new Date().toISOString(),
        };
      }

      // Check auth
      try {
        const auth = JwtManager.getInstance();
        const sessionData = await auth.createSession('health-check', {
          permissions: [],
          roles: [],
          metadata: { test: true },
        });
        const verified = await auth.validateSession(sessionData.accessToken);

        results.components['auth'] = {
          status: verified.userId === 'health-check' ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        const err = error as Error;
        results.components['auth'] = {
          status: 'unhealthy',
          error: err.message,
          timestamp: new Date().toISOString(),
        };
      }

      // Check events
      try {
        const events = EventBus.getInstance();
        await events.publish('health-check', { test: true });

        results.components['events'] = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        const err = error as Error;
        results.components['events'] = {
          status: 'unhealthy',
          error: err.message,
          timestamp: new Date().toISOString(),
        };
      }

      // Determine overall status
      const unhealthyComponents = Object.values(results.components).filter(
        (component) => component.status === 'unhealthy'
      );

      if (unhealthyComponents.length > 0) {
        results.status = 'unhealthy';
      } else if (
        Object.values(results.components).some((c) => c.status === 'degraded')
      ) {
        results.status = 'degraded';
      }

      const statusCode = results.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(results);

      logger.debug('Health check executed', {
        context: 'health-check',
        status: results.status,
        components: Object.keys(results.components).length,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Health check failed', err, {
        context: 'health-check-error',
      });

      res.status(500).json({
        status: 'error',
        error: err.message,
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        port: config.port,
        environment: config.environment,
      });
    }
  };
}

/**
 * Get memory usage information
 *
 * @private
 * @returns Memory usage metrics in MB
 */
function getMemoryUsage(): MemoryUsage {
  const usage = process.memoryUsage();
  return {
    rss: Math.round((usage.rss / 1024 / 1024) * 100) / 100,
    heapTotal: Math.round((usage.heapTotal / 1024 / 1024) * 100) / 100,
    heapUsed: Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100,
    external: Math.round((usage.external / 1024 / 1024) * 100) / 100,
  };
}
