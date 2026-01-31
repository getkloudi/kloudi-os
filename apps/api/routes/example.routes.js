/**
 * Example Manual API Routes
 *
 * This file demonstrates how to add custom API routes to the server.
 * Routes in this file are automatically discovered and registered.
 */

export function setupRoutes(app) {
  // Simple ping endpoint
  app.get('/ping', (req, res) => {
    res.json({
      message: 'pong',
      timestamp: new Date().toISOString(),
    });
  });

  // Version endpoint
  app.get('/version', (req, res) => {
    res.json({
      version: '1.0.0',
      api: 'Clean DDD Architecture',
      node: process.version,
    });
  });

  // Echo endpoint for testing
  app.post('/echo', (req, res) => {
    res.json({
      received: req.body,
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
      },
    });
  });
}
