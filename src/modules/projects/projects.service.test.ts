import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectsService } from './projects.service';
import { ProjectsRepository } from './projects.repository';
import { ValidationError, NotFoundError } from '../../common/errors/http-errors';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let repo: any;

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      findByTeam: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      addResource: vi.fn(),
      removeResource: vi.fn(),
      getResources: vi.fn(),
    };
    service = new ProjectsService(repo as unknown as ProjectsRepository);
  });

  describe('submit', () => {
    it('should throw NotFoundError if project does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.submit('proj-1')).rejects.toThrowError(NotFoundError);
    });

    it('should throw ValidationError if no git resource exists', async () => {
      repo.findById.mockResolvedValue({ id: 'proj-1', status: 'DRAFT' });
      repo.getResources.mockResolvedValue([
        { url: 'https://google.com', description: 'Not a git repo' }
      ]);

      await expect(service.submit('proj-1')).rejects.toThrowError(ValidationError);
    });

    it('should successfully submit if a github resource exists', async () => {
      repo.findById.mockResolvedValue({ id: 'proj-1', status: 'DRAFT' });
      repo.getResources.mockResolvedValue([
        { url: 'https://google.com', description: 'Not a git repo' },
        { url: 'https://github.com/user/repo', description: 'GitHub repo' }
      ]);
      repo.update.mockResolvedValue({ id: 'proj-1', status: 'SUBMITTED' });

      const result = await service.submit('proj-1');

      expect(result).toEqual({ id: 'proj-1', status: 'SUBMITTED' });
      expect(repo.update).toHaveBeenCalledWith('proj-1', expect.objectContaining({ status: 'SUBMITTED' }));
    });
  });
});
