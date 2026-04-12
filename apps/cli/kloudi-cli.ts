#!/usr/bin/env node

import { Config } from '@kloudi/shared/config';
import { Logger } from '@kloudi/shared/logger';
import chalk from 'chalk';
import { Command } from 'commander';
import { setupCommands } from './core/command-discovery.js';

// Configuration flow: local.yml → config system → CLI, with verbose flag as runtime override
// Set CLI-friendly logging (only errors) unless user specified otherwise
Logger.setGlobalLogLevel(Config.get('LOG_LEVEL') || 'error');

// Check for global verbose flag before command execution (overrides config)
if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
  Logger.setGlobalLogLevel('info');
}

const program = new Command();

/**
 * Universal Kloudi CLI - Explicit package command composition
 */
program
  .name('kloudi')
  .description('🤖 Universal CLI for Kloudi agents and tools')
  .version('1.0.0')
  .addHelpText(
    'before',
    chalk.cyan(`
╭─────────────────────────────────────────────────╮
│  🤖 Kloudi Universal CLI                       │
│  Explicit package command composition          │
│  For AI-powered development workflows          │
╰─────────────────────────────────────────────────╯
`)
  );

// Register CLI commands
await setupCommands(program);

// Add help examples
program.addHelpText(
  'after',
  chalk.gray(`
Examples:
  $ kloudi init --db-url postgresql://...
  $ kloudi ls
  $ kloudi run shared-standup
  $ kloudi run engineering-impl -p jiraStoryId=PROJ-123
  $ kloudi trace <execution-id>
`)
);

// Parse command line arguments
program.parse();
