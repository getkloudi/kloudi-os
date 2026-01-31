import { JwtManager } from '@kloudi/auth';
import { Cache } from '@kloudi/infrastructure/cache';
import { Database } from '@kloudi/infrastructure/database'; // TODO: Uncomment when schema has models
import { EventBus } from '@kloudi/infrastructure/events';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('health-endpoint');

/**
 * Health Check Endpoint
 *
 * Directly checks essential infrastructure components.
 * Simple, direct, no abstraction layers.
 */

/**
 * Create health check endpoint handler
 *
 * @param {Object} config - Configuration for health check
 * @returns {Function} Express route handler
 */
export function createHealthEndpoint(config = {}) {
  const startTime = Date.now();

  return async (req, res) => {
    try {
      const results = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
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

        results.components.database = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        results.components.database = {
          status: 'unhealthy',
          error: error.message,
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

        results.components.cache = {
          status: retrieved === testValue ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        results.components.cache = {
          status: 'unhealthy',
          error: error.message,
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

        results.components.auth = {
          status: verified.userId === 'health-check' ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        results.components.auth = {
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }

      // Check events
      try {
        const events = EventBus.getInstance();
        await events.publish('health-check', { test: true });

        results.components.events = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        results.components.events = {
          status: 'unhealthy',
          error: error.message,
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
      logger.error('Health check failed', error, {
        context: 'health-check-error',
      });

      res.status(500).json({
        status: 'error',
        error: error.message,
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
 * @returns {Object} Memory usage metrics in MB
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: Math.round((usage.rss / 1024 / 1024) * 100) / 100,
    heapTotal: Math.round((usage.heapTotal / 1024 / 1024) * 100) / 100,
    heapUsed: Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100,
    external: Math.round((usage.external / 1024 / 1024) * 100) / 100,
  };
}
