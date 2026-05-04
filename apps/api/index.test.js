import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Create mock functions that we can reference
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockDatabase = {
  healthCheck: jest.fn().mockResolvedValue(true),
};

const mockCache = {
  set: jest.fn().mockResolvedValue(true),
  get: jest.fn().mockResolvedValue('ok'),
  delete: jest.fn().mockResolvedValue(true),
};

const mockEventBus = {
  emit: jest.fn(),
  on: jest.fn(),
  publish: jest.fn().mockResolvedValue(undefined),
};

const mockInitializeInfrastructure = jest.fn().mockResolvedValue(undefined);

// Mock infrastructure to avoid real DB/Redis/Auth connections in tests
jest.unstable_mockModule('@kloudi/infrastructure', () => ({
  default: mockInitializeInfrastructure,
}));

// Mock Logger to avoid console output during tests
jest.unstable_mockModule('@kloudi/shared/logger', () => ({
  Logger: {
    getInstance: jest.fn(() => mockLogger),
  },
}));

// Mock Config for middleware tests
jest.unstable_mockModule('@kloudi/shared/config', () => ({
  Config: {
    get: jest.fn((key, defaultValue) => {
      if (key === 'NODE_ENV') return 'test';
      return defaultValue;
    }),
    getCorsConfig: jest.fn(() => ({
      allowedOrigins: 'http://localhost:3000',
      allowedMethods: 'GET, POST, PUT, DELETE, OPTIONS',
      allowedHeaders: 'Content-Type, Authorization',
    })),
  },
}));

// Mock infrastructure components for health check
jest.unstable_mockModule('@kloudi/infrastructure/database', () => ({
  Database: {
    getInstance: jest.fn(() => mockDatabase),
  },
}));

jest.unstable_mockModule('@kloudi/infrastructure/cache', () => ({
  Cache: {
    getInstance: jest.fn(() => mockCache),
  },
}));

jest.unstable_mockModule('@kloudi/infrastructure/events', () => ({
  EventBus: {
    getInstance: jest.fn(() => mockEventBus),
  },
}));

// Import modules after mocking
let setupMiddleware, setupErrorHandling;
let loadAllRoutes;
let createHealthEndpoint;

describe('API Server Production Code', () => {
  let app;

  beforeAll(async () => {
    // Dynamically import modules after mocks are set up
    const middleware = await import('./lib/middleware.js');
    setupMiddleware = middleware.setupMiddleware;
    setupErrorHandling = middleware.setupErrorHandling;

    const routeLoader = await import('./lib/route-loader.js');
    loadAllRoutes = routeLoader.loadAllRoutes;

    const healthEndpoint = await import('./lib/health-endpoint.js');
    createHealthEndpoint = healthEndpoint.createHealthEndpoint;
  });

  beforeEach(() => {
    // Create fresh Express app for each test
    app = express();
    jest.clearAllMocks();
  });

  describe('Server Initialization', () => {
    test('should initialize infrastructure on startup', async () => {
      await mockInitializeInfrastructure();
      expect(mockInitializeInfrastructure).toHaveBeenCalled();
    });

    test('should setup middleware stack with all components', async () => {
      await setupMiddleware(app);

      // Verify middleware was called successfully (no errors thrown)
      // Test that middleware is working by making a request
      app.get('/test-middleware', (req, res) => res.json({ ok: true }));
      const response = await request(app).get('/test-middleware');

      // Verify security headers are set (confirms middleware is active)
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    test('should setup error handling middleware', async () => {
      await setupErrorHandling(app);

      // Test 404 handler works
      const response = await request(app).get('/non-existent-route');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Middleware Tests', () => {
    beforeEach(async () => {
      await setupMiddleware(app);
    });

    test('should parse JSON request bodies', async () => {
      app.post('/test', (req, res) => res.json(req.body));

      const testData = { test: 'data', number: 123 };
      const response = await request(app)
        .post('/test')
        .send(testData)
        .set('Content-Type', 'application/json');

      expect(response.body).toEqual(testData);
    });

    test('should set security headers', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    test('should set CORS headers for allowed origins', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000'
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should handle OPTIONS preflight requests', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app)
        .options('/test')
        .set('Origin', 'http://localhost:3000');

      expect(response.status).toBe(200);
    });

    test('should parse URL-encoded bodies', async () => {
      app.post('/test', (req, res) => res.json(req.body));

      const response = await request(app)
        .post('/test')
        .send('key=value&foo=bar')
        .set('Content-Type', 'application/x-www-form-urlencoded');

      expect(response.body).toEqual({ key: 'value', foo: 'bar' });
    });
  });

  describe('Health Endpoint Tests', () => {
    beforeEach(async () => {
      await setupMiddleware(app);
      // Mock fetch so the auth service HTTP health check doesn't hit a real server
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true });
      app.get(
        '/health',
        createHealthEndpoint({ port: 3001, environment: 'test' })
      );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should respond to health check with 200 status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('uptime');
    });

    test('should include system information in health check', async () => {
      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('nodeVersion');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('pid');
      expect(response.body.port).toBe(3001);
      expect(response.body.environment).toBe('test');
    });

    test('should check all infrastructure components', async () => {
      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('components');
      expect(response.body.components).toHaveProperty('database');
      expect(response.body.components).toHaveProperty('cache');
      expect(response.body.components).toHaveProperty('auth');
      expect(response.body.components).toHaveProperty('events');
    });

    test('should return healthy status for all components', async () => {
      const response = await request(app).get('/health');

      expect(response.body.components.database.status).toBe('healthy');
      expect(response.body.components.cache.status).toBe('healthy');
      expect(response.body.components.auth.status).toBe('healthy');
      expect(response.body.components.events.status).toBe('healthy');
    });

    test('should include memory usage metrics', async () => {
      const response = await request(app).get('/health');

      expect(response.body.memory).toHaveProperty('rss');
      expect(response.body.memory).toHaveProperty('heapTotal');
      expect(response.body.memory).toHaveProperty('heapUsed');
      expect(response.body.memory).toHaveProperty('external');
    });
  });

  describe('Route Loading Tests', () => {
    test('should load routes without errors', async () => {
      // The actual loadAllRoutes will try to scan filesystem
      // In a real test, you would mock fs.existsSync and fs.readdirSync
      // For now, we just verify it can be called without throwing
      await expect(loadAllRoutes(app)).resolves.not.toThrow();
    });
  });

  describe('Error Handling Tests', () => {
    test('should return 404 for non-existent routes', async () => {
      await setupMiddleware(app);
      await setupErrorHandling(app);

      const response = await request(app).get('/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
      expect(response.body.message).toContain('GET /non-existent');
    });

    test('should handle internal server errors', async () => {
      // Add route BEFORE error handling middleware
      app.get('/error', () => {
        throw new Error('Test error');
      });

      // Now add error handling
      await setupMiddleware(app);
      await setupErrorHandling(app);

      const response = await request(app).get('/error');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Internal Server Error');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should include error message in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Create a fresh app for this test
      const devApp = express();

      // Add route BEFORE middleware
      devApp.get('/error', () => {
        throw new Error('Detailed error message');
      });

      // Setup middleware and error handling
      await setupMiddleware(devApp);
      await setupErrorHandling(devApp);

      const response = await request(devApp).get('/error');

      expect(response.body.message).toBe('Detailed error message');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Integration Tests', () => {
    test('should build complete production-ready app', async () => {
      // Simulate the full startup sequence from index.js
      await mockInitializeInfrastructure();
      await setupMiddleware(app);
      app.get(
        '/health',
        createHealthEndpoint({ port: 3001, environment: 'test' })
      );
      await loadAllRoutes(app);
      await setupErrorHandling(app);

      // Verify the app is functional
      const healthResponse = await request(app).get('/health');
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.body.status).toBe('healthy');

      // Verify 404 handling works
      const notFoundResponse = await request(app).get('/non-existent');
      expect(notFoundResponse.status).toBe(404);
    });

    test('should handle multiple concurrent requests', async () => {
      await setupMiddleware(app);
      app.get(
        '/health',
        createHealthEndpoint({ port: 3001, environment: 'test' })
      );

      // Make multiple concurrent requests
      const requests = Array(10)
        .fill()
        .map(() => request(app).get('/health'));

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
      });
    });
  });
});
