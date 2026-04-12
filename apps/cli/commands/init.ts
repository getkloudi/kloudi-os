/**
 * kloudi init
 *
 * Bootstrap a kloudi.os organization:
 *   1. Push Prisma schema to the database
 *   2. Create organization
 *   3. Seed the 3 default SOPs under the org
 *   4. Print status and next steps
 */

import { Command } from 'commander';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
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
    .description('Bootstrap a kloudi.os organization')
    .option('--org-name <name>', 'Organization name')
    .option('--skip-seed', 'Skip seeding default SOPs', false)
    .action(async (opts: {
      orgName?: string;
      skipSeed: boolean;
    }) => {
      const dbUrl = resolveDbUrl();

      console.log('');
      console.log(
        chalk.cyan.bold('  kloudi init'),
        chalk.gray('— bootstrapping organization')
      );
      console.log('');

      // Step 1: Push Prisma schema
      await pushSchema(dbUrl);

      // Step 2: Create organization
      const org = await createOrganization(dbUrl, opts.orgName);

      // Step 3: Seed default SOPs
      if (!opts.skipSeed) {
        await seedProcedures(dbUrl, org.id);
      } else {
        console.log(chalk.gray('  [skip] SOP seeding'));
      }

      // Step 4: Print status
      printNextSteps(org);
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

async function createOrganization(
  dbUrl: string,
  orgName?: string,
): Promise<{ id: string; name: string; slug: string }> {
  console.log(chalk.blue('  [2/3]'), 'Creating organization...');

  const { PrismaPg } = await import('@prisma/adapter-pg');
  const mod = await import('@prisma/client') as any;
  const PClient = mod.PrismaClient ?? mod.default?.PrismaClient ?? mod.default;
  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma = new PClient({ adapter });

  try {
    await prisma.$connect();

    const name = orgName || basename(process.cwd());
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

    // Upsert: find existing or create new
    const existing = await (prisma as any).organization.findFirst({
      where: { slug },
    });

    if (existing) {
      console.log(chalk.green(`        Organization exists: ${existing.name} (${existing.slug})`));
      return { id: existing.id, name: existing.name, slug: existing.slug };
    }

    const org = await (prisma as any).organization.create({
      data: { name, slug },
    });

    console.log(chalk.green(`        Created: ${org.name} (${org.slug})`));
    return { id: org.id, name: org.name, slug: org.slug };
  } catch (error) {
    const err = error as Error;
    console.error(chalk.red(`        Org creation failed: ${err.message}`));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedProcedures(dbUrl: string, organizationId: string): Promise<void> {
  console.log(chalk.blue('  [3/3]'), 'Seeding default SOPs...');

  const { PrismaPg } = await import('@prisma/adapter-pg');
  const mod = await import('@prisma/client') as any;
  const PClient = mod.PrismaClient ?? mod.default?.PrismaClient ?? mod.default;
  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma = new PClient({ adapter });

  try {
    await prisma.$connect();

    const files = readdirSync(SEED_DIR).filter((f: string) =>
      f.endsWith('.json')
    );

    for (const file of files) {
      const raw = readFileSync(join(SEED_DIR, file), 'utf-8');
      const data = JSON.parse(raw);
      const { name, slug, description, level, graph, parameters, constraints } =
        data;

      const existing = await (prisma as any).procedure.findFirst({
        where: { slug, organizationId },
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
            organizationId,
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

function printNextSteps(org: { name: string; slug: string }): void {
  console.log('');
  console.log(chalk.green.bold(`  Organization "${org.name}" ready.`));
  console.log('');
  console.log(chalk.white('  Next steps:'));
  console.log(chalk.gray('    1.'), 'pnpm dev:api');
  console.log(chalk.gray('    2.'), 'kloudi ls');
  console.log(chalk.gray('    3.'), 'kloudi run shared-standup');
  console.log(chalk.gray('    4.'), 'kloudi trace <execution-id>');
  console.log('');
}
