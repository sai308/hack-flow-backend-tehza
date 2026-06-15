import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from '../config/env';

// ── Shared reusable schemas ────────────────────────────────────────────────
const ErrorSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

const UuidParam = { type: 'string', format: 'uuid' } as const;

const PaginationQuery = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
} as const;

const PaginationMeta = {
  type: 'object',
  properties: {
    total: { type: 'integer' },
    page: { type: 'integer' },
    limit: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
} as const;

export default fp(async function swaggerPlugin(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Hack-Flow API',
        description: 'REST API for the Hack-Flow hackathon management platform',
        version: '1.0.0',
        contact: { name: 'HackFlow Team', email: 'contact@hackflow.dev' },
      },
      servers: [
        { url: `http://localhost:${env.PORT}`, description: 'Local development' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        schemas: {
          Error: ErrorSchema,
          PaginationMeta,
          // ── Users ───────────────────────────────────────────────
          UserPublic: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              username: { type: 'string' },
              fullName: { type: 'string' },
              avatarUrl: { type: 'string', nullable: true },
              description: { type: 'string', nullable: true },
              isLookingForTeam: { type: 'boolean' },
              skills: { type: 'array', items: { type: 'string' } },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          // ── Hackathons ──────────────────────────────────────────
          Hackathon: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              title: { type: 'string' },
              subtitle: { type: 'string', nullable: true },
              description: { type: 'string', nullable: true },
              location: { type: 'string', nullable: true },
              online: { type: 'boolean' },
              startDate: { type: 'string', format: 'date-time' },
              endDate: { type: 'string', format: 'date-time' },
              minTeamSize: { type: 'integer' },
              maxTeamSize: { type: 'integer' },
              status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
              banner: { type: 'string', nullable: true },
              tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } },
              activeStage: { nullable: true, $ref: '#/components/schemas/Stage' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          Stage: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              hackathonId: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              orderIndex: { type: 'integer' },
              startDate: { type: 'string', format: 'date-time' },
              endDate: { type: 'string', format: 'date-time' },
            },
          },
          Track: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              hackathonId: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
            },
          },
          Tag: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
            },
          },
          // ── Teams ───────────────────────────────────────────────
          Team: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              logo: { type: 'string', nullable: true },
              hackathonId: { type: 'string', format: 'uuid' },
              trackId: { type: 'string', format: 'uuid', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          TeamMember: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              teamId: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              role: { type: 'string', enum: ['captain', 'participant'] },
              joinedAt: { type: 'string', format: 'date-time' },
            },
          },
          // ── Projects ────────────────────────────────────────────
          Project: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              teamId: { type: 'string', format: 'uuid' },
              stageId: { type: 'string', format: 'uuid' },
              status: { type: 'string', enum: ['DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'REJECTED'] },
              submittedAt: { type: 'string', format: 'date-time', nullable: true },
              comment: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          ProjectResource: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              projectId: { type: 'string', format: 'uuid' },
              url: { type: 'string' },
              description: { type: 'string', nullable: true },
            },
          },
          // ── Judging ─────────────────────────────────────────────
          Criteria: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              trackId: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              maxScore: { type: 'number' },
              weight: { type: 'number' },
            },
          },
          Score: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              projectId: { type: 'string', format: 'uuid' },
              judgeId: { type: 'string', format: 'uuid' },
              criteriaId: { type: 'string', format: 'uuid' },
              score: { type: 'number' },
              comment: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          // ── Mentorship ──────────────────────────────────────────
          MentorAvailability: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              mentorId: { type: 'string', format: 'uuid' },
              hackathonId: { type: 'string', format: 'uuid', nullable: true },
              trackId: { type: 'string', format: 'uuid', nullable: true },
              startDatetime: { type: 'string', format: 'date-time' },
              endDatetime: { type: 'string', format: 'date-time' },
            },
          },
          MentorSlot: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              mentorAvailabilityId: { type: 'string', format: 'uuid' },
              teamId: { type: 'string', format: 'uuid' },
              startDatetime: { type: 'string', format: 'date-time' },
              durationMinute: { type: 'integer' },
              status: { type: 'string', enum: ['booked', 'completed', 'cancelled'] },
              meetingLink: { type: 'string', nullable: true },
            },
          },
          // ── Awards ──────────────────────────────────────────────
          Award: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              hackathonId: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              place: { type: 'integer' },
              certificate: { type: 'string', nullable: true },
              description: { type: 'string', nullable: true },
            },
          },
          // ── JudgeTrack ──────────────────────────────────────────
          JudgeTrack: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              trackId: { type: 'string', format: 'uuid' },
              hackathonId: { type: 'string', format: 'uuid' },
              isHeadJudge: { type: 'boolean' },
              assignedAt: { type: 'string', format: 'date-time' },
            },
          },
          // ── Auth ────────────────────────────────────────────────
          AuthTokens: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              user: { $ref: '#/components/schemas/UserPublic' },
            },
          },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'Auth', description: 'Authentication — register, login, token refresh, password reset' },
        { name: 'Users', description: 'User profiles, matchmaking, social links' },
        { name: 'Hackathons', description: 'Hackathon lifecycle, tracks, stages, status transitions' },
        { name: 'Teams', description: 'Team creation, membership, invites, approvals' },
        { name: 'Projects', description: 'Project submissions and review workflow' },
        { name: 'Judging', description: 'Scoring criteria, scores, conflicts, leaderboard' },
        { name: 'Mentorship', description: 'Mentor availability windows and slot booking' },
        { name: 'Awards', description: 'Hackathon awards, physical gifts, team award assignments' },
        { name: 'JudgeTrack', description: 'Judge-to-track assignments within a hackathon' },
        { name: 'Team Stage', description: 'Moving teams between hackathon stages' },
        { name: 'Tags', description: 'Global tag management and hackathon tag filtering' },
        { name: 'Health', description: 'Server health checks' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: true,
  });
});

// Exported for reuse in route files
export { ErrorSchema, UuidParam, PaginationQuery, PaginationMeta };
