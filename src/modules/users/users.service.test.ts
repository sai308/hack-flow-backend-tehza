import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { NotFoundError } from '../../common/errors/http-errors';

describe('UsersService', () => {
  let service: UsersService;
  let repo: any;

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      findByUsername: vi.fn(),
      findAll: vi.fn(),
      updateProfile: vi.fn(),
      updateRole: vi.fn(),
      addSocial: vi.fn(),
      removeSocial: vi.fn(),
    };
    service = new UsersService(repo as unknown as UsersRepository);
  });

  describe('updateProfile', () => {
    it('should throw NotFoundError if user does not exist', async () => {
      repo.updateProfile.mockResolvedValue(null);

      await expect(service.updateProfile('uuid-123', { fullName: 'Test' }))
        .rejects.toThrowError(NotFoundError);
    });

    it('should call getProfile to return full user including role after update', async () => {
      repo.updateProfile.mockResolvedValue({ id: 'uuid-123', fullName: 'Test', avatarUrl: null });
      
      const mockFullProfile = { id: 'uuid-123', fullName: 'Test', role: 'participant', avatarUrl: null };
      
      // We spy on getProfile since it is called internally
      vi.spyOn(service, 'getProfile').mockResolvedValue(mockFullProfile as any);

      const result = await service.updateProfile('uuid-123', { fullName: 'Test', avatarUrl: null });

      expect(repo.updateProfile).toHaveBeenCalledWith('uuid-123', { fullName: 'Test', avatarUrl: null });
      expect(service.getProfile).toHaveBeenCalledWith('uuid-123');
      expect(result).toEqual(mockFullProfile);
    });
  });
});
