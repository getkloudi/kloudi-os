import type { Application } from 'express';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('route-loader');

type SetupFunction = (app: Application) => void | Promise<void>;

interface RouteModule {
  setupRoutes?: SetupFunction;
  default?: SetupFunction;
  [key: string]: SetupFunction | undefined;
}

interface LoadedRoute {
  index: number;
}

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
function findMonorepoRoot(): string {
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
function findRouteFiles(pattern: string): string[] {
  const files: string[] = [];

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

  // Wildcard pattern: packages/*/dist/routes/*.js or apps/*/dist/routes/*.js
  const baseDir = parts.slice(0, baseIndex).join('/');
  // Intermediate path segments between the wildcard and the filename glob
  // e.g. for "packages/*/dist/routes/*.js", intermediateParts = ['dist', 'routes']
  const intermediateParts = parts.slice(baseIndex + 1, -1);

  if (!fs.existsSync(baseDir)) return files;

  const subdirs = fs.readdirSync(baseDir).filter((item) => {
    const itemPath = path.join(baseDir, item);
    return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
  });

  for (const subdir of subdirs) {
    const routesDir = path.join(baseDir, subdir, ...intermediateParts);
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
function findSetupFunction(routeModule: RouteModule): SetupFunction | null {
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
    .filter((fn): fn is SetupFunction => typeof fn === 'function');

  return setupFunctions[0] ?? null;
}

/**
 * Load routes matching a glob pattern
 */
async function loadRoutesFromPattern(
  app: Application,
  pattern: string,
  type: string
): Promise<number> {
  const routeFiles = findRouteFiles(pattern);
  let loadedCount = 0;

  for (const filePath of routeFiles) {
    try {
      const routeModule = (await import(`file://${filePath}`)) as RouteModule;
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
      logger.error(
        '❌ Failed to load route file',
        error instanceof Error ? error : null,
        {
          context: 'route-file-error',
          file: path.basename(filePath),
        }
      );
    }
  }

  return loadedCount;
}

/**
 * Load all routes from both domain and API interfaces
 */
export async function loadAllRoutes(app: Application): Promise<LoadedRoute[]> {
  const startTime = performance.now();
  const monorepoRoot = findMonorepoRoot();

  logger.info('🔍 Starting route auto-discovery', {
    context: 'route-discovery-start',
  });

  let routeCount = 0;
  const packagesDir = path.join(monorepoRoot, 'packages');
  const appsDir = path.join(monorepoRoot, 'apps');

  // Load package routes: packages/[package]/dist/routes/*.js (compiled)
  routeCount += await loadRoutesFromPattern(
    app,
    path.join(packagesDir, '*/dist/routes/*.js'),
    'package-routes'
  );

  // Load app routes: apps/[app]/dist/routes/*.js (compiled)
  routeCount += await loadRoutesFromPattern(
    app,
    path.join(appsDir, '*/dist/routes/*.js'),
    'app-routes'
  );

  const loadTime = performance.now() - startTime;

  logger.info('✅ Route auto-discovery completed', {
    context: 'route-discovery-complete',
    totalRoutes: routeCount,
    loadTimeMs: Math.round(loadTime),
  });

  return Array(routeCount)
    .fill(null)
    .map((_, i) => ({ index: i })); // Minimal compatibility
}

/**
 * Get loaded routes info (minimal compatibility method)
 */
export function getLoadedRoutes(): LoadedRoute[] {
  return []; // Simplified - not tracking detailed route info
}

export default loadAllRoutes;
