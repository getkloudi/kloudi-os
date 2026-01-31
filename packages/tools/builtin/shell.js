/**
 * Shell Tools
 *
 * Tools for executing shell commands with timeout and output capture.
 */

import { spawn } from 'child_process';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('tools:shell');

// Default timeout: 30 seconds
const DEFAULT_TIMEOUT = 30000;
// Maximum timeout: 10 minutes
const MAX_TIMEOUT = 600000;
// Maximum output size: 1MB
const MAX_OUTPUT_SIZE = 1024 * 1024;

/**
 * shell.exec - Execute a shell command
 */
export const shellExec = {
  name: 'shell.exec',
  description: 'Execute a shell command and capture output',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command to execute',
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Command arguments (optional, command can include args)',
        default: [],
      },
      cwd: {
        type: 'string',
        description: 'Working directory (defaults to workspace root)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000, max: 600000)',
        default: DEFAULT_TIMEOUT,
      },
      env: {
        type: 'object',
        description: 'Additional environment variables',
        default: {},
      },
      shell: {
        type: 'boolean',
        description: 'Run command in shell (default: true)',
        default: true,
      },
    },
    required: ['command'],
  },

  async execute(params, context = {}) {
    const {
      command,
      args = [],
      cwd,
      timeout = DEFAULT_TIMEOUT,
      env = {},
      shell = true,
    } = params;

    // Validate timeout
    const effectiveTimeout = Math.min(
      Math.max(timeout, 1000),
      MAX_TIMEOUT
    );

    // Determine working directory
    const workingDir = cwd || context.workspaceRoot || process.cwd();

    logger.debug(`Executing command: ${command}`, {
      args,
      cwd: workingDir,
      timeout: effectiveTimeout,
    });

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Build environment
      const processEnv = {
        ...process.env,
        ...env,
      };

      // Spawn the process
      const child = spawn(command, args, {
        cwd: workingDir,
        env: processEnv,
        shell,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, effectiveTimeout);

      // Capture stdout
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length < MAX_OUTPUT_SIZE) {
          stdout += chunk;
        } else if (!stdout.endsWith('[output truncated]')) {
          stdout += '\n[output truncated]';
        }
      });

      // Capture stderr
      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length < MAX_OUTPUT_SIZE) {
          stderr += chunk;
        } else if (!stderr.endsWith('[output truncated]')) {
          stderr += '\n[output truncated]';
        }
      });

      // Handle errors
      child.on('error', (error) => {
        clearTimeout(timeoutId);
        logger.error(`Command failed: ${command}`, error);
        reject(new Error(`Failed to execute command: ${error.message}`));
      });

      // Handle completion
      child.on('close', (exitCode, signal) => {
        clearTimeout(timeoutId);

        const result = {
          command,
          args,
          exitCode,
          signal,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          killed,
          timedOut: killed,
        };

        if (killed) {
          logger.warn(`Command timed out: ${command}`, { timeout: effectiveTimeout });
          result.error = `Command timed out after ${effectiveTimeout}ms`;
        }

        logger.debug(`Command completed: ${command}`, {
          exitCode,
          stdoutLen: stdout.length,
          stderrLen: stderr.length,
        });

        // Resolve regardless of exit code - let caller decide how to handle
        resolve(result);
      });
    });
  },
};

// Export all tools as an array for easy registration
export const shellTools = [shellExec];

export default shellTools;
