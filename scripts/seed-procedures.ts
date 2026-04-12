/**
 * Seed script — imports procedure graph JSON files into Postgres.
 * Usage: npx tsx scripts/seed-procedures.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PrismaManager } from '@kloudi/infrastructure/database/prisma-manager.js';

const SEED_DIR = join(import.meta.dirname, '../data/seed/procedures');
const WORKSPACE_ID = 'default-workspace';

async function seed() {
  const db = PrismaManager.getInstance();
  await db.initialize();
  const client = db.getClient();
  const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const raw = readFileSync(join(SEED_DIR, file), 'utf-8');
    const data = JSON.parse(raw);
    const { name, slug, description, level, graph, parameters, constraints } =
      data;

    const existing = await (client as any).procedure.findFirst({
      where: { slug, workspaceId: WORKSPACE_ID },
    });

    if (existing) {
      await (client as any).procedure.update({
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
      await (client as any).procedure.create({
        data: {
          slug,
          name,
          description,
          level: level || 'task',
          graph,
          parameters: parameters || {},
          constraints: constraints || {},
          workspaceId: WORKSPACE_ID,
          maturity: 'draft',
          metadata: data.metadata || {},
        },
      });
      console.log(`Created: ${slug}`);
    }
  }

  console.log(`Seeded ${files.length} procedures.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
