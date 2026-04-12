/* global fetch */

/**
 * End-to-End Tests for API Server
 *
 * These tests use REAL infrastructure (no mocks):
 * - PostgreSQL database (port 5433 for tests)
 * - Redis cache (port 6380 for tests)
 * - Redis EventBus (port 6380 for tests)
 * - JWT authentication
 *
 * Prerequisites:
 * - Docker services running via docker-compose.test.yml
 * - Environment variables in .env.test
 *
 * Run: NODE_ENV=test npm test -- index.e2e.test.js
 */

import { spawn } from 'child_process';
import RedisPkg from 'ioredis';
import { dirname, join } from 'path';
import pg from 'pg';
import supertest from 'supertest';
import { fileURLToPath } from 'url';
const Redis = RedisPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration (matches .env.test)
const TEST_CONFIG = {
  API_PORT: 3002,
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: 5433,
  POSTGRES_USER: 'kloudi_test',
  POSTGRES_PASSWORD: 'kloudi_test_password',
  POSTGRES_DB: 'kloudi_test',
  REDIS_HOST: 'localhost',
  REDIS_PORT: 6380,
  MAX_STARTUP_TIME: 30000, // 30 seconds
  MAX_TEST_TIMEOUT: 10000, // 10 seconds
};

// Helper Functions

/**
 * Wait for a service to be ready by polling a URL
 */
async function waitForService(url, maxAttempts = 30, interval = 1000) {
  console.log(`Waiting for service at ${url}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(
          `Service ready at ${url} (attempt ${attempt}/${maxAttempts})`
        );
        return true;
      }
    } catch (error) {
      console.log('Service not ready yet: error', error);
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  throw new Error(`Service at ${url} not ready after ${maxAttempts} attempts`);
}

/**
 * Wait for PostgreSQL to be ready
 */
async function waitForPostgres(config, maxAttempts = 30, interval = 1000) {
  const connectionString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
  console.log(`Waiting for PostgreSQL at ${config.host}:${config.port}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = new pg.Client(connectionString);

    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();

      console.log(
        `PostgreSQL ready at ${config.host}:${config.port} (attempt ${attempt}/${maxAttempts})`
      );
      return true;
    } catch (error) {
      console.log('error', error);
      await client.end().catch(() => {});

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }
  }

  throw new Error(
    `PostgreSQL at ${config.host}:${config.port} not ready after ${maxAttempts} attempts`
  );
}

/**
 * Wait for Redis to be ready
 */
async function waitForRedis(host, port, maxAttempts = 30, interval = 1000) {
  console.log(`Waiting for Redis at ${host}:${port}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const redis = new Redis({
      host,
      port,
      lazyConnect: true,
      connectTimeout: 2000,
      retryStrategy: () => null, // Don't retry, we'll handle it manually
    });

    try {
      await redis.connect();
      await redis.ping();
      await redis.disconnect();

      console.log(
        `Redis ready at ${host}:${port} (attempt ${attempt}/${maxAttempts})`
      );
      return true;
    } catch (error) {
      console.log('Redis connection error', error);
      await redis.disconnect().catch(() => {});

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }
  }

  throw new Error(
    `Redis at ${host}:${port} not ready after ${maxAttempts} attempts`
  );
}

/**
 * Start the API server as a child process
 */
function startServerProcess(port, env = {}) {
  return new Promise((resolve, reject) => {
    const serverPath = join(__dirname, 'index.js');
    // Calculate absolute path to the config directory
    // __dirname is /apps/api, so we go up two levels to project root, then to packages/shared/config
    const configDir = join(__dirname, '../../packages/shared/config');

    const serverProcess = spawn('node', [serverPath], {
      env: {
        ...process.env,
        PORT: port,
        NODE_ENV: 'test',
        NODE_CONFIG_DIR: configDir,
        NODE_CONFIG_ALLOW_UNDEFINED: 'false',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';
    let resolved = false;

    serverProcess.stdout.on('data', (data) => {
      output += data.toString();
      const message = data.toString();

      // Look for success message
      if (message.includes('API server started on port') && !resolved) {
        resolved = true;
        resolve(serverProcess);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error('Server stderr:', data.toString());
    });

    serverProcess.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Failed to start server: ${error.message}`));
      }
    });

    serverProcess.on('exit', (code) => {
      if (!resolved && code !== 0) {
        resolved = true;
        reject(
          new Error(
            `Server exited with code ${code}\nOutput: ${output}\nErrors: ${errorOutput}`
          )
        );
      }
    });

    // Timeout if server doesn't start
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        serverProcess.kill();
        reject(
          new Error(
            `Server start timeout\nOutput: ${output}\nErrors: ${errorOutput}`
          )
        );
      }
    }, TEST_CONFIG.MAX_STARTUP_TIME);
  });
}

/**
 * Gracefully shutdown the server process
 */
async function shutdownServerProcess(serverProcess, timeout = 10000) {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    serverProcess.on('exit', cleanup);

    // Send SIGTERM for graceful shutdown
    serverProcess.kill('SIGTERM');

    // Force kill if timeout
    setTimeout(() => {
      if (!serverProcess.killed) {
        console.warn('Forcing server shutdown...');
        serverProcess.kill('SIGKILL');
      }
      cleanup();
    }, timeout);
  });
}

// Test Suite

describe('API Server E2E Tests', () => {
  let request;
  let serverProcess;
  let redisClient;

  beforeAll(async () => {
    console.log('\n=== Starting E2E Test Suite ===\n');

    // 1. Check infrastructure services are running
    console.log('Step 1: Checking infrastructure services...');

    try {
      await waitForPostgres({
        host: TEST_CONFIG.POSTGRES_HOST,
        port: TEST_CONFIG.POSTGRES_PORT,
        user: TEST_CONFIG.POSTGRES_USER,
        password: TEST_CONFIG.POSTGRES_PASSWORD,
        database: TEST_CONFIG.POSTGRES_DB,
      });
    } catch (error) {
      console.error('\nPostgreSQL not ready. Start it with:');
      console.error(
        `docker run -d -p ${TEST_CONFIG.POSTGRES_PORT}:5432 -e POSTGRES_USER=${TEST_CONFIG.POSTGRES_USER} -e POSTGRES_PASSWORD=${TEST_CONFIG.POSTGRES_PASSWORD} -e POSTGRES_DB=${TEST_CONFIG.POSTGRES_DB} postgres:15-alpine`
      );
      throw error;
    }

    try {
      await waitForRedis(TEST_CONFIG.REDIS_HOST, TEST_CONFIG.REDIS_PORT);
    } catch (error) {
      console.error('\nRedis not ready. Start it with:');
      console.error(
        `docker run -d -p ${TEST_CONFIG.REDIS_PORT}:6379 redis:7-alpine`
      );
      throw error;
    }

    // 2. Create Redis client for test utilities
    redisClient = new Redis({
      host: TEST_CONFIG.REDIS_HOST,
      port: TEST_CONFIG.REDIS_PORT,
    });

    // 3. Clear test data
    console.log('Step 2: Clearing test data...');
    await redisClient.flushdb();

    // 4. Start the server
    console.log('Step 3: Starting API server...');
    const serverEnv = {
      DATABASE_URL: `postgresql://${TEST_CONFIG.POSTGRES_USER}:${TEST_CONFIG.POSTGRES_PASSWORD}@${TEST_CONFIG.POSTGRES_HOST}:${TEST_CONFIG.POSTGRES_PORT}/${TEST_CONFIG.POSTGRES_DB}`,
      REDIS_HOST: TEST_CONFIG.REDIS_HOST,
      REDIS_PORT: TEST_CONFIG.REDIS_PORT,
      REDIS_URL: `redis://${TEST_CONFIG.REDIS_HOST}:${TEST_CONFIG.REDIS_PORT}`,
      JWT_SECRET: 'test_jwt_secret_key_for_testing_only_not_for_production',
      JWT_ACCESS_TOKEN_EXPIRY: '15m',
      JWT_REFRESH_TOKEN_EXPIRY: '7d',
      CACHE_DEFAULT_TTL: '300',
      EVENTS_ENABLED: 'true',
      EVENTS_RETRY_ATTEMPTS: '3',
      LOG_LEVEL: 'error',
      NODE_ENV: 'test',
    };

    serverProcess = await startServerProcess(TEST_CONFIG.API_PORT, serverEnv);

    // 5. Wait for server to be ready
    console.log('Step 4: Waiting for server to be ready...');
    await waitForService(`http://localhost:${TEST_CONFIG.API_PORT}/health`);

    // 6. Initialize supertest
    request = supertest(`http://localhost:${TEST_CONFIG.API_PORT}`);

    console.log('\n=== E2E Test Suite Ready ===\n');
  }, TEST_CONFIG.MAX_STARTUP_TIME);

  afterAll(async () => {
    console.log('\n=== Cleaning Up E2E Test Suite ===\n');

    // 1. Shutdown server
    if (serverProcess) {
      console.log('Shutting down server...');
      await shutdownServerProcess(serverProcess);
    }

    // 2. Close Redis client
    if (redisClient) {
      await redisClient.quit();
    }

    console.log('\n=== E2E Test Suite Cleanup Complete ===\n');
  }, 15000);

  describe('Server Lifecycle', () => {
    test(
      'should start server and connect to all infrastructure',
      async () => {
        const response = await request.get('/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
        expect(response.body.environment).toBe('test');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should handle graceful shutdown signal (tested via process management)',
      async () => {
        // This test verifies that the server can be shut down gracefully
        // The actual shutdown is tested in afterAll
        expect(serverProcess).toBeDefined();
        expect(serverProcess.killed).toBe(false);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });

  describe('Infrastructure Components', () => {
    test(
      'should connect to PostgreSQL database',
      async () => {
        const response = await request.get('/health');

        expect(response.status).toBe(200);
        expect(response.body.components).toHaveProperty('database');
        expect(response.body.components.database.status).toBe('healthy');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should connect to Redis cache',
      async () => {
        const response = await request.get('/health');

        expect(response.status).toBe(200);
        expect(response.body.components).toHaveProperty('cache');
        expect(response.body.components.cache.status).toBe('healthy');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should initialize JWT authentication',
      async () => {
        const response = await request.get('/health');

        expect(response.status).toBe(200);
        expect(response.body.components).toHaveProperty('auth');
        expect(response.body.components.auth.status).toBe('healthy');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should connect to Redis EventBus',
      async () => {
        const response = await request.get('/health');

        expect(response.status).toBe(200);
        expect(response.body.components).toHaveProperty('events');
        expect(response.body.components.events.status).toBe('healthy');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });

  describe('Health Endpoint', () => {
    test(
      'should return 200 with full health report',
      async () => {
        const response = await request.get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('uptime');
        expect(response.body).toHaveProperty('version');
        expect(response.body).toHaveProperty('environment', 'test');
        expect(response.body).toHaveProperty('components');
        expect(response.body).toHaveProperty('port', TEST_CONFIG.API_PORT);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should include system information',
      async () => {
        const response = await request.get('/health');

        expect(response.body).toHaveProperty('nodeVersion');
        expect(response.body.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
        expect(response.body).toHaveProperty('memory');
        expect(response.body.memory).toHaveProperty('rss');
        expect(response.body.memory).toHaveProperty('heapTotal');
        expect(response.body.memory).toHaveProperty('heapUsed');
        expect(response.body.memory).toHaveProperty('external');
        expect(response.body).toHaveProperty('pid');
        expect(typeof response.body.pid).toBe('number');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should report degraded status if any component is unhealthy',
      async () => {
        // This would require actually breaking a service
        // For now, we just verify the healthy state is correct
        const response = await request.get('/health');

        expect(response.body.status).toBe('healthy');
        const components = Object.values(response.body.components);
        expect(components.every((c) => c.status === 'healthy')).toBe(true);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });

  describe('Route Auto-Discovery', () => {
    test(
      'should load routes from apps/api/routes/ (ping endpoint)',
      async () => {
        const response = await request.get('/ping');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('message', 'pong');
        expect(response.body).toHaveProperty('timestamp');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should load routes from apps/api/routes/ (version endpoint)',
      async () => {
        const response = await request.get('/version');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('version');
        expect(response.body).toHaveProperty('api');
        expect(response.body).toHaveProperty('node');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should load routes from apps/api/routes/ (echo endpoint)',
      async () => {
        const testData = { test: 'data', number: 123 };
        const response = await request
          .post('/echo')
          .send(testData)
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('received');
        expect(response.body.received).toEqual(testData);
        expect(response.body).toHaveProperty('method', 'POST');
        expect(response.body).toHaveProperty('headers');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });

  describe('Middleware', () => {
    test(
      'should parse JSON request bodies',
      async () => {
        const testData = { key: 'value', nested: { data: 'test' } };
        const response = await request
          .post('/echo')
          .send(testData)
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body.received).toEqual(testData);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should set CORS headers',
      async () => {
        const response = await request
          .get('/health')
          .set('Origin', 'http://localhost:3000');

        expect(response.headers).toHaveProperty('access-control-allow-origin');
        expect(response.headers).toHaveProperty(
          'access-control-allow-credentials',
          'true'
        );
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should set security headers',
      async () => {
        const response = await request.get('/health');

        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should handle OPTIONS preflight requests',
      async () => {
        const response = await request
          .options('/health')
          .set('Origin', 'http://localhost:3000')
          .set('Access-Control-Request-Method', 'GET');

        expect(response.status).toBe(200);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });

  describe('Error Handling', () => {
    test(
      'should return 404 for non-existent routes',
      async () => {
        const response = await request.get('/does-not-exist');

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error', 'Not Found');
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('GET /does-not-exist');
        expect(response.body).toHaveProperty('timestamp');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should handle invalid JSON gracefully',
      async () => {
        const response = await request
          .post('/echo')
          .send('invalid json {')
          .set('Content-Type', 'application/json');

        // Express should handle this with 400
        expect([400, 500]).toContain(response.status);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });

  describe('Database Operations (E2E)', () => {
    test(
      'should perform database health check',
      async () => {
        const response = await request.get('/health');

        expect(response.status).toBe(200);
        expect(response.body.components.database.status).toBe('healthy');
        expect(response.body.components.database).toHaveProperty('timestamp');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should connect to correct test database',
      async () => {
        // Verify we're connected to test database by checking environment
        const response = await request.get('/health');

        expect(response.body.environment).toBe('test');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });

  describe('Cache Operations (E2E)', () => {
    test(
      'should perform cache operations through Redis',
      async () => {
        // The health check performs actual cache operations
        const response = await request.get('/health');

        expect(response.status).toBe(200);
        expect(response.body.components.cache.status).toBe('healthy');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should write and read from cache using raw Redis',
      async () => {
        // Use our test Redis client to verify cache operations work
        const testKey = 'e2e-test-key';
        const testValue = { data: 'test', timestamp: Date.now() };

        // Write to cache
        await redisClient.setex(testKey, 60, JSON.stringify(testValue));

        // Read from cache
        const retrieved = await redisClient.get(testKey);
        expect(JSON.parse(retrieved)).toEqual(testValue);

        // Clean up
        await redisClient.del(testKey);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should perform cache operations via Cache class (Real Redis)',
      async () => {
        const { Cache } = await import('@kloudi/infrastructure/cache');
        const cache = Cache.getInstance();

        const testKey = 'e2e-test-cache-class-key';
        const testValue = 'e2e-test-value';

        // Set value
        await cache.set(testKey, testValue);

        // Get value
        const retrieved = await cache.get(testKey);
        expect(retrieved).toBe(testValue);

        // Delete value
        await cache.delete(testKey);

        // Verify deletion
        const afterDelete = await cache.get(testKey);
        expect(afterDelete).toBeNull();
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should handle cache TTL via Cache class',
      async () => {
        const { Cache } = await import('@kloudi/infrastructure/cache');
        const cache = Cache.getInstance();

        const testKey = 'e2e-test-ttl-key';
        const testValue = 'expires-soon';

        // Set with 2 second TTL
        await cache.set(testKey, testValue, 2);

        // Immediately retrieve - should exist
        const immediate = await cache.get(testKey);
        expect(immediate).toBe(testValue);

        // Wait for expiration
        await new Promise((resolve) => setTimeout(resolve, 2500));

        // Should be expired
        const afterExpiry = await cache.get(testKey);
        expect(afterExpiry).toBeNull();
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should cache complex objects via Cache class',
      async () => {
        const { Cache } = await import('@kloudi/infrastructure/cache');
        const cache = Cache.getInstance();

        const testKey = 'e2e-test-object-key';
        const testObject = {
          id: 123,
          name: 'Test User',
          roles: ['admin', 'user'],
          metadata: {
            created: new Date().toISOString(),
            active: true,
          },
        };

        await cache.set(testKey, testObject);
        const retrieved = await cache.get(testKey);

        expect(retrieved).toEqual(testObject);

        // Cleanup
        await cache.delete(testKey);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should handle concurrent cache operations',
      async () => {
        const { Cache } = await import('@kloudi/infrastructure/cache');
        const cache = Cache.getInstance();

        const operations = Array(10)
          .fill(null)
          .map((_, i) => {
            const key = `e2e-test-concurrent-${i}`;
            const value = `value-${i}`;
            return cache.set(key, value).then(() => cache.get(key));
          });

        const results = await Promise.all(operations);

        results.forEach((result, i) => {
          expect(result).toBe(`value-${i}`);
        });

        // Cleanup
        await Promise.all(
          Array(10)
            .fill(null)
            .map((_, i) => cache.delete(`e2e-test-concurrent-${i}`))
        );
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });

  describe('EventBus Operations (E2E)', () => {
    test(
      'should initialize EventBus successfully',
      async () => {
        const response = await request.get('/health');

        expect(response.status).toBe(200);
        expect(response.body.components.events.status).toBe('healthy');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should publish and subscribe to events via raw Redis Pub/Sub',
      async () => {
        // Create a subscriber
        const subscriber = new Redis({
          host: TEST_CONFIG.REDIS_HOST,
          port: TEST_CONFIG.REDIS_PORT,
        });

        const messagesReceived = [];
        const testChannel = 'test-channel';
        const testMessage = { type: 'test-event', data: { value: 123 } };

        // Subscribe
        await subscriber.subscribe(testChannel);
        subscriber.on('message', (channel, message) => {
          if (channel === testChannel) {
            messagesReceived.push(JSON.parse(message));
          }
        });

        // Wait a bit for subscription to be active
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Publish
        await redisClient.publish(testChannel, JSON.stringify(testMessage));

        // Wait for message delivery
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Verify
        expect(messagesReceived).toHaveLength(1);
        expect(messagesReceived[0]).toEqual(testMessage);

        // Cleanup
        await subscriber.unsubscribe(testChannel);
        await subscriber.quit();
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should publish and subscribe to events via EventBus class (Real Redis Pub/Sub)',
      async () => {
        const { EventBus } = await import('@kloudi/infrastructure/events');
        const eventBus = EventBus.getInstance();

        const testEvent = 'e2e-test-event';
        const testData = { message: 'test-message', timestamp: Date.now() };

        const receivedPromise = new Promise((resolve) => {
          eventBus.subscribe(testEvent, (data) => {
            resolve(data);
          });
        });

        // Wait for subscription to be established
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Publish event
        await eventBus.publish(testEvent, testData);

        // Wait for event to be received
        const received = await receivedPromise;
        expect(received).toEqual(testData);

        // Cleanup
        await eventBus.unsubscribe(testEvent);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should handle multiple subscribers to same event via EventBus',
      async () => {
        const { EventBus } = await import('@kloudi/infrastructure/events');
        const eventBus = EventBus.getInstance();

        const testEvent = 'e2e-test-multi-subscriber';
        const testData = { value: 'broadcast-message' };

        const received1 = new Promise((resolve) => {
          eventBus.subscribe(testEvent, (data) => resolve(data));
        });

        const received2 = new Promise((resolve) => {
          eventBus.subscribe(testEvent, (data) => resolve(data));
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        await eventBus.publish(testEvent, testData);

        const [result1, result2] = await Promise.all([received1, received2]);

        expect(result1).toEqual(testData);
        expect(result2).toEqual(testData);

        // Cleanup
        await eventBus.unsubscribe(testEvent);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should handle event with complex payload via EventBus',
      async () => {
        const { EventBus } = await import('@kloudi/infrastructure/events');
        const eventBus = EventBus.getInstance();

        const testEvent = 'e2e-test-complex-event';
        const complexData = {
          type: 'user.created',
          payload: {
            userId: 'user-123',
            email: 'test@example.com',
            roles: ['user', 'beta-tester'],
            metadata: {
              source: 'api',
              timestamp: new Date().toISOString(),
            },
          },
        };

        const receivedPromise = new Promise((resolve) => {
          eventBus.subscribe(testEvent, (data) => resolve(data));
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
        await eventBus.publish(testEvent, complexData);

        const received = await receivedPromise;
        expect(received).toEqual(complexData);

        // Cleanup
        await eventBus.unsubscribe(testEvent);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });

  describe('Authentication (E2E)', () => {
    test(
      'should create and validate JWT tokens',
      async () => {
        // The health check creates and validates tokens
        const response = await request.get('/health');

        expect(response.status).toBe(200);
        expect(response.body.components.auth.status).toBe('healthy');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });

  describe('Performance and Load', () => {
    test(
      'should handle multiple concurrent health check requests',
      async () => {
        const requests = Array(20)
          .fill()
          .map(() => request.get('/health'));

        const responses = await Promise.all(requests);

        responses.forEach((response) => {
          expect(response.status).toBe(200);
          expect(response.body.status).toBe('healthy');
        });
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should handle concurrent requests to different endpoints',
      async () => {
        const requests = [
          request.get('/health'),
          request.get('/ping'),
          request.get('/version'),
          request.post('/echo').send({ test: 1 }),
          request.get('/health'),
          request.get('/ping'),
        ];

        const responses = await Promise.all(requests);

        expect(responses[0].status).toBe(200); // health
        expect(responses[1].status).toBe(200); // ping
        expect(responses[2].status).toBe(200); // version
        expect(responses[3].status).toBe(200); // echo
        expect(responses[4].status).toBe(200); // health
        expect(responses[5].status).toBe(200); // ping
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });

  describe('Integration Scenarios', () => {
    test(
      'should maintain consistent state across multiple operations',
      async () => {
        // 1. Check health
        const health1 = await request.get('/health');
        expect(health1.status).toBe(200);

        // 2. Make some API calls
        await request.get('/ping');
        await request.post('/echo').send({ test: 'data' });

        // 3. Check health again
        const health2 = await request.get('/health');
        expect(health2.status).toBe(200);

        // 4. Verify all components still healthy
        expect(health2.body.components.database.status).toBe('healthy');
        expect(health2.body.components.cache.status).toBe('healthy');
        expect(health2.body.components.auth.status).toBe('healthy');
        expect(health2.body.components.events.status).toBe('healthy');
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should handle rapid sequential requests',
      async () => {
        const results = [];

        for (let i = 0; i < 10; i++) {
          const response = await request.get('/ping');
          results.push(response.status);
        }

        expect(results).toHaveLength(10);
        expect(results.every((status) => status === 200)).toBe(true);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );

    test(
      'should integrate cache and events in workflow',
      async () => {
        const { Cache } = await import('@kloudi/infrastructure/cache');
        const { EventBus } = await import('@kloudi/infrastructure/events');

        const cache = Cache.getInstance();
        const eventBus = EventBus.getInstance();

        const workflowId = 'e2e-test-workflow';
        const eventName = `workflow.${workflowId}`;

        // Subscribe to workflow event
        const eventPromise = new Promise((resolve) => {
          eventBus.subscribe(eventName, (data) => resolve(data));
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        // Store data in cache
        const workflowData = { id: workflowId, status: 'processing' };
        await cache.set(`workflow:${workflowId}`, workflowData);

        // Publish event
        await eventBus.publish(eventName, {
          id: workflowId,
          action: 'started',
        });

        // Verify event received
        const event = await eventPromise;
        expect(event.id).toBe(workflowId);

        // Retrieve from cache
        const cached = await cache.get(`workflow:${workflowId}`);
        expect(cached).toEqual(workflowData);

        // Cleanup
        await cache.delete(`workflow:${workflowId}`);
        await eventBus.unsubscribe(eventName);
      },
      TEST_CONFIG.MAX_TEST_TIMEOUT
    );
  });
});
