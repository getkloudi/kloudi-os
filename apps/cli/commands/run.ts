/**
 * kloudi run <slug> [--params key=value]
 *
 * Runs an SOP via the API, subscribes to execution progress via WebSocket,
 * and prompts the user in the terminal when trust gates fire.
 */

import { Command } from 'commander';
import { KloudiClient } from '@kloudi/sdk';
import WebSocket from 'ws';
import chalk from 'chalk';
import { createInterface } from 'readline';

interface TrustGateMessage {
  type: 'user.ask';
  askId: string;
  question: string;
  options: {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    action: string;
    config: Record<string, unknown>;
    reasoning?: string;
    visitCount: number;
  };
}

interface ProgressMessage {
  type: string;
  executionId: string;
  nodeId?: string;
  name?: string;
  output?: unknown;
  error?: string;
  result?: unknown;
}

export function registerRunCommand(program: Command): void {
  program
    .command('run <slug>')
    .description('Run an SOP with trust-gated execution')
    .option('--api-url <url>', 'API base URL', 'http://localhost:3001')
    .option(
      '-p, --param <key=value>',
      'Execution parameters (repeatable)',
      collectParams,
      {} as Record<string, string>
    )
    .action(
      async (
        slug: string,
        opts: { apiUrl: string; param: Record<string, string> }
      ) => {
        const client = new KloudiClient({ baseUrl: opts.apiUrl });

        // 1. Look up SOP by slug
        let sop: { id: string; name: string; slug: string };
        try {
          sop = await client.getSop(slug);
        } catch {
          console.error(chalk.red(`SOP not found: ${slug}`));
          process.exit(1);
        }

        console.log(
          chalk.cyan(`Running: ${sop.name}`),
          chalk.gray(`(${sop.slug})`)
        );

        // 2. Connect WebSocket before starting execution
        const wsUrl = opts.apiUrl.replace(/^http/, 'ws') + '/ws';
        const ws = new WebSocket(wsUrl);

        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const cleanup = () => {
          rl.close();
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        };

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('WebSocket connection timeout'));
          }, 10000);

          ws.on('open', () => {
            clearTimeout(timeout);
          });

          ws.on('message', (data: Buffer) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'connected') {
              resolve();
            }
          });

          ws.on('error', (err: Error) => {
            clearTimeout(timeout);
            reject(err);
          });
        });

        // 3. Start execution via API
        let executionId: string;
        try {
          const result = await client.runSop(sop.id, {
            input: opts.param,
          });
          executionId = result.executionId;
          console.log(chalk.gray(`Execution started: ${executionId}`));
        } catch (error) {
          const err = error as Error;
          console.error(chalk.red(`Failed to start: ${err.message}`));
          cleanup();
          process.exit(1);
        }

        // 4. Subscribe to execution updates
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            payload: { executionId },
          })
        );

        // 5. Listen for events
        await new Promise<void>((resolve) => {
          ws.on('message', (data: Buffer) => {
            const msg = JSON.parse(data.toString()) as
              | TrustGateMessage
              | ProgressMessage;

            switch (msg.type) {
              case 'execution.progress':
                handleProgress(msg as ProgressMessage);
                break;

              case 'execution.complete':
                handleComplete(msg as ProgressMessage);
                cleanup();
                resolve();
                break;

              case 'user.ask':
                handleTrustGate(msg as TrustGateMessage, ws, rl);
                break;

              default:
                break;
            }
          });

          ws.on('close', () => {
            resolve();
          });
        });
      }
    );
}

function handleProgress(msg: ProgressMessage): void {
  const progressType = msg.type;

  if ('nodeId' in msg && msg.nodeId) {
    switch (progressType) {
      case 'execution.progress': {
        const inner = msg as ProgressMessage & { type: string };
        if (inner.name) {
          console.log(
            chalk.blue('  [node]'),
            chalk.white(inner.name),
            chalk.gray(`(${inner.nodeId})`)
          );
        }
        if (inner.error) {
          console.log(chalk.red(`  [failed] ${inner.error}`));
        }
        break;
      }
    }
  }

  if (msg.error) {
    console.log(chalk.red(`  [error] ${msg.error}`));
  }
}

function handleComplete(msg: ProgressMessage): void {
  console.log('');
  if (msg.result) {
    console.log(chalk.green('Execution completed.'));
    console.log(chalk.gray(JSON.stringify(msg.result, null, 2)));
  } else {
    console.log(chalk.green('Execution completed.'));
  }
}

function handleTrustGate(
  msg: TrustGateMessage,
  ws: WebSocket,
  rl: ReturnType<typeof createInterface>
): void {
  const { askId, options } = msg;

  console.log('');
  console.log(chalk.yellow('━'.repeat(60)));
  console.log(chalk.yellow.bold('  TRUST GATE — Approval Required'));
  console.log(chalk.yellow('━'.repeat(60)));
  console.log(chalk.white(`  Node:   ${options.nodeName}`));
  console.log(chalk.white(`  Type:   ${options.nodeType}`));
  console.log(chalk.white(`  Action: ${options.action}`));

  if (options.reasoning) {
    console.log(chalk.gray(`  Reasoning: ${options.reasoning}`));
  }

  if (options.config && Object.keys(options.config).length > 0) {
    console.log(chalk.gray('  Config:'));
    for (const [key, value] of Object.entries(options.config)) {
      const display = typeof value === 'string' ? value : JSON.stringify(value);
      console.log(chalk.gray(`    ${key}: ${display}`));
    }
  }

  console.log(chalk.yellow('━'.repeat(60)));

  rl.question(chalk.yellow.bold('  Approve? (y/n): '), (answer: string) => {
    const approved = answer.trim().toLowerCase() === 'y';
    ws.send(
      JSON.stringify({
        type: 'user.ask.response',
        payload: {
          askId,
          response: approved ? 'approve' : 'reject',
        },
      })
    );

    if (approved) {
      console.log(chalk.green('  Approved. Continuing...'));
    } else {
      console.log(chalk.red('  Rejected. Aborting execution.'));
    }
    console.log('');
  });
}

function collectParams(
  value: string,
  previous: Record<string, string>
): Record<string, string> {
  const [key, ...rest] = value.split('=');
  if (key) {
    previous[key] = rest.join('=');
  }
  return previous;
}
