/**
 * kloudi import <file.json>
 *
 * Imports an SOP graph JSON file into Postgres via the API.
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { KloudiClient } from '@kloudi-os/sdk';
import chalk from 'chalk';

export function registerImportCommand(program: Command): void {
  program
    .command('import <file>')
    .description('Import an SOP graph JSON file')
    .option('--api-url <url>', 'API base URL', 'http://localhost:3001')
    .action(async (file: string, opts: { apiUrl: string }) => {
      try {
        const raw = readFileSync(file, 'utf-8');
        const data = JSON.parse(raw) as {
          name: string;
          slug: string;
          description?: string;
          level?: string;
          graph: unknown;
          parameters?: unknown;
          constraints?: unknown;
          metadata?: unknown;
        };

        if (!data.name || !data.slug || !data.graph) {
          console.error(
            chalk.red('Invalid SOP JSON: requires name, slug, and graph')
          );
          process.exit(1);
        }

        const client = new KloudiClient({ baseUrl: opts.apiUrl });

        const result = await client.createSop({
          name: data.name,
          slug: data.slug,
          description: data.description ?? '',
          level: data.level ?? 'task',
          graph: data.graph,
          parameters: data.parameters ?? {},
          constraints: data.constraints ?? {},
          metadata: data.metadata ?? {},
        });

        console.log(
          chalk.green(`Imported: ${data.name} (${data.slug})`),
          chalk.gray(`id=${result.id}`)
        );
      } catch (error) {
        const err = error as Error;
        console.error(chalk.red(`Import failed: ${err.message}`));
        process.exit(1);
      }
    });
}
