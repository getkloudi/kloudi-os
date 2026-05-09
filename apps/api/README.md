# API Server Architecture

A production-ready Express API server with clean functional architecture, auto-discovery routing, and comprehensive infrastructure integration.

## Quick Start

### Running the Server

```bash
# Development mode (with auto-reload)
pnpm dev:api

# Production mode
pnpm start:api

# Server runs on http://localhost:3001
# Health check: http://localhost:3001/health
```

### Adding Your First Route

```bash
# Create a new route file
touch apps/api/routes/users.routes.js
```

```javascript
// apps/api/routes/users.routes.js
export function setupRoutes(app) {
  app.get('/users', (req, res) => {
    res.json({ users: [] });
  });

  app.post('/users', (req, res) => {
    res.json({ message: 'User created', user: req.body });
  });
}
```

Routes are automatically discovered and loaded on server restart. No manual registration needed.

## Architecture Overview

### Core Principles

- **Functional over Class-based**: Standalone functions instead of DDD classes
- **Simplicity First**: Direct, readable code without excessive abstraction
- **Auto-Discovery**: Routes automatically loaded from standardized locations
- **Production-Ready**: Graceful shutdown, error handling, health checks built-in

### File Structure

```
apps/api/
├── index.js                    # Production entry point with graceful shutdown
├── lib/                        # Core server functionality
│   ├── middleware.js          # setupMiddleware(), setupErrorHandling()
│   ├── route-loader.js        # loadAllRoutes() - auto-discovery engine
│   └── health-endpoint.js     # createHealthEndpoint() - health checks
├── routes/                     # App-specific routes (auto-discovered)
│   └── *.routes.js            # Route files (e.g., users.routes.js)
└── package.json

packages/[package]/
└── routes/                     # Package routes (auto-discovered)
    └── *.routes.js            # Reusable package routes
```

### Server Startup Flow

```javascript
// index.js orchestrates the startup sequence:

1. Initialize infrastructure (database, cache, auth, events)
2. Setup middleware (CORS, security headers, logging)
3. Register health endpoint (/health)
4. Auto-discover and load all routes
5. Setup error handling (404 + global error handler)
6. Start HTTP server with graceful shutdown handlers
```

## Adding Routes

### Route Auto-Discovery

Routes are automatically discovered from these locations:

1. **App Routes**: `apps/*/routes/*.routes.js`
2. **Package Routes**: `packages/*/routes/*.routes.js`

### Route File Convention

**File Naming**: Use `*.routes.js` pattern (e.g., `user.routes.js`, `auth.routes.js`)

**Export Pattern**: Export a `setupRoutes` function

```javascript
// apps/api/routes/products.routes.js
export function setupRoutes(app) {
  app.get('/products', async (req, res) => {
    // Your logic here
    res.json({ products: [] });
  });

  app.post('/products', async (req, res) => {
    // Your logic here
    res.json({ message: 'Product created' });
  });

  app.get('/products/:id', async (req, res) => {
    // Your logic here
    res.json({ product: { id: req.params.id } });
  });
}
```

### Alternative Export Patterns (Legacy Support)

```javascript
// Option 1: Named function (recommended)
export function setupRoutes(app) { ... }

// Option 2: Default export
export default function(app) { ... }

// Option 3: Legacy pattern (still supported)
export function setupProductRoutes(app) { ... }
```

### Package Routes Example

```javascript
// packages/auth/routes/auth.routes.js
export function setupRoutes(app) {
  app.post('/auth/login', async (req, res) => {
    // Authentication logic
    res.json({ token: 'abc123' });
  });

  app.post('/auth/logout', async (req, res) => {
    // Logout logic
    res.json({ message: 'Logged out' });
  });
}
```

Package routes are automatically available when the package is installed in the monorepo.

## Adding Middleware

### Modifying Middleware

Edit `/Users/nitish/tmp/boilerplate/js-monorepo-boilerplate/apps/api/lib/middleware.js`:

```javascript
// lib/middleware.js

export async function setupMiddleware(app) {
  // ... existing middleware ...

  // Add your custom middleware here
  app.use('/admin/*', (req, res, next) => {
    // Admin authentication
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  // Path-specific middleware
  app.use('/api/v2/*', (req, res, next) => {
    res.setHeader('X-API-Version', '2.0');
    next();
  });
}
```

### Built-in Middleware

The server includes:

- **JSON/URL Encoding**: Express built-in parsers (10MB limit)
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **CORS**: Configurable via environment or YAML config
- **Request Logging**: Automatic HTTP request/response logging
- **Error Handling**: 404 handler + global error handler

### CORS Configuration

**Via Environment Variables** (takes precedence):

```bash
CORS_ALLOWED_ORIGINS=https://myapp.com,https://admin.myapp.com
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_ALLOWED_HEADERS=Content-Type,Authorization
CORS_ALLOW_CREDENTIALS=true
```

**Via YAML Config**:

```yaml
# packages/shared/config/production.yml
cors:
  allowedOrigins: 'https://myapp.com,https://admin.myapp.com'
  allowedMethods: 'GET,POST,PUT,DELETE,OPTIONS'
  allowedHeaders: 'Content-Type,Authorization'
  allowCredentials: true
```

**Environment Defaults**:

- **Development**: Localhost ports + wildcard (permissive)
- **Test**: Localhost:3000 only
- **Production**: Localhost:3000 only (warns if not configured)

## Production Features

### Graceful Shutdown

The server handles shutdown signals properly:

```javascript
// Handles:
- SIGTERM (process manager shutdown)
- SIGINT (Ctrl+C in terminal)
- SIGUSR2 (nodemon restart)

// Behavior:
1. Stops accepting new connections
2. Finishes existing requests (10s timeout)
3. Closes server cleanly
4. Exits process
```

### Infrastructure Initialization

Automatically initializes on startup:

- **Database**: Connection pooling and health checks
- **Cache**: Redis/in-memory cache
- **Auth**: JWT token management
- **Events**: Event bus for async operations

### Health Check Endpoint

**URL**: `GET /health`

**Response** (healthy):

```json
{
  "status": "healthy",
  "timestamp": "2026-01-06T12:00:00.000Z",
  "version": "1.0.0",
  "nodeVersion": "v20.0.0",
  "memory": {
    "rss": 100.5,
    "heapTotal": 50.2,
    "heapUsed": 30.1,
    "external": 5.3
  },
  "pid": 12345,
  "uptime": 3600,
  "port": 3001,
  "environment": "production",
  "components": {
    "database": { "status": "healthy", "timestamp": "..." },
    "cache": { "status": "healthy", "timestamp": "..." },
    "auth": { "status": "healthy", "timestamp": "..." },
    "events": { "status": "healthy", "timestamp": "..." }
  }
}
```

**Status Codes**:

- `200`: All components healthy
- `503`: One or more components unhealthy/degraded
- `500`: Health check failed

### Error Handling

**404 Handler**: Returns structured JSON for unknown routes

```json
{
  "error": "Not Found",
  "message": "Route GET /unknown not found",
  "timestamp": "2026-01-06T12:00:00.000Z"
}
```

**Global Error Handler**: Catches unhandled errors

```json
{
  "error": "Internal Server Error",
  "message": "Something went wrong",
  "timestamp": "2026-01-06T12:00:00.000Z"
}
```

In development mode, includes full error messages for debugging.

### Server Startup Error Handling

**Port Already in Use** (EADDRINUSE):

```bash
# Clear message with error code
❌ Port 3001 is already in use
```

**Promise-based Startup**: Clean async/await pattern prevents race conditions

## Development Workflow

### Creating a New Feature

```bash
# 1. Create route file
touch apps/api/routes/analytics.routes.js

# 2. Add your routes
cat > apps/api/routes/analytics.routes.js << 'EOF'
export function setupRoutes(app) {
  app.get('/analytics/dashboard', async (req, res) => {
    res.json({ views: 1000, clicks: 250 });
  });
}
EOF

# 3. Server auto-reloads in dev mode
# Routes are immediately available at /analytics/dashboard
```

### Testing Routes

```bash
# Simple GET request
curl http://localhost:3001/ping

# POST with JSON body
curl -X POST http://localhost:3001/echo \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Check health
curl http://localhost:3001/health | jq .
```

### Adding Package-Level Routes

```bash
# 1. Create routes in your package
mkdir -p packages/notifications/routes
touch packages/notifications/routes/notifications.routes.js

# 2. Export setup function
cat > packages/notifications/routes/notifications.routes.js << 'EOF'
export function setupRoutes(app) {
  app.get('/notifications', async (req, res) => {
    res.json({ notifications: [] });
  });

  app.post('/notifications/send', async (req, res) => {
    res.json({ sent: true });
  });
}
EOF

# 3. Routes automatically discovered and loaded
# Available at /notifications and /notifications/send
```

## Advanced Patterns

### Route Grouping with Express Router

```javascript
// apps/api/routes/admin.routes.js
import express from 'express';

export function setupRoutes(app) {
  const router = express.Router();

  // Admin middleware for all routes
  router.use((req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  // Admin routes
  router.get('/users', (req, res) => res.json({ users: [] }));
  router.get('/settings', (req, res) => res.json({ settings: {} }));
  router.post('/config', (req, res) => res.json({ updated: true }));

  // Mount all admin routes under /admin
  app.use('/admin', router);
}
```

### Async Error Handling

```javascript
// apps/api/routes/data.routes.js
export function setupRoutes(app) {
  app.get('/data/:id', async (req, res, next) => {
    try {
      const data = await fetchDataFromDatabase(req.params.id);
      res.json({ data });
    } catch (error) {
      // Error caught by global error handler
      next(error);
    }
  });
}
```

### Request Validation

```javascript
// apps/api/routes/users.routes.js
export function setupRoutes(app) {
  app.post('/users', async (req, res) => {
    const { email, password } = req.body;

    // Validation
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password too short' });
    }

    // Process valid request
    res.json({ message: 'User created', email });
  });
}
```

## Architecture Decisions

### Why Functional over Class-based?

**Before (DDD Classes)**:

```javascript
// Old: capabilities/middleware.js
export class Middleware {
  setupMiddleware(app) { ... }
}

// Old: infrastructure/route-loader.js
export class RouteLoader {
  async loadRoutes(app) { ... }
}
```

**After (Functional)**:

```javascript
// New: lib/middleware.js
export async function setupMiddleware(app) { ... }

// New: lib/route-loader.js
export async function loadAllRoutes(app) { ... }
```

**Benefits**:

- Less boilerplate (no class instantiation)
- Easier to understand and modify
- Direct function calls (no adapter pattern needed)
- Better for simple HTTP server logic

### Why Auto-Discovery?

**Manual Registration** (old):

```javascript
// Had to import and register each route file manually
import { setupUserRoutes } from './interface/user-routes.js';
setupUserRoutes(app);
```

**Auto-Discovery** (new):

```javascript
// Just create *.routes.js files - they're automatically loaded
await loadAllRoutes(app);
```

**Benefits**:

- Zero configuration for new routes
- Consistent route file naming
- Works across packages and apps
- Reduces coupling between files

### Why lib/ Instead of DDD Folders?

**DDD Structure** (old):

```
core/server.js          # Entity
application/start-server.js  # Use case
capabilities/middleware.js   # Service
infrastructure/route-loader.js  # Implementation
interface/routes.js      # Interface adapter
```

**Functional Structure** (new):

```
index.js                # Entry point
lib/middleware.js       # Middleware functions
lib/route-loader.js     # Route loading functions
lib/health-endpoint.js  # Health check function
routes/*.routes.js      # Route definitions
```

**Benefits**:

- Flatter structure (easier navigation)
- Purpose-based naming (middleware vs. capabilities)
- Less cognitive overhead
- More maintainable for small teams

## Migration Guide

### If You're Updating from Old Architecture

**Old Route Location** → **New Route Location**

```
interface/*.js → routes/*.routes.js
```

**Old Pattern** → **New Pattern**

```javascript
// OLD: interface/user-routes.js
export function setupUserRoutes(app) { ... }

// NEW: routes/users.routes.js
export function setupRoutes(app) { ... }
```

**Old Infrastructure References** → **New Lib References**

```javascript
// OLD
import { Middleware } from './capabilities/middleware.js';
const middleware = new Middleware();
await middleware.setupMiddleware(app);

// NEW
import { setupMiddleware } from './lib/middleware.js';
await setupMiddleware(app);
```

## Troubleshooting

### Routes Not Loading

**Check route file naming**:

```bash
# Correct
apps/api/routes/users.routes.js

# Incorrect (won't be discovered)
apps/api/routes/users.js
apps/api/interface/users.routes.js
```

**Check export pattern**:

```javascript
// Correct
export function setupRoutes(app) { ... }

// Incorrect (won't be found)
export const routes = (app) => { ... };
function setupRoutes(app) { ... }  // Not exported
```

**Check logs**:

```bash
# Look for route discovery logs
pnpm dev:api

# Should see:
# 🔍 Starting route auto-discovery
# ✅ Route setup function executed
# ✅ Route auto-discovery completed
```

### Port Already in Use

```bash
# Find process using port 3001
lsof -ti:3001

# Kill the process
kill -9 $(lsof -ti:3001)

# Or use different port
PORT=3002 pnpm dev:api
```

### CORS Issues

```bash
# Check CORS configuration in logs
# Look for: "Setting up middleware stack"

# Set allowed origins explicitly
export CORS_ALLOWED_ORIGINS=http://localhost:3000
pnpm dev:api
```

### Health Check Failures

```bash
# Check component health
curl http://localhost:3001/health | jq .components

# Look for unhealthy components:
# - database: Check DATABASE_URL
# - cache: Check Redis connection
# - auth: Check JWT_SECRET
# - events: Check EventBus configuration
```

## Best Practices

### Route Organization

```
routes/
├── users.routes.js      # User CRUD operations
├── auth.routes.js       # Authentication endpoints
├── admin.routes.js      # Admin panel routes
└── analytics.routes.js  # Analytics endpoints
```

### Middleware Organization

```javascript
// lib/middleware.js - Group by purpose

export async function setupMiddleware(app) {
  // 1. Request parsing
  app.use(express.json());

  // 2. Security headers
  app.use((req, res, next) => { ... });

  // 3. CORS
  app.use((req, res, next) => { ... });

  // 4. Logging
  app.use((req, res, next) => { ... });

  // 5. Custom middleware
  app.use('/admin/*', adminAuth);
}
```

### Error Handling

```javascript
// Always use try/catch for async routes
app.get('/data', async (req, res, next) => {
  try {
    const data = await fetchData();
    res.json({ data });
  } catch (error) {
    next(error); // Let global handler manage it
  }
});
```

### Logging

```javascript
import { Logger } from '@kloudi-os/shared/logger';

const logger = Logger.getInstance('users');

export function setupRoutes(app) {
  app.post('/users', async (req, res) => {
    logger.info('Creating user', { email: req.body.email });

    try {
      // ... create user ...
      logger.info('User created successfully', { userId: user.id });
      res.json({ user });
    } catch (error) {
      logger.error('User creation failed', error);
      throw error;
    }
  });
}
```

---

**Goal**: Keep the API server simple, production-ready, and easy to extend. Focus on clarity over complexity.
