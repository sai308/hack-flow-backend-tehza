import Fastify from 'fastify';
import path from 'path';
import fastifyStatic from '@fastify/static';
import { env } from './config/env';
import { registerErrorHandler } from './common/middleware/error-handler';
import swaggerPlugin from './plugins/swagger';
import jwtPlugin from './plugins/jwt';
import securityPlugin from './plugins/security';

// Module routes
import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';
import { hackathonsRoutes } from './modules/hackathons/hackathons.routes';
import { teamsRoutes } from './modules/teams/teams.routes';
import { projectsRoutes } from './modules/projects/projects.routes';
import { judgingRoutes } from './modules/judging/judging.routes';
import { mentorshipRoutes } from './modules/mentorship/mentorship.routes';
import { awardsRoutes } from './modules/awards/awards.routes';
import { teamStageRoutes } from './modules/team-stage/team-stage.routes';
import { healthRoutes } from './modules/health/health.routes';
import { judgeTrackRoutes } from './modules/judge-track/judge-track.routes';
import { hackathonTagsRoutes } from './modules/hackathon-tags/hackathon-tags.routes';
import { mentorTrackRoutes } from './modules/mentor-track/mentor-track.routes';

export async function buildApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
          : undefined,
    },
    ajv: {
      customOptions: {
        removeAdditional: 'all',
        useDefaults: true,
        coerceTypes: true,
      },
    },
  });

  // ── Plugins ───────────────────────────────────────────────
  await app.register(swaggerPlugin);
  await app.register(jwtPlugin);
  await app.register(securityPlugin);

  // ── Error handler ─────────────────────────────────────────
  registerErrorHandler(app);

  // ── Routes ────────────────────────────────────────────────
  await app.register(healthRoutes, { prefix: `${env.API_PREFIX}/health` });
  await app.register(authRoutes, { prefix: `${env.API_PREFIX}/auth` });
  await app.register(usersRoutes, { prefix: `${env.API_PREFIX}/users` });
  await app.register(hackathonsRoutes, { prefix: `${env.API_PREFIX}/hackathons` });
  await app.register(teamsRoutes, { prefix: `${env.API_PREFIX}/teams` });
  await app.register(projectsRoutes, { prefix: `${env.API_PREFIX}/projects` });
  await app.register(judgingRoutes, { prefix: `${env.API_PREFIX}/judging` });
  await app.register(mentorshipRoutes, { prefix: `${env.API_PREFIX}/mentorship` });
  await app.register(awardsRoutes, { prefix: env.API_PREFIX });
  await app.register(teamStageRoutes, { prefix: env.API_PREFIX });
  await app.register(judgeTrackRoutes, { prefix: env.API_PREFIX });
  await app.register(mentorTrackRoutes, { prefix: env.API_PREFIX });
  await app.register(hackathonTagsRoutes, { prefix: env.API_PREFIX });

  // ── Frontend Static Serving ───────────────────────────────
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '../../frontend/admin/dist'),
    prefix: '/admin/',
    decorateReply: false, // In case swagger-ui also uses fastify-static
  });

  return app;
}
