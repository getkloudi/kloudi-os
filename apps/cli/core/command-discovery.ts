/**
 * CLI Command Composition
 *
 * Clean approach: Import setup functions from packages, no glob magic.
 * Each package exports setupXCommands(program) from its main entry point.
 */

import type { Command } from 'commander';

/**
 * Register all CLI commands
 */
export async function setupCommands(program: Command) {
  const { registerInitCommand } = await import('../commands/init.js');
  const { registerImportCommand } = await import('../commands/import.js');
  const { registerRunCommand } = await import('../commands/run.js');
  const { registerLsCommand } = await import('../commands/ls.js');
  const { registerTraceCommand } = await import('../commands/trace.js');

  registerInitCommand(program);
  registerImportCommand(program);
  registerRunCommand(program);
  registerLsCommand(program);
  registerTraceCommand(program);
}
