import { AuthRepository } from './auth.repository';
import { hashPassword, verifyPassword } from '../../utils/password';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../common/errors/http-errors';
import type { RegisterDto, LoginDto } from './auth.schema';
import type { FastifyInstance } from 'fastify';
import { generateId } from '../../utils/uuid';
import type { JwtPayload } from '../../common/middleware/auth.middleware';
import { env } from '../../config/env';
import type { AuditLogRepository } from '../audit-log/audit-log.repository';
import { sendPasswordResetEmail } from '../../services/email.service';

// 7-day TTL in milliseconds (mirrors JWT_REFRESH_EXPIRES_IN default)
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly app: FastifyInstance,
    private readonly auditLog?: AuditLogRepository,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string; refreshToken: string }> {
    const existingEmail = await this.authRepository.findUserByEmail(dto.email);
    if (existingEmail) throw new ConflictError('Email is already in use');

    const existingUsername = await this.authRepository.findUserByUsername(dto.username);
    if (existingUsername) throw new ConflictError('Username is already taken');

    const passwordHash = await hashPassword(dto.password);

    const user = await this.authRepository.createUser({
      email: dto.email,
      username: dto.username,
      fullName: dto.fullName,
      passwordHash,
    });

    const userRoles = await this.authRepository.findUserRoles(user.id);
    this.auditLog?.log(user.id, 'register', 'user', user.id).catch(() => undefined);
    const tokens = this.generateTokenPair({ sub: user.id, email: user.email, roles: userRoles });
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; user?: any }> {
    const user = await this.authRepository.findUserByEmail(dto.email);
    if (!user) throw new UnauthorizedError('Invalid credentials');

    // Block soft-deleted users
    if (user.deletedAt) throw new UnauthorizedError('Account has been deactivated');

    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    const userRoles = await this.authRepository.findUserRoles(user.id);
    this.auditLog?.log(user.id, 'login', 'user', user.id).catch(() => undefined);
    const tokens = this.generateTokenPair({ sub: user.id, email: user.email, roles: userRoles });
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    
    const safeUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: userRoles[0] || 'participant'
    };
    
    return { ...tokens, user: safeUser };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) return; // Silent — don't leak user existence

    const token = generateId();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await this.authRepository.createToken({
      userId: user.id,
      token,
      type: 'PASSWORD_RESET',
      expiresAt,
    });

    // Send password reset email — fire-and-forget.
    // sendPasswordResetEmail swallows its own errors; we must never surface
    // SMTP failures to the caller (would allow email enumeration).
    void sendPasswordResetEmail(user.email, token);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.authRepository.findToken(token, 'PASSWORD_RESET');
    if (!record || record.used || record.expiresAt < new Date()) {
      throw new NotFoundError('Reset token is invalid or expired');
    }

    const passwordHash = await hashPassword(newPassword);
    await this.authRepository.updateUserPassword(record.userId, passwordHash);
    await this.authRepository.markTokenUsed(record.id);
  }

  // ── Token Refresh ─────────────────────────────────────────
  /**
   * Rotates a refresh token:
   *  1. Verifies the JWT signature (rejects tampered/wrong-secret tokens)
   *  2. Looks up the stored record in user_tokens (rejects replayed tokens)
   *  3. Checks not already used and not past DB expiry
   *  4. Deletes the old record (single-use enforcement)
   *  5. Issues a brand-new access + refresh pair and persists the new refresh token
   */
  async refresh(rawToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    // Step 1 — verify signature & expiry via JWT lib
    let payload: JwtPayload;
    try {
      payload = this.app.jwt.verify<JwtPayload>(rawToken);
    } catch {
      throw new UnauthorizedError('Refresh token is invalid or expired');
    }

    // Step 2 — confirm the token is stored (i.e. was actually issued by us)
    const record = await this.authRepository.findRefreshToken(rawToken);
    if (!record) {
      throw new UnauthorizedError('Refresh token not recognised — please log in again');
    }

    // Step 3 — guard against already-used and DB-level expiry
    if (record.used) {
      throw new UnauthorizedError('Refresh token has already been used');
    }
    if (record.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    // Step 4 — invalidate old token (hard delete = cannot be replayed)
    await this.authRepository.deleteRefreshToken(record.id);

    // Step 5 — fetch current roles so JWT reflects any role changes since last login
    const roles = await this.authRepository.findUserRoles(payload.sub);
    const newPayload: JwtPayload = { sub: payload.sub, email: payload.email, roles };
    const tokens = this.generateTokenPair(newPayload);

    // Persist the new refresh token
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await this.authRepository.saveRefreshToken(payload.sub, tokens.refreshToken, expiresAt);

    this.auditLog?.log(payload.sub, 'refresh_token', 'user', payload.sub).catch(() => undefined);
    return tokens;
  }

  private generateTokenPair(payload: JwtPayload): { accessToken: string; refreshToken: string } {
    const accessToken = this.app.jwt.sign(payload, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
    // Add a jti (JWT ID) so every refresh token is a unique string even if
    // issued within the same second (same iat). This prevents the unique-constraint
    // collision that would cause onConflict to silently drop the insert.
    const jti = generateId();
    const refreshToken = this.app.jwt.sign({ ...payload, jti }, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });
    return { accessToken, refreshToken };
  }

  /**
   * Persists the refresh token that was just issued at login/register.
   * Called after generateTokenPair so the token exists in the DB for future rotation.
   */
  async persistRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await this.authRepository.saveRefreshToken(userId, refreshToken, expiresAt);
  }
}

