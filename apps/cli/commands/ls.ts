/**
 * kloudi ls
 *
 * List all procedures in the workspace.
 */

import { Command } from 'commander';
import { KloudiClient } from '@kloudi/sdk';
import chalk from 'chalk';

export function registerLsCommand(program: Command): void {
  program
    .command('ls')
    .description('List procedures in the workspace')
    .option('--api-url <url>', 'API base URL', 'http://localhost:3001')
    .option('--level <level>', 'Filter by level (guide, project, task, skill)')
    .action(async (opts: { apiUrl: string; level?: string }) => {
      const client = new KloudiClient({ baseUrl: opts.apiUrl });

      try {
        const procedures = await client.listProcedures(
          opts.level ? { level: opts.level } : undefined
        );

        if (procedures.length === 0) {
          console.log(
            chalk.gray('No procedures found. Run kloudi init first.')
          );
          return;
        }

        console.log('');
        console.log(chalk.cyan.bold(`  ${procedures.length} procedures`));
        console.log('');

        // Column headers
        console.log(
          chalk.gray('  SLUG'.padEnd(28)),
          chalk.gray('LEVEL'.padEnd(10)),
          chalk.gray('MATURITY'.padEnd(12)),
          chalk.gray('NAME')
        );
        console.log(chalk.gray('  ' + '─'.repeat(70)));

        for (const proc of procedures) {
          const levelColor =
            proc.level === 'guide'
              ? chalk.magenta
              : proc.level === 'project'
                ? chalk.blue
                : chalk.white;

          const maturityColor =
            proc.maturity === 'validated'
              ? chalk.green
              : proc.maturity === 'curated'
                ? chalk.yellow
                : chalk.gray;

          console.log(
            chalk.white(`  ${proc.slug.padEnd(26)}`),
            levelColor(`${proc.level.padEnd(8)}`),
            maturityColor(`${proc.maturity.padEnd(10)}`),
            chalk.gray(proc.name)
          );
        }

        console.log('');
      } catch (error) {
        const err = error as Error;
        console.error(chalk.red(`Failed to list procedures: ${err.message}`));
        process.exit(1);
      }
    });
}
