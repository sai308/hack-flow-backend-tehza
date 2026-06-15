/**
 * Cleanup script: removes duplicate projects for the same team.
 * Keeps the LATEST submitted project per team; soft-deletes (or hard-deletes) the rest.
 * Run once after deploying the one-project-per-team guard.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { projects } from '../drizzle/schema';
import { eq, isNull, and, sql } from 'drizzle-orm';
import { env } from '../config/env';

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  console.log('🔍 Finding duplicate projects per team...');

  // Find teams that have more than one active project
  const rows = await db
    .select({
      teamId: projects.teamId,
      count: sql<number>`count(*)::int`,
    })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .groupBy(projects.teamId)
    .having(sql`count(*) > 1`);

  console.log(`Found ${rows.length} teams with duplicate projects`);

  for (const { teamId } of rows) {
    const teamProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.teamId, teamId), isNull(projects.deletedAt)))
      .orderBy(projects.createdAt);

    // Keep the SUBMITTED one (or last created if multiple submitted)
    const submitted = teamProjects.filter(p => p.status !== 'DRAFT');
    const drafts = teamProjects.filter(p => p.status === 'DRAFT');

    let toDelete: typeof teamProjects;
    if (submitted.length > 0) {
      // Keep the latest submitted, delete all drafts and older submitted
      const keep = submitted[submitted.length - 1];
      toDelete = [...drafts, ...submitted.filter(p => p.id !== keep.id)];
      console.log(`Team ${teamId}: keeping project ${keep.id} (${keep.status}), removing ${toDelete.length} others`);
    } else {
      // All drafts - keep the latest, remove the rest
      const keep = drafts[drafts.length - 1];
      toDelete = drafts.filter(p => p.id !== keep.id);
      console.log(`Team ${teamId}: keeping DRAFT ${keep.id}, removing ${toDelete.length} others`);
    }

    for (const p of toDelete) {
      await db
        .update(projects)
        .set({ deletedAt: new Date() })
        .where(eq(projects.id, p.id));
      console.log(`  Soft-deleted project ${p.id} (${p.status})`);
    }
  }

  console.log('✅ Cleanup complete.');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
