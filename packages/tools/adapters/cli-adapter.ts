/**
 * CLI Tool Adapter
 *
 * Wraps CLI commands as ToolRegistry entries.
 * Maps tool names to shell commands with parameter substitution.
 */

import { execFile } from 'node:child_process';
import { Logger } from '@kloudi/shared/logger';
import type { ToolRegistry } from '../registry.js';
import type { ToolContext, ToolParameters } from '@kloudi/shared/types';

const logger = Logger.getInstance('tools:cli-adapter');

/** Default timeout for CLI commands in milliseconds */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Definition for a CLI-based tool
 */
export interface CLIToolDefinition {
  /** Tool name (e.g. 'github.createPR') */
  name: string;
  /** Description of what the tool does */
  description?: string;
  /** The command to execute (e.g. 'gh', 'git') */
  command: string;
  /** Function that builds args from the tool params */
  args: (params: Record<string, unknown>) => string[];
  /** Optional function to parse stdout into structured data */
  parseOutput?: (stdout: string) => unknown;
  /** Optional parameter schema for the tool */
  parameters?: ToolParameters;
  /** Optional timeout in ms (default: 30000) */
  timeout?: number;
  /** Optional environment variables for the command */
  env?: Record<string, string>;
}

/**
 * Result from a CLI tool execution
 */
interface CLIToolResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  parsed?: unknown;
}

/**
 * Register a single CLI tool in the registry.
 */
export function registerCLITool(
  registry: ToolRegistry,
  definition: CLIToolDefinition
): void {
  const {
    name,
    description = '',
    command,
    args,
    parseOutput,
    parameters = {},
    timeout = DEFAULT_TIMEOUT_MS,
    env,
  } = definition;

  registry.register({
    name,
    description,
    parameters,
    execute: async (
      params: Record<string, unknown>,
      _context: ToolContext
    ): Promise<unknown> => {
      return executeCLITool(
        name,
        command,
        args(params),
        parseOutput,
        timeout,
        env
      );
    },
  });

  logger.debug(`Registered CLI tool: ${name}`);
}

/**
 * Register multiple CLI tools in the registry.
 */
export function registerCLITools(
  registry: ToolRegistry,
  definitions: CLIToolDefinition[]
): void {
  for (const definition of definitions) {
    registerCLITool(registry, definition);
  }

  logger.info(`Registered ${definitions.length} CLI tools`);
}

/**
 * Execute a CLI command and return the result.
 */
function executeCLITool(
  toolName: string,
  command: string,
  args: string[],
  parseOutput: ((stdout: string) => unknown) | undefined,
  timeout: number,
  env?: Record<string, string>
): Promise<unknown> {
  const timer = logger.time(`cli:${toolName}`);

  return new Promise((resolve, reject) => {
    const childEnv = env ? { ...process.env, ...env } : process.env;

    const child = execFile(
      command,
      args,
      {
        timeout,
        env: childEnv as NodeJS.ProcessEnv,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      },
      (error, stdout, stderr) => {
        if (error) {
          timer.end({ success: false, error: error.message });

          // Provide specific error messages
          const nodeError = error as NodeJS.ErrnoException;
          if (nodeError.code === 'ENOENT') {
            reject(
              new Error(
                `CLI tool "${toolName}": command "${command}" not found. ` +
                  'Ensure it is installed and in PATH.'
              )
            );
            return;
          }

          if ('killed' in nodeError && nodeError.killed) {
            reject(
              new Error(
                `CLI tool "${toolName}": command timed out after ${timeout}ms`
              )
            );
            return;
          }

          // Non-zero exit code
          const exitCode =
            'code' in error && typeof error.code === 'number' ? error.code : 1;
          const result: CLIToolResult = {
            stdout: stdout ?? '',
            stderr: stderr ?? '',
            exitCode,
          };

          reject(
            new Error(
              `CLI tool "${toolName}" failed (exit ${exitCode}): ${stderr || stdout || error.message}`,
              { cause: result }
            )
          );
          return;
        }

        timer.end({ success: true });

        // Parse output if a parser is provided
        if (parseOutput) {
          try {
            const parsed = parseOutput(stdout);
            resolve(parsed);
          } catch (parseError) {
            const message =
              parseError instanceof Error
                ? parseError.message
                : String(parseError);
            reject(
              new Error(
                `CLI tool "${toolName}": failed to parse output: ${message}`
              )
            );
          }
          return;
        }

        // Default: return stdout trimmed
        resolve(stdout.trim());
      }
    );

    child.on('error', (error) => {
      timer.end({ success: false, error: error.message });
      reject(
        new Error(`CLI tool "${toolName}": execution error: ${error.message}`)
      );
    });
  });
}
