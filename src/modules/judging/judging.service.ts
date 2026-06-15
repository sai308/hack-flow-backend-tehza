import type { JudgingRepository } from './judging.repository';
import { ForbiddenError, NotFoundError } from '../../common/errors/http-errors';
import type { CreateCriteriaDto, SubmitScoreDto, ReportConflictDto } from './judging.schema';
import type { Redis } from 'ioredis';
import type { AuditLogRepository } from '../audit-log/audit-log.repository';
import { env } from '../../config/env';
import type { JudgeTrackRepository } from '../judge-track/judge-track.repository';

const LEADERBOARD_TTL_SECONDS = 60;

export interface LeaderboardEntry {
  rank: number;
  projectId: string;
  teamId: string;
  totalScore: number;
  normalizedScore: number;
}

export class JudgingService {
  constructor(
    private readonly repo: JudgingRepository,
    private readonly auditLog?: AuditLogRepository,
    private readonly judgeTrackRepo?: JudgeTrackRepository,
  ) { }

  // ── Criteria ─────────────────────────────────────────────
  async listCriteria(trackId: string) {
    return this.repo.findCriteriaByTrack(trackId);
  }

  async createCriteria(dto: CreateCriteriaDto) {
    return this.repo.createCriteria(dto);
  }

  async deleteCriteria(id: string) {
    await this.repo.deleteCriteria(id);
  }

  async updateCriteria(id: string, dto: any) {
    return this.repo.updateCriteria(id, dto);
  }

  // ── Scores ───────────────────────────────────────────────
  async getScoresForProject(projectId: string) {
    return this.repo.findScoresByProject(projectId);
  }

  async getMyScores(judgeId: string) {
    return this.repo.findScoresByJudge(judgeId);
  }

  async submitScore(judgeId: string, dto: SubmitScoreDto) {
    // Guard 1: track assignment check (optional, based on env flag)
    if (env.ENFORCE_JUDGE_TRACK && this.judgeTrackRepo) {
      const project = await this.repo.findProjectById(dto.projectId);
      if (!project) throw new NotFoundError('Project not found');
      const track = await this.repo.findTeamTrack(project.teamId);
      if (track?.trackId) {
        const assigned = await this.judgeTrackRepo.findByUserAndTrack(judgeId, track.trackId);
        if (!assigned) throw new ForbiddenError('Judge not assigned to this track');
      }
    }

    // Guard 2: conflict of interest check (always enforced)
    const project = await this.repo.findProjectById(dto.projectId);
    if (project) {
      const hasConf = await this.repo.hasConflict(judgeId, project.teamId);
      if (hasConf) {
        throw new ForbiddenError(
          'You have declared a conflict of interest for this team and cannot score it',
        );
      }
    }

    const result = await this.repo.upsertScore(judgeId, dto);
    this.auditLog?.log(judgeId, 'submit_score', 'score', result.id).catch(() => undefined);
    return result;
  }

  // ── Conflicts ────────────────────────────────────────────
  async listConflicts(judgeId: string) {
    return this.repo.findConflictsByJudge(judgeId);
  }

  async reportConflict(judgeId: string, dto: ReportConflictDto) {
    const existing = await this.repo.hasConflict(judgeId, dto.teamId);
    if (existing) throw new ForbiddenError('Conflict already reported for this team');
    return this.repo.reportConflict(judgeId, dto);
  }

  async deleteConflict(id: string) {
    await this.repo.deleteConflict(id);
  }

  async updateConflictReason(id: string, reason: string) {
    return this.repo.updateConflictReason(id, reason);
  }

  async adminCreateConflict(judgeId: string, teamId: string, reason?: string) {
    return this.repo.adminCreateConflict(judgeId, teamId, reason);
  }

  // ── Normalization ─────────────────────────────────────────
  normalizeScores(
    rawScores: Array<{ judgeId: string; assessment: string; projectId: string; criteriaId: string }>,
  ): Array<{ judgeId: string; projectId: string; criteriaId: string; normalized: number }> {
    if (rawScores.length === 0) return [];
    const judgeTotals = new Map<string, { sum: number; count: number }>();
    for (const s of rawScores) {
      const val = Number(s.assessment);
      const prev = judgeTotals.get(s.judgeId) ?? { sum: 0, count: 0 };
      judgeTotals.set(s.judgeId, { sum: prev.sum + val, count: prev.count + 1 });
    }
    const judgeAvgs = new Map<string, number>();
    for (const [jId, { sum, count }] of judgeTotals) judgeAvgs.set(jId, sum / count);
    const allVals = rawScores.map(s => Number(s.assessment));
    const globalAvg = allVals.reduce((a, b) => a + b, 0) / allVals.length;
    return rawScores.map(s => {
      const judgeAvg = judgeAvgs.get(s.judgeId) ?? globalAvg;
      const multiplier = judgeAvg === 0 ? 1 : globalAvg / judgeAvg;
      return { judgeId: s.judgeId, projectId: s.projectId, criteriaId: s.criteriaId, normalized: Number(s.assessment) * multiplier };
    });
  }

  // ── Leaderboard ───────────────────────────────────────────
  async getLeaderboard(hackathonId: string, redis: Redis): Promise<LeaderboardEntry[]> {
    const cacheKey = `leaderboard:${hackathonId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as LeaderboardEntry[];

    const [hackProjects, criteriaList] = await Promise.all([
      this.repo.findProjectsByHackathon(hackathonId),
      this.repo.findCriteriaForHackathon(hackathonId),
    ]);
    if (hackProjects.length === 0) return [];

    const projectIds = hackProjects.map(p => p.id);
    const rawScores = await this.repo.findAllScoresForHackathon(projectIds);
    const criteriaMap = new Map(criteriaList.map(c => [c.id, { weight: Number(c.weight), maxScore: Number(c.maxScore) }]));
    const normalized = this.normalizeScores(rawScores);
    const projectScores = new Map<string, number>();
    for (const p of hackProjects) projectScores.set(p.id, 0);
    for (const ns of normalized) {
      const crit = criteriaMap.get(ns.criteriaId);
      if (!crit) continue;
      const ws = crit.maxScore > 0 ? ns.normalized * (crit.weight / crit.maxScore) : ns.normalized;
      projectScores.set(ns.projectId, (projectScores.get(ns.projectId) ?? 0) + ws);
    }
    const projectMap = new Map(hackProjects.map(p => [p.id, p]));
    const entries: LeaderboardEntry[] = Array.from(projectScores.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([projectId, totalScore], idx) => ({
        rank: idx + 1, projectId,
        teamId: projectMap.get(projectId)?.teamId ?? '',
        teamName: (projectMap.get(projectId) as any)?.teamName ?? 'Невідома команда',
        totalScore: Math.round(totalScore * 100) / 100,
        normalizedScore: Math.round(totalScore * 100) / 100,
      }));
    await redis.setex(cacheKey, LEADERBOARD_TTL_SECONDS, JSON.stringify(entries));
    return entries;
  }


  // ── Full Results ──────────────────────────────────────────
  async getFullResults(hackathonId: string) {
    const rawTeams = await this.repo.findAllTeamsForHackathon(hackathonId);

    // Deduplicate by teamId — SQL JOINs in the repo can return the same team multiple times
    const seenTeamIds = new Set<string>();
    const allTeams = rawTeams.filter(t => {
      if (seenTeamIds.has(t.teamId)) return false;
      seenTeamIds.add(t.teamId);
      return true;
    });

    if (allTeams.length === 0) return this.emptyResults();

    const teamIds = allTeams.map(t => t.teamId);
    const [members, allProjects, teamAwardRows, hackathonAwards] = await Promise.all([
      this.repo.findMembersByTeams(teamIds),
      this.repo.findProjectsForTeams(teamIds, hackathonId),
      this.repo.findAwardsByTeams(teamIds),
      this.repo.listAwardsByHackathon(hackathonId),
    ]);

    const submittedProjects = allProjects.filter(p => ['SUBMITTED', 'APPROVED', 'REVIEWED'].includes(p.status));
    const projectIds = submittedProjects.map(p => p.id);
    const fullScores = await this.repo.findFullScoresForProjects(projectIds);

    const rawForNorm = fullScores.map(s => ({ judgeId: s.judgeId, assessment: String(s.assessment), projectId: s.projectId, criteriaId: s.criteriaId }));
    const normalized = this.normalizeScores(rawForNorm);
    const normMap = new Map<string, number>();
    for (const ns of normalized) normMap.set(`${ns.projectId}:${ns.judgeId}:${ns.criteriaId}`, ns.normalized);

    const memberMap = new Map<string, typeof members>();
    for (const m of members) {
      if (!memberMap.has(m.teamId)) memberMap.set(m.teamId, []);
      memberMap.get(m.teamId)!.push(m);
    }
    const projectByTeam = new Map<string, typeof allProjects[0]>();
    for (const p of allProjects) projectByTeam.set(p.teamId, p);
    const awardByTeam = new Map<string, typeof teamAwardRows[0]>();
    for (const a of teamAwardRows) awardByTeam.set(a.teamId, a);

    const trackMap = new Map<string, { id: string; name: string }>();
    for (const t of allTeams) {
      if (t.trackId && t.trackName) trackMap.set(t.trackId, { id: t.trackId, name: t.trackName });
    }

    const ranked: any[] = [];
    const disqualified: any[] = [];
    const notSubmitted: any[] = [];

    for (const team of allTeams) {
      const teamMemberList = memberMap.get(team.teamId) ?? [];
      const project = projectByTeam.get(team.teamId) ?? null;
      const teamScores = fullScores.filter(s => project && s.projectId === project.id);
      const awardRow = awardByTeam.get(team.teamId);

      let normalizedTotal = 0;
      if (project && teamScores.length > 0) {
        const criteriaSet = new Set(teamScores.map(s => s.criteriaId));
        for (const cId of criteriaSet) {
          const cScores = teamScores.filter(s => s.criteriaId === cId);
          const avgNorm = cScores.reduce((sum, s) => sum + (normMap.get(`${s.projectId}:${s.judgeId}:${s.criteriaId}`) ?? Number(s.assessment)), 0) / cScores.length;
          const weight = Number(cScores[0].weight);
          const maxScore = Number(cScores[0].maxScore);
          if (maxScore > 0) normalizedTotal += (avgNorm / maxScore) * weight * 10;
        }
        normalizedTotal = Math.round(normalizedTotal * 10) / 10;
      }

      const perCriteria = (() => {
        const criteriaSet = new Set(teamScores.map(s => s.criteriaId));
        return Array.from(criteriaSet).map(cId => {
          const cScores = teamScores.filter(s => s.criteriaId === cId);
          return {
            criteriaId: cId,
            criteriaName: cScores[0].criteriaName,
            avgScore: Math.round(cScores.reduce((sum, s) => sum + Number(s.assessment), 0) / cScores.length * 100) / 100,
            weight: Number(cScores[0].weight),
            maxScore: Number(cScores[0].maxScore),
          };
        });
      })();

      const perJudge = (() => {
        const judgeSet = new Set(teamScores.map(s => s.judgeId));
        return Array.from(judgeSet).map(jId => {
          const jScores = teamScores.filter(s => s.judgeId === jId);
          return { judgeId: jId, judgeName: jScores[0].judgeName, rawTotal: Math.round(jScores.reduce((sum, s) => sum + Number(s.assessment), 0) * 100) / 100 };
        });
      })();

      const teamObj = {
        teamId: team.teamId, teamName: team.teamName,
        trackId: team.trackId ?? '__none__', trackName: team.trackName ?? 'Загальний',
        members: teamMemberList.map(m => ({ fullName: m.fullName, role: m.role })),
        project, normalizedTotal,
        judgeCount: new Set(teamScores.map(s => s.judgeId)).size,
        perCriteria, perJudge,
        award: awardRow ? { id: awardRow.awardId, name: awardRow.awardName, place: awardRow.awardPlace, certificate: awardRow.awardCertificate } : null,
      };

      if (team.approvalStatus === 'DISQUALIFIED') {
        disqualified.push({ ...teamObj, reason: team.approvalComment ?? 'Причину не вказано', disqualifiedAt: team.approvalAt });
      } else if (!project || project.status === 'DRAFT') {
        notSubmitted.push({ ...teamObj, reason: 'NO_PROJECT', comment: null });
      } else if (project.status === 'REJECTED') {
        notSubmitted.push({ ...teamObj, reason: 'REJECTED', comment: null });
      } else if (team.approvalStatus === 'APPROVED' || team.approvalStatus === 'PENDING') {
        ranked.push(teamObj);
      } else {
        notSubmitted.push({ ...teamObj, reason: 'NOT_SUBMITTED', comment: null });
      }
    }

    const byTrack = new Map<string, typeof ranked>();
    for (const t of ranked) {
      if (!byTrack.has(t.trackId)) byTrack.set(t.trackId, []);
      byTrack.get(t.trackId)!.push(t);
    }

    const tracks = Array.from(byTrack.entries()).map(([trackId, trackTeams]) => {
      const sorted = [...trackTeams].sort((a, b) => b.normalizedTotal - a.normalizedTotal);
      let pos = 1;
      const withPos = sorted.map((t, idx) => {
        if (idx > 0 && sorted[idx - 1].normalizedTotal !== t.normalizedTotal) pos = idx + 1;
        return { ...t, position: pos };
      });
      return { trackId, trackName: trackMap.get(trackId)?.name ?? 'Загальний', ranked: withPos };
    });

    const stats = {
      totalTeams: allTeams.length,
      approvedTeams: allTeams.filter(t => t.approvalStatus === 'APPROVED').length,
      disqualifiedTeams: disqualified.length,
      submittedProjects: submittedProjects.length,
      lateSubmissions: submittedProjects.filter(p => p.isLate).length,
      averageScore: ranked.length > 0 ? Math.round(ranked.reduce((sum, t) => sum + t.normalizedTotal, 0) / ranked.length * 10) / 10 : 0,
    };

    return { tracks, disqualified, notSubmitted, stats, hackathonAwards };
  }

  private emptyResults() {
    return { tracks: [], disqualified: [], notSubmitted: [], stats: { totalTeams: 0, approvedTeams: 0, disqualifiedTeams: 0, submittedProjects: 0, lateSubmissions: 0, averageScore: 0 }, hackathonAwards: [] };
  }

  // ── Awards ────────────────────────────────────────────────
  async listAwards(hackathonId: string) { return this.repo.listAwardsByHackathon(hackathonId); }
  async createAward(data: { hackathonId: string; name: string; place: number; description?: string }) { return this.repo.createAward(data); }
  async assignAward(teamId: string, awardId: string) { return this.repo.assignAward(teamId, awardId); }
  async removeAward(teamId: string, awardId: string) { return this.repo.removeAward(teamId, awardId); }

  /** Admin: paginated view of all conflicts across all hackathons. */
  async listAllConflicts(opts: { hackathonId?: string; page: number; limit: number }) {
    return this.repo.findAllConflicts(opts);
  }
}
