import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  pgEnum,
  decimal,
  jsonb,
  unique,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Enums ────────────────────────────────────────────────────

export const tokenTypeEnum = pgEnum('token_type', [
  'EMAIL_CONFIRM',
  'PASSWORD_RESET',
  'CHANGE_EMAIL',
  'TWO_FACTOR',
  'GITHUB',
  'REFRESH',
]);

export const socialTypeEnum = pgEnum('social_type', ['discord', 'telegram', 'viber', 'github']);

export const roleNameEnum = pgEnum('role_name', ['admin', 'judge', 'mentor', 'participant', 'organizer']);

export const teamMemberRoleEnum = pgEnum('team_member_role', ['captain', 'participant']);

export const approvalStatusEnum = pgEnum('approval_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'DISQUALIFIED',
]);

export const joinRequestStatusEnum = pgEnum('join_request_status', [
  'pending',
  'accepted',
  'rejected',
]);

export const projectStatusEnum = pgEnum('project_status', [
  'DRAFT',
  'SUBMITTED',
  'REVIEWED',
  'APPROVED',
  'REJECTED',
]);

export const mentorAvailabilityStatusEnum = pgEnum('mentor_availability_status', [
  'available',
  'blocked',
]);

export const mentorRequestStatusEnum = pgEnum('mentor_request_status', [
  'pending',
  'accepted',
  'rejected',
  'completed',
  'cancelled',
  'blocked',
]);

// ── Users ─────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  description: text('description'),
  // ── Matchmaking ──────────────────────────────────────
  isLookingForTeam: boolean('is_looking_for_team').default(false).notNull(),
  skills: jsonb('skills').$type<string[]>().default([]),
  // ── Soft delete ───────────────────────────────────────
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userTokens = pgTable('user_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  type: tokenTypeEnum('type').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userSocials = pgTable('user_socials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  typeSocial: socialTypeEnum('type_social').notNull(),
  url: text('url').notNull(),
});

// ── Roles ─────────────────────────────────────────────────────

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: roleNameEnum('name').notNull().unique(),
});

export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  hackathonId: uuid('hackathon_id').references(() => hackathons.id, { onDelete: 'set null' }),
});

// ── Student Context ───────────────────────────────────────────

export const specialties = pgTable('specialties', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const studentGroups = pgTable('student_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  specialtiesId: uuid('specialties_id')
    .notNull()
    .references(() => specialties.id),
});

export const studentInformation = pgTable('student_information', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id')
    .notNull()
    .references(() => studentGroups.id),
});

// ── Hackathons ────────────────────────────────────────────────

export const hackathons = pgTable('hackathons', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  subtitle: varchar('subtitle', { length: 500 }),
  description: text('description'),
  location: varchar('location', { length: 255 }),
  online: boolean('online').default(false).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  minTeamSize: integer('min_team_size').default(1).notNull(),
  maxTeamSize: integer('max_team_size').default(5).notNull(),
  banner: text('banner'),
  rulesUrl: text('rules_url'),
  contactEmail: varchar('contact_email', { length: 255 }),
  status: varchar('status', { length: 20 }).$type<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>().notNull().default('DRAFT'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const stageTypeEnum = pgEnum('stage_type', [
  'REGISTRATION',
  'HACKING',
  'PRESENTATION',
  'JUDGING',
  'FINISHED',
  'CUSTOM',
]);

export const stages = pgTable('stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  hackathonId: uuid('hackathon_id')
    .notNull()
    .references(() => hackathons.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  type: stageTypeEnum('type').notNull().default('CUSTOM'),
  orderIndex: integer('order_index').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  description: text('description'),
});

export const tracks = pgTable('tracks', {
  id: uuid('id').primaryKey().defaultRandom(),
  hackathonId: uuid('hackathon_id')
    .notNull()
    .references(() => hackathons.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  guidelines: text('guidelines'),
  allowedTechnologies: text('allowed_technologies'),
  expectedOutcome: text('expected_outcome'),
  externalUrl: varchar('external_url', { length: 500 }),
});

// ── Awards ────────────────────────────────────────────────────

export const awards = pgTable('awards', {
  id: uuid('id').primaryKey().defaultRandom(),
  hackathonId: uuid('hackathon_id')
    .notNull()
    .references(() => hackathons.id, { onDelete: 'cascade' }),
  certificate: text('certificate'),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  place: integer('place').notNull(),
});

export const physicalGifts = pgTable('physical_gifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  awardId: uuid('award_id')
    .notNull()
    .references(() => awards.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  image: text('image'),
});

export const teamAwards = pgTable('team_awards', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  awardId: uuid('award_id')
    .notNull()
    .references(() => awards.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
});

export const teamStage = pgTable('team_stage', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  stageId: uuid('stage_id')
    .notNull()
    .references(() => stages.id, { onDelete: 'cascade' }),
  enteredAt: timestamp('entered_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Teams ─────────────────────────────────────────────────────

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  logo: text('logo'),
  trackId: uuid('track_id').references(() => tracks.id, { onDelete: 'set null' }),
  hackathonId: uuid('hackathon_id')
    .notNull()
    .references(() => hackathons.id, { onDelete: 'cascade' }),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const teamApprovals = pgTable('team_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  status: approvalStatusEnum('status').default('PENDING').notNull(),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at'),
  comment: text('comment'),
});

export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: teamMemberRoleEnum('role').default('participant').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

export const teamInvites = pgTable('team_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  maxUses: integer('max_uses').default(10).notNull(),
  usesCount: integer('uses_count').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const teamJoinRequests = pgTable('team_join_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  message: text('message'),
  status: joinRequestStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Projects ──────────────────────────────────────────────────

export const projectResourceTypes = pgTable('project_resource_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  stageId: uuid('stage_id')
    .notNull()
    .references(() => stages.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }),
  description: text('description'),
  status: projectStatusEnum('status').default('DRAFT').notNull(),
  submittedAt: timestamp('submitted_at'),
  submittedLateByMinutes: integer('submitted_late_by_minutes'),
  reviewedAt: timestamp('reviewed_at'),
  comment: text('comment'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projectResources = pgTable('project_resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  projectTypeId: uuid('project_type_id')
    .notNull()
    .references(() => projectResourceTypes.id),
  url: text('url').notNull(),
  description: text('description'),
});

// ── Mentorship ────────────────────────────────────────────────

export const mentorAvailabilities = pgTable('mentor_availabilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  mentorId: uuid('mentor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  hackathonId: uuid('hackathon_id').references(() => hackathons.id, { onDelete: 'set null' }),
  trackId: uuid('track_id').references(() => tracks.id, { onDelete: 'set null' }),
  startDatetime: timestamp('start_datetime').notNull(),
  endDatetime: timestamp('end_datetime').notNull(),
  slotDuration: integer('slot_duration').notNull().default(30),
  status: mentorAvailabilityStatusEnum('status').default('available').notNull(),
});

export const mentorRequests = pgTable('mentor_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  mentorAvailabilityId: uuid('mentor_availability_id')
    .notNull()
    .references(() => mentorAvailabilities.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id')
    .references(() => teams.id, { onDelete: 'cascade' }),
  startDatetime: timestamp('start_datetime').notNull(),
  durationMinute: integer('duration_minute').notNull(),
  message: text('message'),
  status: mentorRequestStatusEnum('status').default('pending').notNull(),
  meetingLink: text('meeting_link'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Judging ───────────────────────────────────────────────────

export const criteria = pgTable('criteria', {
  id: uuid('id').primaryKey().defaultRandom(),
  trackId: uuid('track_id')
    .notNull()
    .references(() => tracks.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  weight: decimal('weight', { precision: 5, scale: 2 }).notNull(),
  maxScore: decimal('max_score', { precision: 5, scale: 2 }).notNull(),
});

export const scores = pgTable('scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  judgeId: uuid('judge_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  criteriaId: uuid('criteria_id')
    .notNull()
    .references(() => criteria.id, { onDelete: 'cascade' }),
  assessment: decimal('assessment', { precision: 5, scale: 2 }).notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const judgeConflicts = pgTable('judge_conflicts', {
  id: uuid('id').primaryKey().defaultRandom(),
  judgeId: uuid('judge_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Hackathon Tags ───────────────────────────────────────────

export const hackathonTags = pgTable('hackathon_tags', {
  id:   uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull().unique(),
});

export const hackathonTagRelations = pgTable('hackathon_tag_relations', {
  hackathonId: uuid('hackathon_id')
    .notNull()
    .references(() => hackathons.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id')
    .notNull()
    .references(() => hackathonTags.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.hackathonId, t.tagId] }),
}));

// ── Judge Track ───────────────────────────────────────────────

export const judgeTrack = pgTable('judge_track', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  trackId:     uuid('track_id').notNull().references(() => tracks.id, { onDelete: 'cascade' }),
  hackathonId: uuid('hackathon_id').notNull().references(() => hackathons.id, { onDelete: 'cascade' }),
  isHeadJudge: boolean('is_head_judge').notNull().default(false),
  assignedAt:  timestamp('assigned_at').notNull().defaultNow(),
  assignedBy:  uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => ({
  uniqueUserTrack: unique().on(t.userId, t.trackId),
}));

// ── Mentor Track ──────────────────────────────────────────────

export const mentorTrack = pgTable('mentor_track', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  trackId:     uuid('track_id').notNull().references(() => tracks.id, { onDelete: 'cascade' }),
  hackathonId: uuid('hackathon_id').notNull().references(() => hackathons.id, { onDelete: 'cascade' }),
  assignedAt:  timestamp('assigned_at').notNull().defaultNow(),
  assignedBy:  uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => ({
  uniqueMentorTrack: unique().on(t.userId, t.trackId),
}));

// ── Audit Log ─────────────────────────────────────────────────

export const userActionLogs = pgTable('user_action_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 100 }).notNull(),
  entity: varchar('entity', { length: 100 }).notNull(),
  entityId: uuid('entity_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Relations ────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  tokens: many(userTokens),
  socials: many(userSocials),
  roles: many(userRoles),
  teamMemberships: many(teamMembers),
  scores: many(scores),
  conflicts: many(judgeConflicts),
  mentorAvailabilities: many(mentorAvailabilities),
  actionLogs: many(userActionLogs),
}));

export const hackathonsRelations = relations(hackathons, ({ many }) => ({
  stages: many(stages),
  tracks: many(tracks),
  teams: many(teams),
  awards: many(awards),
  userRoles: many(userRoles),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  hackathon: one(hackathons, { fields: [teams.hackathonId], references: [hackathons.id] }),
  track: one(tracks, { fields: [teams.trackId], references: [tracks.id] }),
  members: many(teamMembers),
  invites: many(teamInvites),
  approvals: many(teamApprovals),
  projects: many(projects),
  joinRequests: many(teamJoinRequests),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  team: one(teams, { fields: [projects.teamId], references: [teams.id] }),
  stage: one(stages, { fields: [projects.stageId], references: [stages.id] }),
  resources: many(projectResources),
  scores: many(scores),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const teamApprovalsRelations = relations(teamApprovals, ({ one }) => ({
  team: one(teams, { fields: [teamApprovals.teamId], references: [teams.id] }),
  reviewer: one(users, { fields: [teamApprovals.approvedBy], references: [users.id] }),
}));

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  hackathon: one(hackathons, { fields: [tracks.hackathonId], references: [hackathons.id] }),
  teams: many(teams),
}));

export const stagesRelations = relations(stages, ({ one, many }) => ({
  hackathon: one(hackathons, { fields: [stages.hackathonId], references: [hackathons.id] }),
  projects: many(projects),
}));

export const awardsRelations = relations(awards, ({ one }) => ({
  hackathon: one(hackathons, { fields: [awards.hackathonId], references: [hackathons.id] }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
  hackathon: one(hackathons, { fields: [userRoles.hackathonId], references: [hackathons.id] }),
}));

export const userTokensRelations = relations(userTokens, ({ one }) => ({
  user: one(users, { fields: [userTokens.userId], references: [users.id] }),
}));

export const userSocialsRelations = relations(userSocials, ({ one }) => ({
  user: one(users, { fields: [userSocials.userId], references: [users.id] }),
}));

export const scoresRelations = relations(scores, ({ one }) => ({
  judge: one(users, { fields: [scores.judgeId], references: [users.id] }),
  project: one(projects, { fields: [scores.projectId], references: [projects.id] }),
}));

export const judgeConflictsRelations = relations(judgeConflicts, ({ one }) => ({
  user: one(users, { fields: [judgeConflicts.judgeId], references: [users.id] }),
}));

export const mentorAvailabilitiesRelations = relations(mentorAvailabilities, ({ one, many }) => ({
  mentor: one(users, { fields: [mentorAvailabilities.mentorId], references: [users.id] }),
  track: one(tracks, { fields: [mentorAvailabilities.trackId], references: [tracks.id] }),
  hackathon: one(hackathons, { fields: [mentorAvailabilities.hackathonId], references: [hackathons.id] }),
  slots: many(mentorRequests),
}));

export const mentorRequestsRelations = relations(mentorRequests, ({ one }) => ({
  availability: one(mentorAvailabilities, { fields: [mentorRequests.mentorAvailabilityId], references: [mentorAvailabilities.id] }),
  team: one(teams, { fields: [mentorRequests.teamId], references: [teams.id] }),
}));

export const userActionLogsRelations = relations(userActionLogs, ({ one }) => ({
  user: one(users, { fields: [userActionLogs.userId], references: [users.id] }),
}));

export const teamInvitesRelations = relations(teamInvites, ({ one }) => ({
  team: one(teams, { fields: [teamInvites.teamId], references: [teams.id] }),
}));

export const projectResourcesRelations = relations(projectResources, ({ one }) => ({
  project: one(projects, { fields: [projectResources.projectId], references: [projects.id] }),
}));

export const teamJoinRequestsRelations = relations(teamJoinRequests, ({ one }) => ({
  team: one(teams, { fields: [teamJoinRequests.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamJoinRequests.userId], references: [users.id] }),
}));
