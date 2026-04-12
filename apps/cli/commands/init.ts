/**
 * kloudi init
 *
 * Bootstrap a kloudi.os workspace:
 *   1. Push Prisma schema to the target database
 *   2. Seed the 3 default SOPs
 *   3. Optionally configure integrations (Jira, GitHub)
 *   4. Print status and next steps
 */

import { Command } from 'commander';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { config as loadDotenv } from 'dotenv';
import chalk from 'chalk';

const SEED_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../data/seed/procedures'
);

function resolveDbUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];

  // Try loading .env from cwd
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath });
    if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  }

  console.error(
    chalk.red('  DATABASE_URL not found.'),
    chalk.gray('Set it in .env')
  );
  process.exit(1);
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Bootstrap a kloudi.os workspace')
    .option('--skip-seed', 'Skip seeding default SOPs', false)
    .option('--skip-integrations', 'Skip integration setup', false)
    .action(async (opts: {
      skipSeed: boolean;
      skipIntegrations: boolean;
    }) => {
      const dbUrl = resolveDbUrl();

      console.log('');
      console.log(
        chalk.cyan.bold('  kloudi init'),
        chalk.gray('— bootstrapping workspace')
      );
      console.log('');

      // Step 1: Push Prisma schema
      await pushSchema(dbUrl);

      // Step 2: Seed default SOPs
      if (!opts.skipSeed) {
        await seedProcedures(dbUrl);
      } else {
        console.log(chalk.gray('  [skip] SOP seeding'));
      }

      // Step 3: Integration checks
      if (!opts.skipIntegrations) {
        await checkIntegrations();
      } else {
        console.log(chalk.gray('  [skip] Integration checks'));
      }

      // Step 4: Print status
      printNextSteps();
    });
}

async function pushSchema(dbUrl: string): Promise<void> {
  console.log(chalk.blue('  [1/3]'), 'Pushing Prisma schema to database...');

  const schemaPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../schema.prisma'
  );

  try {
    execSync(
      `npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss`,
      {
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: 'pipe',
      }
    );
    console.log(chalk.green('        Schema pushed successfully'));
  } catch (error) {
    const err = error as { stderr?: Buffer };
    const stderr = err.stderr?.toString() || '';
    console.error(chalk.red('        Schema push failed:'));
    console.error(chalk.red(`        ${stderr.split('\n')[0]}`));
    process.exit(1);
  }
}

async function seedProcedures(dbUrl: string): Promise<void> {
  console.log(chalk.blue('  [2/3]'), 'Seeding default SOPs...');

  const { PrismaPg } = await import('@prisma/adapter-pg');

  // Dynamic import handles both CJS and ESM re-exports
  const mod = await import('@prisma/client') as any;
  const PClient = mod.PrismaClient ?? mod.default?.PrismaClient ?? mod.default;
  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma = new PClient({ adapter });

  try {
    await prisma.$connect();

    const files = readdirSync(SEED_DIR).filter((f: string) =>
      f.endsWith('.json')
    );
    const workspaceId = 'default-workspace';

    for (const file of files) {
      const raw = readFileSync(join(SEED_DIR, file), 'utf-8');
      const data = JSON.parse(raw);
      const { name, slug, description, level, graph, parameters, constraints } =
        data;

      const existing = await (prisma as any).procedure.findFirst({
        where: { slug, workspaceId },
      });

      if (existing) {
        await (prisma as any).procedure.update({
          where: { id: existing.id },
          data: {
            name,
            description,
            level,
            graph,
            parameters,
            constraints,
            metadata: data.metadata || {},
          },
        });
        console.log(chalk.green(`        Updated: ${slug}`));
      } else {
        await (prisma as any).procedure.create({
          data: {
            slug,
            name,
            description,
            level: level || 'task',
            graph,
            parameters: parameters || {},
            constraints: constraints || {},
            workspaceId,
            maturity: 'draft',
            metadata: data.metadata || {},
          },
        });
        console.log(chalk.green(`        Created: ${slug}`));
      }
    }

    console.log(
      chalk.green(`        ${files.length} SOPs seeded`)
    );
  } catch (error) {
    const err = error as Error;
    console.error(chalk.red(`        Seed failed: ${err.message}`));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function checkIntegrations(): Promise<void> {
  console.log(chalk.blue('  [3/3]'), 'Checking integrations...');

  // GitHub CLI
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    console.log(chalk.green('        GitHub CLI: authenticated'));
  } catch {
    console.log(
      chalk.yellow('        GitHub CLI: not authenticated'),
      chalk.gray('(run: gh auth login)')
    );
  }

  // Jira token
  if (process.env['JIRA_API_TOKEN']) {
    console.log(chalk.green('        Jira: token configured'));
  } else {
    console.log(
      chalk.yellow('        Jira: no token found'),
      chalk.gray('(set JIRA_API_TOKEN in .env)')
    );
  }
}

function printNextSteps(): void {
  console.log('');
  console.log(chalk.green.bold('  Workspace ready.'));
  console.log('');
  console.log(chalk.white('  Next steps:'));
  console.log(chalk.gray('    1.'), 'pnpm dev:api');
  console.log(chalk.gray('    2.'), 'kloudi ls');
  console.log(chalk.gray('    3.'), 'kloudi run shared-standup');
  console.log(chalk.gray('    4.'), 'kloudi trace <execution-id>');
  console.log('');
}
