import { Command } from 'commander';
import { KloudiClient } from '@kloudi-os/sdk';
import { loadToken } from '../lib/token.js';
import chalk from 'chalk';

export function registerLsCommand(program: Command): void {
  program
    .command('ls')
    .description('List SOPs in the workspace')
    .option('--api-url <url>', 'API base URL', 'http://localhost:3001')
    .option('--level <level>', 'Filter by level (guide, project, task, skill)')
    .action(async (opts: { apiUrl: string; level?: string }) => {
      const token = loadToken();
      const client = new KloudiClient({
        baseUrl: opts.apiUrl,
        ...(token ? { token } : {}),
      });

      try {
        const sops = await client.listSops(
          opts.level ? { level: opts.level } : undefined
        );

        if (sops.length === 0) {
          console.log(chalk.gray('No SOPs found. Run kloudi init first.'));
          return;
        }

        console.log('');
        console.log(chalk.cyan.bold(`  ${sops.length} SOPs`));
        console.log('');

        console.log(
          chalk.gray('  SLUG'.padEnd(28)),
          chalk.gray('LEVEL'.padEnd(10)),
          chalk.gray('MATURITY'.padEnd(12)),
          chalk.gray('NAME')
        );
        console.log(chalk.gray('  ' + '─'.repeat(70)));

        for (const proc of sops) {
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
        console.error(chalk.red(`Failed to list SOPs: ${err.message}`));
        process.exit(1);
      }
    });
}
