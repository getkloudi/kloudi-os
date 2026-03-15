/**
 * CLI Command Composition
 *
 * Clean approach: Import setup functions from packages, no glob magic.
 * Each package exports setupXCommands(program) from its main entry point.
 *
 * Philosophy:
 * - Explicit over magic (no filesystem scanning)
 * - Fast (no I/O)
 * - Obvious (you see what's loaded)
 */

import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('cli-commands');

/**
 * Setup all package commands
 *
 * Agent functionality has been removed as part of architecture simplification.
 * This function remains as a placeholder for future package command integrations.
 */
export async function setupPackageCommands() {
  try {
    logger.info('🔧 Agent package commands removed', {
      context: 'cli-package-commands-removed',
    });

    // Placeholder for future package command integrations
    // Example:
    // const { setupPackageCommands } = await import('@kloudi/some-future-package');
    // setupPackageCommands(program);

    logger.info('Package command setup completed (no packages loaded)');
  } catch (error) {
    logger.error(
      'Failed to setup package commands',
      error instanceof Error ? error : null
    );
    throw error;
  }
}
