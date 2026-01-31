#!/usr/bin/env node

import { Config } from '@kloudi/shared/config';
import { Logger } from '@kloudi/shared/logger';
import chalk from 'chalk';
import { Command } from 'commander';
import { setupPackageCommands } from './core/command-discovery.js';

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

// Setup commands from all packages (explicit imports, no magic)
await setupPackageCommands(program);

// Add help examples
program.addHelpText(
  'after',
  chalk.gray(`
Examples:
  # Agent commands
  $ kloudi agent list
  $ kloudi agent execute my-agent --request "analyze this"
  $ kloudi agent info my-agent

  # Tool commands (when @kloudi/agent-tools adds CLI)
  $ kloudi tool list
  $ kloudi tool execute scan_files --path=./src

Explicit composition: Packages export setup functions, no magic!
`)
);

// Parse command line arguments
program.parse();
