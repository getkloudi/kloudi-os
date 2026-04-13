/**
 * kloudi trace <execution-id>
 *
 * Fetch an execution trace and render it as a timeline in the terminal.
 */

import { Command } from 'commander';
import { KloudiClient } from '@kloudi/sdk';
import type { ExecutionNodeDetail } from '@kloudi/sdk';
import chalk from 'chalk';

export function registerTraceCommand(program: Command): void {
  program
    .command('trace <execution-id>')
    .description('View execution trace timeline')
    .option('--api-url <url>', 'API base URL', 'http://localhost:3001')
    .action(async (executionId: string, opts: { apiUrl: string }) => {
      const client = new KloudiClient({ baseUrl: opts.apiUrl });

      try {
        const execution = await client.getExecutionWithNodes(executionId);

        console.log('');
        console.log(
          chalk.cyan.bold(`  Trace: ${execution.sop.name}`),
          chalk.gray(`(${execution.sop.slug})`)
        );
        console.log(chalk.gray(`  Execution: ${execution.id}`));
        console.log(chalk.gray(`  Status: `), statusBadge(execution.status));

        if (execution.durationMs) {
          console.log(
            chalk.gray(`  Duration: ${formatDuration(execution.durationMs)}`)
          );
        }
        if (execution.tokensUsed > 0) {
          console.log(
            chalk.gray(`  Tokens: ${execution.tokensUsed.toLocaleString()}`)
          );
        }

        console.log('');
        console.log(chalk.gray('  ' + '─'.repeat(70)));
        console.log('');

        // Render node timeline
        const nodes = execution.executionNodes;
        if (nodes.length === 0) {
          console.log(chalk.gray('  No nodes executed.'));
        } else {
          for (let i = 0; i < nodes.length; i++) {
            renderNode(nodes[i]!, i === nodes.length - 1);
          }
        }

        // Result summary
        if (execution.result) {
          console.log('');
          console.log(chalk.gray('  ' + '─'.repeat(70)));
          console.log(chalk.white.bold('  Result:'));
          console.log(
            chalk.gray(
              '  ' +
                JSON.stringify(execution.result, null, 2)
                  .split('\n')
                  .join('\n  ')
            )
          );
        }

        if (execution.error) {
          console.log('');
          console.log(chalk.red.bold(`  Error: ${execution.error}`));
        }

        console.log('');
      } catch (error) {
        const err = error as Error;
        console.error(chalk.red(`Failed to fetch trace: ${err.message}`));
        process.exit(1);
      }
    });
}

function renderNode(node: ExecutionNodeDetail, isLast: boolean): void {
  const connector = isLast ? '  └─' : '  ├─';
  const pipe = isLast ? '    ' : '  │ ';

  const icon = statusIcon(node.status);
  const duration = node.durationMs ? formatDuration(node.durationMs) : '—';
  const tokens = node.tokensUsed > 0 ? `${node.tokensUsed} tok` : '';

  console.log(
    chalk.gray(connector),
    icon,
    chalk.white(node.nodeId),
    chalk.gray(`[${duration}]`),
    tokens ? chalk.gray(tokens) : ''
  );

  // Show gate context if present
  if (node.gateContext) {
    const gate = node.gateContext as { action?: string };
    if (gate.action) {
      console.log(chalk.gray(pipe), chalk.yellow(`  gate: ${gate.action}`));
    }
  }

  // Show decision trace if present
  if (node.decisionTrace) {
    const trace = node.decisionTrace as { choice?: string; reasoning?: string };
    if (trace.choice) {
      console.log(chalk.gray(pipe), chalk.blue(`  decision: ${trace.choice}`));
    }
  }

  // Show output summary (first 120 chars)
  if (node.output) {
    const summary =
      typeof node.output === 'string'
        ? node.output
        : JSON.stringify(node.output);
    const truncated =
      summary.length > 120 ? summary.slice(0, 120) + '...' : summary;
    console.log(chalk.gray(pipe), chalk.gray(`  ${truncated}`));
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case 'completed':
      return chalk.green('●');
    case 'failed':
      return chalk.red('●');
    case 'running':
      return chalk.yellow('◐');
    case 'waiting_input':
      return chalk.yellow('◌');
    default:
      return chalk.gray('○');
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case 'completed':
      return chalk.green.bold(status);
    case 'failed':
      return chalk.red.bold(status);
    case 'running':
      return chalk.yellow.bold(status);
    case 'waiting_input':
      return chalk.yellow(status);
    case 'cancelled':
      return chalk.gray(status);
    default:
      return chalk.gray(status);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
