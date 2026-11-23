import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { FastifyReply } from 'fastify';
import type { AuthUser } from '../../common/auth-user';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/http/client-info';
import { AuditService } from '../audit/audit.service';
import { PublicUser, toPublicUser, UsersService } from '../users/users.service';
import { AuthCookies } from './auth-cookies.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { SessionCacheService } from './session-cache.service';
import { SessionsService } from './sessions.service';
import { TokensService } from './tokens.service';

export interface AuthResult {
  user: PublicUser;
  expiresAt: string;
  csrfToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly cache: SessionCacheService,
    private readonly tokens: TokensService,
    private readonly cookies: AuthCookies,
    private readonly attempts: LoginAttemptsService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, client: ClientInfo, reply: FastifyReply): Promise<AuthResult> {
    const user = await this.users.findByLogin(dto.username);
    if (!user) {
      await this.passwords.verifyDummy(dto.password);
      await this.audit.log('LOGIN_FAILED', client, { meta: { reason: 'unknown_account' } });
      throw Errors.invalidCredentials();
    }

    const lockedFor = this.attempts.remainingLock(user);
    if (lockedFor > 0) {
      await this.passwords.verifyDummy(dto.password);
      await this.audit.log('LOGIN_FAILED', client, { userId: user.id, meta: { reason: 'locked' } });
      throw Errors.accountLocked(lockedFor);
    }

    if (!(await this.passwords.verify(user.passwordHash, dto.password))) {
      throw await this.attempts.registerFailure(user.id, client);
    }

    if (user.status !== 'active') {
      await this.audit.log('LOGIN_FAILED', client, {
        userId: user.id,
        meta: { reason: `status_${user.status}` },
      });
      throw Errors.accountDisabled();
    }

    const rehashed = await this.passwords.rehashIfNeeded(user.passwordHash, dto.password);
    const fresh = await this.users.markLoginSuccess(user.id, rehashed);
    const { sessionId, result } = await this.issue(fresh, dto.remember ?? false, client, reply);
    await this.audit.log('LOGIN_SUCCESS', client, { userId: user.id, meta: { sessionId } });
    return result;
  }

  async refresh(refreshToken: string | undefined, client: ClientInfo, reply: FastifyReply) {
    if (!refreshToken) {
      this.cookies.clear(reply);
      throw Errors.sessionExpired();
    }
    const outcome = await this.sessions.rotate(refreshToken, client);
    if (outcome.status === 'ok') {
      const { session, user } = outcome;
      return this.respond(user, session.id, outcome.refreshToken, session.remember, reply);
    }
    this.cookies.clear(reply);
    if (outcome.status === 'reused') {
      await this.audit.log('TOKEN_REUSE_DETECTED', client, {
        userId: outcome.userId,
        meta: { familyId: outcome.familyId },
      });
      throw Errors.refreshReused();
    }
    throw Errors.sessionExpired();
  }

  async logout(
    refreshToken: string | undefined,
    accessToken: string | undefined,
    client: ClientInfo,
    reply: FastifyReply,
  ) {
    const payload = accessToken ? await this.tokens.verifyAccess(accessToken, true) : null;
    const session = await this.sessions.findForLogout(refreshToken, payload?.sid ?? null);
    if (session) {
      await this.sessions.revokeFamily(session.familyId);
      await this.audit.log('LOGOUT', client, {
        userId: session.userId,
        meta: { sessionId: session.id },
      });
    }
    this.cookies.clear(reply);
  }

  async logoutAll(user: AuthUser, client: ClientInfo, reply: FastifyReply) {
    const revoked = await this.sessions.revokeAllForUser(user.id);
    await this.audit.log('LOGOUT_ALL', client, { userId: user.id, meta: { revoked } });
    this.cookies.clear(reply);
  }

  async me(user: AuthUser): Promise<PublicUser> {
    const account = await this.users.findById(user.id);
    if (!account) throw Errors.unauthenticated();
    return toPublicUser(account);
  }

  listSessions(user: AuthUser) {
    return this.sessions.listActive(user.id, user.sid);
  }

  async revokeSession(user: AuthUser, id: string, client: ClientInfo, reply: FastifyReply) {
    const session = await this.sessions.findActiveForUser(id, user.id);
    if (!session) throw Errors.sessionNotFound();
    await this.sessions.revokeFamily(session.familyId);
    await this.audit.log('SESSION_REVOKED', client, { userId: user.id, meta: { sessionId: id } });
    if (session.id === user.sid) this.cookies.clear(reply);
  }

  async changePassword(
    user: AuthUser,
    dto: ChangePasswordDto,
    client: ClientInfo,
    reply: FastifyReply,
  ): Promise<AuthResult> {
    const account = await this.users.findById(user.id);
    if (!account) throw Errors.unauthenticated();
    if (!(await this.passwords.verify(account.passwordHash, dto.currentPassword))) {
      throw Errors.wrongCurrentPassword();
    }
    if (dto.currentPassword === dto.newPassword) throw Errors.passwordReused();

    const current = await this.sessions.findById(user.sid);
    const updated = await this.users.setPassword(
      account.id,
      await this.passwords.hash(dto.newPassword),
    );
    const revoked = await this.sessions.revokeAllForUser(account.id);
    this.cache.invalidateUser(account.id);
    await this.audit.log('PASSWORD_CHANGED', client, { userId: account.id, meta: { revoked } });

    const { result } = await this.issue(updated, current?.remember ?? false, client, reply);
    return result;
  }

  private async issue(user: User, remember: boolean, client: ClientInfo, reply: FastifyReply) {
    const { session, refreshToken } = await this.sessions.create(user.id, remember, client);
    const result = await this.respond(user, session.id, refreshToken, remember, reply);
    return { sessionId: session.id, result };
  }

  private async respond(
    user: User,
    sid: string,
    refreshToken: string,
    remember: boolean,
    reply: FastifyReply,
  ): Promise<AuthResult> {
    const access = await this.tokens.signAccess(user, sid);
    const csrfToken = this.tokens.createCsrfToken();
    this.cookies.set(reply, { accessToken: access.token, refreshToken, csrfToken, remember });
    return { user: toPublicUser(user), expiresAt: access.expiresAt.toISOString(), csrfToken };
  }
}
