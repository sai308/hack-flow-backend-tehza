import type { Database } from '../../config/database';
import { hackathonTags, hackathonTagRelations, hackathons } from '../../drizzle/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { ConflictError, NotFoundError } from '../../common/errors/http-errors';

export class HackathonTagsRepository {
  constructor(private readonly db: Database) {}

  async findAllTags() {
    return this.db
      .select()
      .from(hackathonTags)
      .orderBy(hackathonTags.name);
  }

  async findTagById(id: string) {
    const [row] = await this.db
      .select()
      .from(hackathonTags)
      .where(eq(hackathonTags.id, id))
      .limit(1);
    return row ?? null;
  }

  async findTagByName(name: string) {
    // Case-insensitive via SQL lower()
    const [row] = await this.db
      .select()
      .from(hackathonTags)
      .where(sql`lower(${hackathonTags.name}) = lower(${name})`)
      .limit(1);
    return row ?? null;
  }

  async createTag(name: string) {
    const normalized = name.trim().toLowerCase();
    const [row] = await this.db
      .insert(hackathonTags)
      .values({ name: normalized })
      .returning();
    return row;
  }

  async deleteTag(id: string) {
    // Check for existing relations
    const [relation] = await this.db
      .select({ hackathonId: hackathonTagRelations.hackathonId })
      .from(hackathonTagRelations)
      .where(eq(hackathonTagRelations.tagId, id))
      .limit(1);

    if (relation) {
      throw new ConflictError('Tag is in use — detach from all hackathons first');
    }

    await this.db.delete(hackathonTags).where(eq(hackathonTags.id, id));
  }

  async findTagsByHackathon(hackathonId: string) {
    return this.db
      .select({
        id: hackathonTags.id,
        name: hackathonTags.name,
      })
      .from(hackathonTagRelations)
      .innerJoin(hackathonTags, eq(hackathonTagRelations.tagId, hackathonTags.id))
      .where(eq(hackathonTagRelations.hackathonId, hackathonId));
  }

  async attachTags(hackathonId: string, tagIds: string[]) {
    // Verify all tags exist
    const existing = await this.db
      .select({ id: hackathonTags.id })
      .from(hackathonTags)
      .where(inArray(hackathonTags.id, tagIds));

    if (existing.length !== tagIds.length) {
      const foundIds = new Set(existing.map((t) => t.id));
      const missing = tagIds.find((id) => !foundIds.has(id));
      throw new NotFoundError(`Tag not found: ${missing}`);
    }

    // Idempotent insert
    await this.db
      .insert(hackathonTagRelations)
      .values(tagIds.map((tagId) => ({ hackathonId, tagId })))
      .onConflictDoNothing();
  }

  async detachTag(hackathonId: string, tagId: string) {
    // Check relation exists first
    const [relation] = await this.db
      .select()
      .from(hackathonTagRelations)
      .where(
        and(
          eq(hackathonTagRelations.hackathonId, hackathonId),
          eq(hackathonTagRelations.tagId, tagId),
        ),
      )
      .limit(1);

    if (!relation) {
      throw new NotFoundError('Tag relation not found on this hackathon');
    }

    await this.db
      .delete(hackathonTagRelations)
      .where(
        and(
          eq(hackathonTagRelations.hackathonId, hackathonId),
          eq(hackathonTagRelations.tagId, tagId),
        ),
      );
  }

  /**
   * AND-logic: returns hackathon IDs that have ALL specified tags.
   * Uses HAVING count(DISTINCT name) = N pattern.
   */
  async findHackathonsByTags(tagNames: string[]): Promise<string[]> {
    if (tagNames.length === 0) return [];

    const normalized = tagNames.map((n) => n.trim().toLowerCase());

    const rows = await this.db
      .select({ hackathonId: hackathonTagRelations.hackathonId })
      .from(hackathonTagRelations)
      .innerJoin(hackathonTags, eq(hackathonTagRelations.tagId, hackathonTags.id))
      .where(inArray(hackathonTags.name, normalized))
      .groupBy(hackathonTagRelations.hackathonId)
      .having(sql`count(distinct ${hackathonTags.name}) = ${normalized.length}`);

    return rows.map((r) => r.hackathonId);
  }

  /**
   * Batch fetch tags for a list of hackathon IDs.
   * Returns a Map<hackathonId, Tag[]> for O(1) lookup when enriching list responses.
   */
  async findTagsForHackathons(
    hackathonIds: string[],
  ): Promise<Map<string, Array<{ id: string; name: string }>>> {
    if (hackathonIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        hackathonId: hackathonTagRelations.hackathonId,
        id: hackathonTags.id,
        name: hackathonTags.name,
      })
      .from(hackathonTagRelations)
      .innerJoin(hackathonTags, eq(hackathonTagRelations.tagId, hackathonTags.id))
      .where(inArray(hackathonTagRelations.hackathonId, hackathonIds));

    const map = new Map<string, Array<{ id: string; name: string }>>();
    for (const row of rows) {
      const existing = map.get(row.hackathonId) ?? [];
      existing.push({ id: row.id, name: row.name });
      map.set(row.hackathonId, existing);
    }
    return map;
  }

  async hackathonExists(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: hackathons.id })
      .from(hackathons)
      .where(eq(hackathons.id, id))
      .limit(1);
    return !!row;
  }
}
