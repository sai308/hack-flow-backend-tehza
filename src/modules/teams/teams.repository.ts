// Soft-delete filter: verified 2026-04-29
import type { Database } from '../../config/database';
import { teams, teamMembers, teamInvites, teamApprovals, teamJoinRequests, hackathons } from '../../drizzle/schema';
import { eq, and, count, isNull, desc, sql, gt, inArray } from 'drizzle-orm';
import type { CreateTeamDto, UpdateTeamDto } from './teams.schema';

export class TeamsRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string) {
    const row = await this.db.query.teams.findFirst({
      where: (t, { and, eq, isNull }) => and(eq(t.id, id), isNull(t.deletedAt)),
      with: {
        hackathon: {
          columns: { id: true, title: true, maxTeamSize: true },
          with: {
            tracks: { columns: { id: true, name: true } },
          },
        },
        track: { columns: { id: true, name: true, guidelines: true } },
        approvals: {
          orderBy: (a, { desc }) => [desc(a.approvedAt)],
          with: { reviewer: { columns: { fullName: true } } },
        },
      },
    });
    return row ?? null;
  }

  async findByHackathon(hackathonId: string) {
    return this.db
      .select()
      .from(teams)
      .where(and(eq(teams.hackathonId, hackathonId), isNull(teams.deletedAt)));
  }

  /** Returns the team + role for the current user in a given hackathon, or null. */
  async findUserTeamForHackathon(hackathonId: string, userId: string) {
    // Step 1: find which team the user belongs to in this specific hackathon
    const memberRows = await this.db
      .select({ teamId: teamMembers.teamId, role: teamMembers.role })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teams.hackathonId, hackathonId),
          isNull(teams.deletedAt),
        ),
      )
      .limit(1);

    if (memberRows.length === 0) return null;
    const { teamId, role } = memberRows[0];

    // Step 2: fetch full team data (with approvals, track, hackathon)
    const team = await this.findById(teamId);
    if (!team) return null;
    return { ...team, myRole: role };
  }

  /** Returns all non-deleted teams where userId is a member (across all hackathons). */
  async findMyTeams(userId: string) {
    const memberRows = await this.db
      .select({ teamId: teamMembers.teamId, role: teamMembers.role })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(and(eq(teamMembers.userId, userId), isNull(teams.deletedAt)));

    if (memberRows.length === 0) return [];

    return this.db.query.teams.findMany({
      where: (t, { inArray, isNull, and }) =>
        and(
          inArray(t.id, memberRows.map((r) => r.teamId)),
          isNull(t.deletedAt),
        ),
      with: {
        hackathon: { columns: { id: true, title: true } },
        track: { columns: { id: true, name: true, guidelines: true } },
        approvals: { orderBy: (a, { desc }) => [desc(a.approvedAt)], limit: 1 },
      },
    });
  }

  async findAllPaginated(
    page: number,
    limit: number,
    hackathonId?: string,
    trackId?: string,
    status?: string,
    search?: string,
    createdByUserId?: string, // if set, restricts teams to hackathons owned by this user
  ) {
    const offset = (page - 1) * limit;
    const conditions = [isNull(teams.deletedAt)];
    if (hackathonId) conditions.push(eq(teams.hackathonId, hackathonId));
    if (trackId) conditions.push(eq(teams.trackId, trackId));
    if (search) conditions.push(sql`${teams.name} ILIKE ${'%' + search + '%'}`);
    // Organizer restriction: only teams belonging to their hackathons
    if (createdByUserId) {
      const orgHackathonIds = this.db
        .select({ id: hackathons.id })
        .from(hackathons)
        .where(eq(hackathons.createdBy, createdByUserId));
      conditions.push(inArray(teams.hackathonId, orgHackathonIds));
    }
    if (status) {
      if (status === 'PENDING') {
        conditions.push(sql`(COALESCE((SELECT status FROM team_approvals WHERE team_id = teams.id ORDER BY approved_at DESC NULLS LAST LIMIT 1), 'PENDING') = 'PENDING')`);
      } else {
        conditions.push(sql`((SELECT status FROM team_approvals WHERE team_id = teams.id ORDER BY approved_at DESC NULLS LAST LIMIT 1) = ${status})`);
      }
    }

    const where = and(...conditions);
    const rows = await this.db.query.teams.findMany({
      where,
      orderBy: [desc(teams.createdAt)],
      limit,
      offset,
      with: {
        hackathon: { columns: { title: true } },
        track: { columns: { name: true } },
        members: { columns: { id: true } },
        approvals: { orderBy: (approvals, { desc }) => [desc(approvals.approvedAt)], limit: 1 },
        projects: { columns: { id: true, status: true, submittedAt: true } },
      },
    });

    const [{ total }] = await this.db.select({ total: count() }).from(teams).where(where);
    const mappedRows = (rows as any[]).map((r) => ({
      ...r,
      _count: { members: r.members?.length || 0 },
      approvalStatus: r.approvals?.[0]?.status ?? 'PENDING',
    }));
    return { rows: mappedRows, total: Number(total) };
  }

  async create(data: CreateTeamDto) {
    const [row] = await this.db.insert(teams).values(data).returning();
    return row;
  }

  async update(id: string, data: UpdateTeamDto) {
    const [row] = await this.db
      .update(teams)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teams.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: string) {
    await this.db.update(teams).set({ deletedAt: new Date() }).where(eq(teams.id, id));
  }

  // ── Members ──────────────────────────────────────────────────────────────

  async getMembers(teamId: string) {
    return this.db.query.teamMembers.findMany({
      where: (m, { eq }) => eq(m.teamId, teamId),
      with: {
        user: { columns: { id: true, fullName: true, email: true, avatarUrl: true, username: true } },
      },
    });
  }

  async isMember(teamId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);
    return !!row;
  }

  /** Returns true if user already belongs to ANY non-deleted team in the given hackathon. */
  async isUserInHackathon(userId: string, hackathonId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teams.hackathonId, hackathonId),
          isNull(teams.deletedAt),
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  async addMember(teamId: string, userId: string, role: 'captain' | 'participant' = 'participant') {
    const [row] = await this.db.insert(teamMembers).values({ teamId, userId, role }).returning();
    return row;
  }

  async removeMember(teamId: string, userId: string) {
    await this.db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  }

  async updateMemberRole(teamId: string, userId: string, role: 'captain' | 'participant') {
    await this.db
      .update(teamMembers)
      .set({ role })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  }

  /** Atomically transfers captain role: old captain → participant, new captain → captain. */
  async transferCaptain(teamId: string, fromUserId: string, toUserId: string) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(teamMembers)
        .set({ role: 'participant' })
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, fromUserId)));
      await tx
        .update(teamMembers)
        .set({ role: 'captain' })
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, toUserId)));
    });
  }

  // ── Invites ──────────────────────────────────────────────────────────────

  async createInvite(data: {
    teamId: string;
    token: string;
    createdBy: string;
    expiresAt: Date;
    maxUses: number;
  }) {
    // Deactivate previous invites before creating a new one
    await this.db.update(teamInvites).set({ active: false }).where(eq(teamInvites.teamId, data.teamId));
    const [row] = await this.db.insert(teamInvites).values(data).returning();
    return row;
  }

  async getActiveInvite(teamId: string) {
    const now = new Date();
    const [row] = await this.db
      .select()
      .from(teamInvites)
      .where(and(eq(teamInvites.teamId, teamId), eq(teamInvites.active, true), gt(teamInvites.expiresAt, now)))
      .orderBy(desc(teamInvites.createdAt))
      .limit(1);
    return row ?? null;
  }

  async findInviteByToken(token: string) {
    const [row] = await this.db
      .select()
      .from(teamInvites)
      .where(eq(teamInvites.token, token))
      .limit(1);
    return row ?? null;
  }

  async incrementInviteUses(id: string, currentCount: number) {
    await this.db
      .update(teamInvites)
      .set({ usesCount: currentCount + 1 })
      .where(eq(teamInvites.id, id));
  }

  async deactivateInvite(id: string) {
    await this.db.update(teamInvites).set({ active: false }).where(eq(teamInvites.id, id));
  }

  // ── Approval ──────────────────────────────────────────────────────────────

  async getApproval(teamId: string) {
    const [row] = await this.db
      .select()
      .from(teamApprovals)
      .where(eq(teamApprovals.teamId, teamId))
      .orderBy(desc(teamApprovals.approvedAt))
      .limit(1);
    return row ?? null;
  }

  async upsertApproval(data: {
    teamId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISQUALIFIED';
    approvedBy?: string;
    comment?: string;
  }) {
    // Try to UPDATE the existing record first; only INSERT if none exists yet.
    const updated = await this.db
      .update(teamApprovals)
      .set({
        status: data.status,
        approvedBy: data.approvedBy,
        comment: data.comment ?? null,
        approvedAt: new Date(),
      })
      .where(eq(teamApprovals.teamId, data.teamId))
      .returning();

    if (updated.length > 0) return updated[0];

    // No existing row — insert a fresh one.
    const [row] = await this.db
      .insert(teamApprovals)
      .values({ ...data, approvedAt: new Date() })
      .returning();
    return row;
  }

  // ── Join Requests ─────────────────────────────────────────────────────────

  async createJoinRequest(teamId: string, userId: string, message?: string) {
    const [row] = await this.db
      .insert(teamJoinRequests)
      .values({ teamId, userId, message })
      .returning();
    return row;
  }

  async hasActiveRequest(teamId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(teamJoinRequests)
      .where(
        and(
          eq(teamJoinRequests.teamId, teamId),
          eq(teamJoinRequests.userId, userId),
          eq(teamJoinRequests.status, 'pending'),
        )
      )
      .limit(1);
    return !!row;
  }

  async getUserJoinRequestStatus(teamId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(teamJoinRequests)
      .where(and(eq(teamJoinRequests.teamId, teamId), eq(teamJoinRequests.userId, userId)))
      .orderBy(desc(teamJoinRequests.createdAt))
      .limit(1);
    return row ?? null;
  }

  async getJoinRequests(teamId: string) {
    return this.db.query.teamJoinRequests.findMany({
      where: (r, { and, eq }) => and(eq(r.teamId, teamId), eq(r.status, 'pending')),
      with: {
        user: { columns: { id: true, fullName: true, email: true, avatarUrl: true, username: true } },
      },
      orderBy: (r, { asc }) => [asc(r.createdAt)],
    });
  }

  async updateJoinRequest(id: string, status: 'accepted' | 'rejected') {
    const [row] = await this.db
      .update(teamJoinRequests)
      .set({ status, updatedAt: new Date() })
      .where(eq(teamJoinRequests.id, id))
      .returning();
    return row ?? null;
  }

  async findJoinRequest(id: string) {
    const [row] = await this.db
      .select()
      .from(teamJoinRequests)
      .where(eq(teamJoinRequests.id, id))
      .limit(1);
    return row ?? null;
  }
}
