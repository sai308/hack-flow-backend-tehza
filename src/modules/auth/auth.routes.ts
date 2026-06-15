import type { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { AuditLogRepository } from '../audit-log/audit-log.repository';
import { getDatabaseConnection } from '../../config/database';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabaseConnection();
  const repository = new AuthRepository(db);
  const auditLog = new AuditLogRepository(db);
  const service = new AuthService(repository, app, auditLog);
  const controller = new AuthController(service);

  app.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Register a new user',
      security: [],
      body: {
        type: 'object',
        required: ['email', 'username', 'fullName', 'password'],
        properties: {
          email: { type: 'string', format: 'email', description: 'Must be unique' },
          username: { type: 'string', minLength: 3, maxLength: 30, description: 'Must be unique' },
          fullName: { type: 'string', minLength: 2, maxLength: 100 },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, (req, reply) => controller.register(req, reply));

  app.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login with email and password',
      security: [],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, (req, reply) => controller.login(req, reply));

  app.post('/forgot-password', {
    schema: {
      tags: ['Auth'],
      summary: 'Request a password reset link',
      description: 'Always returns 200 to prevent user-existence enumeration.',
      security: [],
      body: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
    },
  }, (req, reply) => controller.forgotPassword(req, reply));

  app.post('/reset-password', {
    schema: {
      tags: ['Auth'],
      summary: 'Reset password using a token',
      security: [],
      body: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token: { type: 'string', description: 'Token received via email' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, (req, reply) => controller.resetPassword(req, reply));

  app.post('/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Rotate refresh token — get a new access + refresh pair',
      description:
        'Pass the refresh token as `Authorization: Bearer <token>` **or** in the JSON body as `{ "refreshToken": "..." }`. ' +
        'The old token is immediately invalidated (single-use). Returns new access token (15 min) and refresh token (7 days).',
      security: [],
    },
  }, (req, reply) => controller.refresh(req, reply));
}
