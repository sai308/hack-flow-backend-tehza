import type { Database } from '../../config/database';
import { users, userTokens, userRoles, roles } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import type { RegisterDto } from './auth.schema';

// Full union of storable token types
type StorableTokenType = typeof userTokens.$inferSelect['type'];

export class AuthRepository {
  constructor(private readonly db: Database) {}

  async findUserByEmail(email: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }

  async findUserByUsername(username: string) {
    const [user] = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return user ?? null;
  }

  async createUser(data: Omit<RegisterDto, 'password'> & { passwordHash: string }) {
    const [user] = await this.db
      .insert(users)
      .values({
        email: data.email,
        username: data.username,
        fullName: data.fullName,
        passwordHash: data.passwordHash,
      })
      .returning();
    return user;
  }

  async createToken(data: {
    userId: string;
    token: string;
    type: StorableTokenType;
    expiresAt: Date;
  }) {
    const [record] = await this.db.insert(userTokens).values(data).returning();
    return record;
  }

  /** Persist a refresh token string so we can validate it on rotation. */
  async saveRefreshToken(userId: string, token: string, expiresAt: Date) {
    await this.db
      .insert(userTokens)
      .values({ userId, token, type: 'REFRESH', expiresAt, used: false });
  }

  /** Look up a stored refresh token record. */
  async findRefreshToken(token: string) {
    const [record] = await this.db
      .select()
      .from(userTokens)
      .where(and(eq(userTokens.token, token), eq(userTokens.type, 'REFRESH')))
      .limit(1);
    return record ?? null;
  }

  /** Hard-delete the refresh token record (invalidate it). */
  async deleteRefreshToken(id: string) {
    await this.db.delete(userTokens).where(eq(userTokens.id, id));
  }

  async findToken(token: string, type: typeof userTokens.$inferSelect.type) {
    const [record] = await this.db
      .select()
      .from(userTokens)
      .where(and(eq(userTokens.token, token), eq(userTokens.type, type)))
      .limit(1);
    return record ?? null;
  }

  async markTokenUsed(id: string) {
    await this.db.update(userTokens).set({ used: true }).where(eq(userTokens.id, id));
  }

  async updateUserPassword(userId: string, passwordHash: string) {
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  }

  async findUserRoles(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
    return rows.map((r) => r.name);
  }
}
