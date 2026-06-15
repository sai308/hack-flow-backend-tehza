// Soft-delete filter: verified 2026-04-29
// projects.deletedAt IS NULL added to all list/lookup queries.
import type { Database } from '../../config/database';
import {
  projects, projectResources, projectResourceTypes, stages,
} from '../../drizzle/schema';
import { eq, isNull, and } from 'drizzle-orm';
import type { CreateProjectDto, UpdateProjectDto, AddResourceDto } from './projects.schema';

export class ProjectsRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .limit(1);
    if (!row) return null;

    // Fetch resources with type info
    const resources = await this.db
      .select({
        id: projectResources.id,
        projectTypeId: projectResources.projectTypeId,
        url: projectResources.url,
        description: projectResources.description,
        typeName: projectResourceTypes.name,
        typeDescription: projectResourceTypes.description,
      })
      .from(projectResources)
      .leftJoin(projectResourceTypes, eq(projectResources.projectTypeId, projectResourceTypes.id))
      .where(eq(projectResources.projectId, id));

    return {
      ...row,
      isLate: (row.submittedLateByMinutes ?? 0) > 0,
      resources: resources.map(r => ({
        id: r.id,
        url: r.url,
        description: r.description,
        projectTypeId: r.projectTypeId,
        type: { id: r.projectTypeId, name: r.typeName, description: r.typeDescription },
      })),
    };
  }

  async findByTeam(teamId: string) {
    const rows = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.teamId, teamId), isNull(projects.deletedAt)));

    return rows.map(r => ({
      ...r,
      isLate: (r.submittedLateByMinutes ?? 0) > 0,
    }));
  }

  async create(data: CreateProjectDto) {
    const [row] = await this.db.insert(projects).values(data).returning();
    return { ...row, isLate: false, resources: [] };
  }

  async update(id: string, data: UpdateProjectDto & { submittedAt?: Date; reviewedAt?: Date }) {
    const [row] = await this.db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return row ?? null;
  }

  async addResource(projectId: string, data: AddResourceDto) {
    const [row] = await this.db
      .insert(projectResources)
      .values({ projectId, ...data })
      .returning();

    // Fetch type info to return full object
    const [typeRow] = await this.db
      .select()
      .from(projectResourceTypes)
      .where(eq(projectResourceTypes.id, data.projectTypeId))
      .limit(1);

    return {
      id: row.id,
      projectId: row.projectId,
      projectTypeId: row.projectTypeId,
      url: row.url,
      description: row.description,
      type: typeRow ? { id: typeRow.id, name: typeRow.name, description: typeRow.description } : null,
    };
  }

  async getResources(projectId: string) {
    return this.db
      .select({
        id: projectResources.id,
        projectTypeId: projectResources.projectTypeId,
        url: projectResources.url,
        description: projectResources.description,
        typeName: projectResourceTypes.name,
      })
      .from(projectResources)
      .leftJoin(projectResourceTypes, eq(projectResources.projectTypeId, projectResourceTypes.id))
      .where(eq(projectResources.projectId, projectId));
  }

  async removeResource(id: string) {
    await this.db.delete(projectResources).where(eq(projectResources.id, id));
  }

  async findStageById(stageId: string) {
    const [row] = await this.db.select().from(stages).where(eq(stages.id, stageId)).limit(1);
    return row ?? null;
  }

  async getResourceTypes() {
    return this.db.select().from(projectResourceTypes);
  }
}
