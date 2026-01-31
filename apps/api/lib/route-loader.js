import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('route-loader');

/**
 * Simplified Route Auto-Discovery System
 *
 * Scans for route files and calls their setupRoutes() functions.
 * Supports two locations:
 * 1. Package routes: packages/[package]/routes/*.js (reusable routes exported by packages)
 * 2. App routes: apps/[app]/routes/*.js (app-specific routes)
 *
 * Naming convention: Use *.routes.js (e.g., user.routes.js, auth.routes.js)
 */

/**
 * Find monorepo root by looking for pnpm-workspace.yaml
 */
function findMonorepoRoot() {
  let currentDir = process.cwd();
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return process.cwd();
}

/**
 * Find route files using simple directory scanning (no external glob dependency)
 */
function findRouteFiles(pattern) {
  const files = [];

  // Extract directory patterns: apps/*/routes/*.js -> apps/*/routes/
  const parts = pattern.split('/');
  const baseIndex = parts.findIndex((part) => part.includes('*'));

  if (baseIndex === -1) {
    // No wildcard, direct pattern: apps/api/routes/*.js
    const dir = parts.slice(0, -1).join('/');
    if (fs.existsSync(dir)) {
      const dirFiles = fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.js') && !file.startsWith('.'))
        .map((file) => path.join(dir, file));
      files.push(...dirFiles);
    }
    return files;
  }

  // Wildcard pattern: apps/*/routes/*.js or packages/*/routes/*.js
  const baseDir = parts.slice(0, baseIndex).join('/');

  if (!fs.existsSync(baseDir)) return files;

  const subdirs = fs.readdirSync(baseDir).filter((item) => {
    const itemPath = path.join(baseDir, item);
    return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
  });

  for (const subdir of subdirs) {
    const routesDir = path.join(baseDir, subdir, 'routes');
    if (fs.existsSync(routesDir)) {
      const routeFiles = fs
        .readdirSync(routesDir)
        .filter((file) => file.endsWith('.js') && !file.startsWith('.'))
        .map((file) => path.join(routesDir, file));
      files.push(...routeFiles);
    }
  }

  return files;
}

/**
 * Find the setup function in a route module
 * Convention: setupRoutes(app) function (export or default)
 */
function findSetupFunction(routeModule) {
  // 1. Look for setupRoutes export
  if (typeof routeModule.setupRoutes === 'function') {
    return routeModule.setupRoutes;
  }

  // 2. Look for default export function
  if (typeof routeModule.default === 'function') {
    return routeModule.default;
  }

  // 3. Look for any setup*Routes pattern (legacy compatibility)
  const setupFunctions = Object.keys(routeModule)
    .filter((key) => key.startsWith('setup') && key.endsWith('Routes'))
    .map((key) => routeModule[key])
    .filter((fn) => typeof fn === 'function');

  return setupFunctions[0] || null;
}

/**
 * Load routes matching a glob pattern
 */
async function loadRoutesFromPattern(app, pattern, type) {
  const routeFiles = findRouteFiles(pattern);
  let loadedCount = 0;

  for (const filePath of routeFiles) {
    try {
      const routeModule = await import(`file://${filePath}`);
      const setupFunction = findSetupFunction(routeModule);

      if (setupFunction) {
        await setupFunction(app);
        loadedCount++;

        logger.info('✅ Route setup function executed', {
          context: 'route-setup-success',
          file: path.basename(filePath),
          type,
          path: filePath,
        });
      } else {
        logger.warn('No setupRoutes function found', {
          context: 'route-setup-missing',
          file: path.basename(filePath),
          exports: Object.keys(routeModule),
        });
      }
    } catch (error) {
      logger.error('❌ Failed to load route file', error, {
        context: 'route-file-error',
        file: path.basename(filePath),
      });
    }
  }

  return loadedCount;
}

/**
 * Load all routes from both domain and API interfaces
 */
export async function loadAllRoutes(app) {
  const startTime = performance.now();
  const monorepoRoot = findMonorepoRoot();

  logger.info('🔍 Starting route auto-discovery', {
    context: 'route-discovery-start',
  });

  let routeCount = 0;
  const packagesDir = path.join(monorepoRoot, 'packages');
  const appsDir = path.join(monorepoRoot, 'apps');

  // Load package routes: packages/[package]/routes/*.js
  routeCount += await loadRoutesFromPattern(
    app,
    path.join(packagesDir, '*/routes/*.js'),
    'package-routes'
  );

  // Load app routes: apps/[app]/routes/*.js
  routeCount += await loadRoutesFromPattern(
    app,
    path.join(appsDir, '*/routes/*.js'),
    'app-routes'
  );

  const loadTime = performance.now() - startTime;

  logger.info('✅ Route auto-discovery completed', {
    context: 'route-discovery-complete',
    totalRoutes: routeCount,
    loadTimeMs: Math.round(loadTime),
  });

  return Array(routeCount)
    .fill()
    .map((_, i) => ({ index: i })); // Minimal compatibility
}

/**
 * Get loaded routes info (minimal compatibility method)
 */
export function getLoadedRoutes() {
  return []; // Simplified - not tracking detailed route info
}

export default loadAllRoutes;
