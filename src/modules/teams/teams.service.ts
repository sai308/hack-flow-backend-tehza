import type { TeamsRepository } from './teams.repository';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../common/errors/http-errors';
import { generateId } from '../../utils/uuid';
import type { CreateTeamDto, UpdateTeamDto, CreateInviteDto } from './teams.schema';
import type { AuditLogRepository } from '../audit-log/audit-log.repository';

export class TeamsService {
  constructor(
    private readonly repo: TeamsRepository,
    private readonly auditLog?: AuditLogRepository,
  ) {}

  async list(page: number, limit: number, hackathonId?: string, trackId?: string, status?: string, search?: string, createdByUserId?: string) {
    const { rows, total } = await this.repo.findAllPaginated(page, limit, hackathonId, trackId, status, search, createdByUserId);
    return {
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string) {
    const team = await this.repo.findById(id);
    if (!team) throw new NotFoundError('Team');
    return team;
  }

  async getMyTeamForHackathon(hackathonId: string, userId: string) {
    return this.repo.findUserTeamForHackathon(hackathonId, userId);
  }

  async getMyTeams(userId: string) {
    return this.repo.findMyTeams(userId);
  }

  async listByHackathon(hackathonId: string) {
    return this.repo.findByHackathon(hackathonId);
  }

  async create(dto: CreateTeamDto, creatorId: string) {
    // Guard: one team per hackathon per user
    const alreadyInHackathon = await this.repo.isUserInHackathon(creatorId, dto.hackathonId);
    if (alreadyInHackathon) {
      throw new ConflictError('Ви вже є учасником команди в цьому хакатоні');
    }
    const team = await this.repo.create(dto);
    await this.repo.addMember(team.id, creatorId, 'captain');
    this.auditLog?.log(creatorId, 'create_team', 'team', team.id).catch(() => undefined);
    return team;
  }

  async update(id: string, dto: UpdateTeamDto, requesterId: string) {
    await this.assertCaptain(id, requesterId);
    const updated = await this.repo.update(id, dto);
    if (!updated) throw new NotFoundError('Team');
    // Зміни потребують повторного затвердження організатором
    await this.repo.upsertApproval({
      teamId: id,
      status: 'PENDING',
      approvedBy: requesterId,
      comment: 'Команда внесла зміни — очікується перегляд організатором',
    });
    this.auditLog?.log(requesterId, 'update_team', 'team', id).catch(() => undefined);
    return updated;
  }

  async remove(id: string, requesterId: string) {
    await this.assertCaptain(id, requesterId);
    await this.repo.remove(id);
    this.auditLog?.log(requesterId, 'delete_team', 'team', id).catch(() => undefined);
  }

  async getMembers(teamId: string) {
    await this.getById(teamId);
    return this.repo.getMembers(teamId);
  }

  async removeMember(teamId: string, userId: string, requesterId: string, isAdmin = false) {
    if (!isAdmin) {
      await this.assertCaptain(teamId, requesterId);
      if (userId === requesterId) throw new ValidationError('Капітан не може видалити себе. Спочатку передайте капітанство.');
    }
    await this.repo.removeMember(teamId, userId);
  }

  async leaveTeam(teamId: string, userId: string) {
    const members = await this.repo.getMembers(teamId);
    const myMember = members.find((m) => m.userId === userId);
    if (!myMember) throw new NotFoundError('Ви не є учасником цієї команди');
    if (myMember.role === 'captain') {
      throw new ForbiddenError('Капітан не може покинути команду. Спочатку передайте капітанство іншому учаснику.');
    }
    await this.repo.removeMember(teamId, userId);
    this.auditLog?.log(userId, 'leave_team', 'team', teamId).catch(() => undefined);
  }

  async createInvite(teamId: string, dto: CreateInviteDto, requesterId: string) {
    await this.assertCaptain(teamId, requesterId);
    const token = generateId();
    const expiresAt = new Date(Date.now() + dto.expiresInHours * 60 * 60 * 1000);
    return this.repo.createInvite({ teamId, token, createdBy: requesterId, expiresAt, maxUses: dto.maxUses });
  }

  async getActiveInvite(teamId: string, requesterId: string) {
    await this.assertCaptain(teamId, requesterId);
    return this.repo.getActiveInvite(teamId);
  }

  async transferCaptain(teamId: string, newCaptainId: string, currentUserId: string) {
    await this.assertCaptain(teamId, currentUserId);
    const isMember = await this.repo.isMember(teamId, newCaptainId);
    if (!isMember) throw new NotFoundError('Цей користувач не є учасником команди');
    if (newCaptainId === currentUserId) throw new ValidationError('Ви вже є капітаном');
    await this.repo.transferCaptain(teamId, currentUserId, newCaptainId);
    this.auditLog?.log(currentUserId, 'transfer_captain', 'team', teamId).catch(() => undefined);
  }

  async joinViaToken(token: string, userId: string) {
    const invite = await this.repo.findInviteByToken(token);
    if (!invite || !invite.active || invite.expiresAt < new Date()) {
      throw new NotFoundError('Токен запрошення недійсний або його термін дії минув');
    }
    if (invite.usesCount >= invite.maxUses) {
      throw new ForbiddenError('Ліміт використань цього посилання вичерпано');
    }
    const alreadyMember = await this.repo.isMember(invite.teamId, userId);
    if (alreadyMember) throw new ConflictError('Ви вже є учасником цієї команди');

    // Guard: find team to know hackathonId, then check cross-team membership
    const team = await this.repo.findById(invite.teamId);
    if (!team) throw new NotFoundError('Team');
    const alreadyInHackathon = await this.repo.isUserInHackathon(userId, (team as any).hackathonId);
    if (alreadyInHackathon) {
      throw new ConflictError('Ви вже є учасником команди в цьому хакатоні');
    }

    await this.repo.addMember(invite.teamId, userId);
    await this.repo.incrementInviteUses(invite.id, invite.usesCount);
    this.auditLog?.log(userId, 'join_team', 'team', invite.teamId).catch(() => undefined);
    return { teamId: invite.teamId, hackathonId: (team as any).hackathonId };
  }

  async updateApproval(
    teamId: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISQUALIFIED',
    approverId: string,
    comment?: string,
  ) {
    await this.getById(teamId);
    return this.repo.upsertApproval({ teamId, status, approvedBy: approverId, comment });
  }

  async sendJoinRequest(teamId: string, userId: string, message?: string) {
    const team = await this.repo.findById(teamId);
    if (!team) throw new NotFoundError('Team');
    const alreadyMember = await this.repo.isMember(teamId, userId);
    if (alreadyMember) throw new ConflictError('Ви вже є учасником цієї команди');
    const hasRequest = await this.repo.hasActiveRequest(teamId, userId);
    if (hasRequest) throw new ConflictError('Ви вже подали заявку до цієї команди');
    return this.repo.createJoinRequest(teamId, userId, message);
  }

  async getJoinRequests(teamId: string, requesterId: string) {
    await this.assertCaptain(teamId, requesterId);
    return this.repo.getJoinRequests(teamId);
  }

  async getUserJoinRequestStatus(teamId: string, userId: string) {
    return this.repo.getUserJoinRequestStatus(teamId, userId);
  }

  async respondToJoinRequest(
    requestId: string,
    action: 'accepted' | 'rejected',
    captainId: string,
  ) {
    const req = await this.repo.findJoinRequest(requestId);
    if (!req) throw new NotFoundError('Join request not found');
    await this.assertCaptain(req.teamId, captainId);
    if (req.status !== 'pending') throw new ConflictError('Цю заявку вже оброблено');
    await this.repo.updateJoinRequest(requestId, action);
    if (action === 'accepted') {
      const hackathonId = (req as any).hackathonId
        ?? (await this.repo.findById(req.teamId) as any)?.hackathonId;
      if (hackathonId) {
        const alreadyIn = await this.repo.isUserInHackathon(req.userId, hackathonId);
        if (alreadyIn) {
          // auto-reject: user joined another team in between
          await this.repo.updateJoinRequest(requestId, 'rejected');
          throw new ConflictError('Учасник вже є в іншій команді цього хакатону');
        }
      }
      await this.repo.addMember(req.teamId, req.userId, 'participant');
      this.auditLog?.log(req.userId, 'join_team', 'team', req.teamId).catch(() => undefined);
    }
    return { requestId, action };
  }

  private async assertCaptain(teamId: string, userId: string): Promise<void> {
    const members = await this.repo.getMembers(teamId);
    const isCaptain = members.some((m) => m.userId === userId && m.role === 'captain');
    if (!isCaptain) throw new ForbiddenError('Тільки капітан команди може виконати цю дію');
  }
}
