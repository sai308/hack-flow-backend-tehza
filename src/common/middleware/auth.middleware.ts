import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../errors/http-errors';

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

/**
 * Verifies JWT and attaches the decoded payload to request.user.
 * Relies on @fastify/jwt being registered on the app instance.
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify<JwtPayload>();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/**
 * Optional JWT verification — does NOT throw if token is absent/invalid.
 * Allows public access while still populating request.user when a token IS present.
 * Used on endpoints like GET /hackathons where both public and authenticated users call them.
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify<JwtPayload>();
  } catch {
    // No token or invalid — proceed as unauthenticated (request.user remains undefined)
  }
}

/**
 * Role-based guard factory.
 * Usage: { preHandler: authorize('admin', 'judge') }
 */
export function authorize(...requiredRoles: string[]) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const user = request.user as JwtPayload | undefined;
    if (!user) throw new UnauthorizedError();

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    if (!hasRole) {
      throw new UnauthorizedError('Insufficient permissions');
    }
  };
}

// JwtPayload is cast at the call site: (request.user as JwtPayload)
