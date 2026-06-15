import type { ProjectsRepository } from './projects.repository';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/http-errors';
import type { CreateProjectDto, UpdateProjectDto, AddResourceDto } from './projects.schema';
import type { AuditLogRepository } from '../audit-log/audit-log.repository';

export class ProjectsService {
  constructor(
    private readonly repo: ProjectsRepository,
    private readonly auditLog?: AuditLogRepository,
  ) {}

  async getById(id: string) {
    const p = await this.repo.findById(id);
    if (!p) throw new NotFoundError('Project');
    return p;
  }

  async listByTeam(teamId: string) {
    return this.repo.findByTeam(teamId);
  }

  /** A team may have at most ONE active project per stage (no duplicates). */
  async create(dto: CreateProjectDto) {
    const existing = await this.repo.findByTeam(dto.teamId);
    const activeForStage = existing.filter(p => p.stageId === dto.stageId);
    if (activeForStage.length > 0) {
      throw new ConflictError(
        'Команда вже має проєкт для цього етапу. Редагуйте або видаліть існуючий перед створенням нового.',
      );
    }
    return this.repo.create(dto);
  }

  async update(id: string, dto: UpdateProjectDto) {
    const p = await this.getById(id);
    if (p.status !== 'DRAFT') {
      throw new ValidationError('Редагувати можна лише чернетки проєкту (статус DRAFT).');
    }
    return this.repo.update(id, dto);
  }

  /** Reopen a REJECTED project for editing and re-submission. */
  async reopen(id: string) {
    const p = await this.getById(id);
    if (p.status !== 'REJECTED') {
      throw new ValidationError('Повернути до чернетки можна лише відхилений проєкт.');
    }
    return this.repo.update(id, { status: 'DRAFT' });
  }

  async submit(id: string, userId?: string) {
    const p = await this.getById(id);
    if (p.status !== 'DRAFT') {
      throw new ValidationError('Подати можна лише проєкт зі статусом DRAFT.');
    }
    const resources = await this.repo.getResources(id);
    const hasGit = resources.some(r => /github|gitlab|bitbucket/i.test(r.url));
    if (!hasGit) {
      throw new ValidationError('Проєкт повинен містити посилання на Git-репозиторій (GitHub, GitLab, Bitbucket) для подання на перевірку.');
    }

    // Calculate late submission in minutes (0 if on time)
    const now = new Date();
    let submittedLateByMinutes: number | undefined;
    if (p.stageId) {
      const stage = await this.repo.findStageById(p.stageId);
      if (stage && stage.endDate && now > new Date(stage.endDate)) {
        const diffMs = now.getTime() - new Date(stage.endDate).getTime();
        submittedLateByMinutes = Math.round(diffMs / 60000);
      }
    }

    const result = await this.repo.update(id, {
      status: 'SUBMITTED',
      submittedAt: now,
      ...(submittedLateByMinutes !== undefined ? { submittedLateByMinutes } : {}),
    });
    if (userId) {
      this.auditLog?.log(userId, 'submit_project', 'project', id).catch(() => undefined);
    }
    return result;
  }

  async review(id: string, dto: UpdateProjectDto) {
    await this.getById(id);
    return this.repo.update(id, { ...dto, reviewedAt: new Date() });
  }

  async addResource(projectId: string, dto: AddResourceDto) {
    await this.getById(projectId);
    return this.repo.addResource(projectId, dto);
  }

  async removeResource(projectId: string, resourceId: string) {
    await this.getById(projectId);
    await this.repo.removeResource(resourceId);
  }

  async getResources(projectId: string) {
    await this.getById(projectId);
    return this.repo.getResources(projectId);
  }

  async getResourceTypes() {
    return this.repo.getResourceTypes();
  }
}

