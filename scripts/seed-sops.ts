/**
 * Seed script — imports SOP graph JSON files into Postgres.
 * Usage: npx tsx scripts/seed-sops.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PrismaManager } from '@kloudi/infrastructure/database/prisma-manager.js';

const SEED_DIR = join(import.meta.dirname, '../data/seed/sops');

async function seed() {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error('Usage: npx tsx scripts/seed-sops.ts <organizationId>');
    process.exit(1);
  }

  const db = PrismaManager.getInstance();
  await db.initialize();
  const client = await db.getClient();
  const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const raw = readFileSync(join(SEED_DIR, file), 'utf-8');
    const data = JSON.parse(raw);
    const { name, slug, description, level, graph, parameters, constraints } =
      data;

    const existing = await (client as any).sop.findFirst({
      where: { slug, organizationId: orgId },
    });

    if (existing) {
      await (client as any).sop.update({
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
      console.log(`Updated: ${slug}`);
    } else {
      await (client as any).sop.create({
        data: {
          slug,
          name,
          description,
          level: level || 'task',
          graph,
          parameters: parameters || {},
          constraints: constraints || {},
          organizationId: orgId,
          maturity: 'draft',
          metadata: data.metadata || {},
        },
      });
      console.log(`Created: ${slug}`);
    }
  }

  console.log(`Seeded ${files.length} SOPs.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
