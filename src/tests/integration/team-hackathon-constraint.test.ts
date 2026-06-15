/**
 * Regression tests: one user = one team per hackathon.
 *
 * These are unit tests that mock TeamsRepository, so no real DB connection
 * is required and they run instantly in CI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamsService } from '../../modules/teams/teams.service';
import { ConflictError } from '../../common/errors/http-errors';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRepo(overrides: Partial<Record<string, any>> = {}) {
  return {
    findById: vi.fn(),
    findAllPaginated: vi.fn(),
    findByHackathon: vi.fn(),
    findUserTeamForHackathon: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    getMembers: vi.fn().mockResolvedValue([]),
    isMember: vi.fn().mockResolvedValue(false),
    isUserInHackathon: vi.fn().mockResolvedValue(false), // default: no conflict
    addMember: vi.fn().mockResolvedValue({}),
    removeMember: vi.fn(),
    updateMemberRole: vi.fn(),
    transferCaptain: vi.fn(),
    leaveTeam: vi.fn(),
    findInviteByToken: vi.fn(),
    createInvite: vi.fn(),
    getActiveInvite: vi.fn(),
    incrementInviteUses: vi.fn(),
    upsertApproval: vi.fn(),
    createJoinRequest: vi.fn(),
    hasActiveRequest: vi.fn().mockResolvedValue(false),
    getUserJoinRequestStatus: vi.fn(),
    getJoinRequests: vi.fn().mockResolvedValue([]),
    updateJoinRequest: vi.fn(),
    findJoinRequest: vi.fn(),
    ...overrides,
  };
}

const HACKATHON_ID = 'hackathon-111';
const TEAM_ID      = 'team-aaa';
const OTHER_TEAM   = 'team-bbb';
const USER_ID      = 'user-zzz';
const TOKEN        = 'invite-token-xyz';

// ── createTeam: one-per-hackathon ──────────────────────────────────────────

describe('TeamsService.create — one team per hackathon', () => {
  it('allows creating a team when user has no team in the hackathon', async () => {
    const repo = makeRepo({
      isUserInHackathon: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockResolvedValue({ id: TEAM_ID, hackathonId: HACKATHON_ID }),
    });
    const svc = new TeamsService(repo as any);

    const result = await svc.create(
      { name: 'Alpha', hackathonId: HACKATHON_ID },
      USER_ID,
    );

    expect(repo.isUserInHackathon).toHaveBeenCalledWith(USER_ID, HACKATHON_ID);
    expect(repo.create).toHaveBeenCalled();
    expect(repo.addMember).toHaveBeenCalledWith(TEAM_ID, USER_ID, 'captain');
    expect(result.id).toBe(TEAM_ID);
  });

  it('throws 409 when user tries to create a second team in the same hackathon', async () => {
    const repo = makeRepo({
      isUserInHackathon: vi.fn().mockResolvedValue(true), // already in a team
    });
    const svc = new TeamsService(repo as any);

    await expect(
      svc.create({ name: 'Beta', hackathonId: HACKATHON_ID }, USER_ID),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.addMember).not.toHaveBeenCalled();
  });
});

// ── joinViaToken: one-per-hackathon ────────────────────────────────────────

describe('TeamsService.joinViaToken — one team per hackathon', () => {
  const validInvite = {
    id: 'invite-id',
    teamId: TEAM_ID,
    active: true,
    expiresAt: new Date(Date.now() + 86400_000),
    maxUses: 10,
    usesCount: 0,
  };

  it('allows joining when user has no team in the hackathon', async () => {
    const repo = makeRepo({
      findInviteByToken: vi.fn().mockResolvedValue(validInvite),
      findById: vi.fn().mockResolvedValue({ id: TEAM_ID, hackathonId: HACKATHON_ID }),
      isMember: vi.fn().mockResolvedValue(false),
      isUserInHackathon: vi.fn().mockResolvedValue(false),
    });
    const svc = new TeamsService(repo as any);

    const result = await svc.joinViaToken(TOKEN, USER_ID);

    expect(repo.isUserInHackathon).toHaveBeenCalledWith(USER_ID, HACKATHON_ID);
    expect(repo.addMember).toHaveBeenCalledWith(TEAM_ID, USER_ID);
    expect(result).toMatchObject({ teamId: TEAM_ID, hackathonId: HACKATHON_ID });
  });

  it('throws 409 when user tries to join a second team in the same hackathon', async () => {
    const repo = makeRepo({
      findInviteByToken: vi.fn().mockResolvedValue(validInvite),
      findById: vi.fn().mockResolvedValue({ id: TEAM_ID, hackathonId: HACKATHON_ID }),
      isMember: vi.fn().mockResolvedValue(false),      // not in *this* team
      isUserInHackathon: vi.fn().mockResolvedValue(true), // but already in another
    });
    const svc = new TeamsService(repo as any);

    await expect(svc.joinViaToken(TOKEN, USER_ID)).rejects.toBeInstanceOf(ConflictError);

    expect(repo.addMember).not.toHaveBeenCalled();
    expect(repo.incrementInviteUses).not.toHaveBeenCalled();
  });
});
