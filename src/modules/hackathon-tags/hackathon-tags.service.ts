import type { HackathonTagsRepository } from './hackathon-tags.repository';
import { ConflictError, NotFoundError } from '../../common/errors/http-errors';

export class HackathonTagsService {
  constructor(private readonly repo: HackathonTagsRepository) {}

  async listTags() {
    return this.repo.findAllTags();
  }

  async createTag(name: string) {
    const normalized = name.trim().toLowerCase();
    const existing = await this.repo.findTagByName(normalized);
    if (existing) throw new ConflictError('Tag already exists');
    return this.repo.createTag(normalized);
  }

  async deleteTag(id: string) {
    const tag = await this.repo.findTagById(id);
    if (!tag) throw new NotFoundError('Tag not found');
    // repo.deleteTag throws 409 if in use
    await this.repo.deleteTag(id);
  }

  async getTagsForHackathon(hackathonId: string) {
    return this.repo.findTagsByHackathon(hackathonId);
  }

  async attachTags(hackathonId: string, tagIds: string[]) {
    const exists = await this.repo.hackathonExists(hackathonId);
    if (!exists) throw new NotFoundError('Hackathon not found');
    await this.repo.attachTags(hackathonId, tagIds);
    return this.repo.findTagsByHackathon(hackathonId);
  }

  async detachTag(hackathonId: string, tagId: string) {
    const exists = await this.repo.hackathonExists(hackathonId);
    if (!exists) throw new NotFoundError('Hackathon not found');
    await this.repo.detachTag(hackathonId, tagId);
  }
}
