import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma, Session, User } from '@prisma/client';
import type { ClientInfo } from '../../common/http/client-info';
import { sha256 } from '../../common/security/crypto';
import { maskIp } from '../../common/utils/mask';
import { describeUserAgent } from '../../common/utils/user-agent';
import { AppConfig } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionCacheService } from './session-cache.service';
import { TokensService } from './tokens.service';

export type RotateOutcome =
  | { status: 'ok'; session: Session; refreshToken: string; user: User }
  | { status: 'reused'; userId: string; familyId: string }
  | { status: 'invalid' };

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SessionCacheService,
    private readonly tokens: TokensService,
    private readonly config: AppConfig,
  ) {}

  async create(userId: string, remember: boolean, client: ClientInfo) {
    const refreshToken = this.tokens.createRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        familyId: randomUUID(),
        tokenHash: sha256(refreshToken),
        remember,
        userAgent: client.userAgent,
        ip: client.ip,
        expiresAt: this.expiry(remember),
      },
    });
    return { session, refreshToken };
  }

  async rotate(refreshToken: string, client: ClientInfo): Promise<RotateOutcome> {
    const current = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!current) return { status: 'invalid' };

    const reused = {
      status: 'reused',
      userId: current.userId,
      familyId: current.familyId,
    } as const;
    if (current.revokedAt) {
      await this.revokeFamily(current.familyId);
      return current.replacedById ? reused : { status: 'invalid' };
    }
    if (current.expiresAt <= new Date() || current.user.status !== 'active') {
      await this.revokeFamily(current.familyId);
      return { status: 'invalid' };
    }

    const nextToken = this.tokens.createRefreshToken();
    const now = new Date();
    const next = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.session.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now, lastUsedAt: now },
      });
      if (claimed.count !== 1) return null;
      const created = await tx.session.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: sha256(nextToken),
          remember: current.remember,
          userAgent: client.userAgent,
          ip: client.ip,
          expiresAt: this.expiry(current.remember),
          lastUsedAt: now,
        },
      });
      await tx.session.update({ where: { id: current.id }, data: { replacedById: created.id } });
      return created;
    });
    this.cache.invalidate([current.id]);

    if (!next) {
      await this.revokeFamily(current.familyId);
      return reused;
    }
    return { status: 'ok', session: next, refreshToken: nextToken, user: current.user };
  }

  findById(id: string) {
    return this.prisma.session.findUnique({ where: { id } });
  }

  findActiveForUser(id: string, userId: string) {
    return this.prisma.session.findFirst({ where: { id, userId, revokedAt: null } });
  }

  async findForLogout(refreshToken: string | undefined, sid: string | null) {
    if (refreshToken) {
      const byToken = await this.prisma.session.findUnique({
        where: { tokenHash: sha256(refreshToken) },
      });
      if (byToken && !byToken.revokedAt) return byToken;
    }
    if (!sid) return null;
    const bySid = await this.findById(sid);
    return bySid && !bySid.revokedAt ? bySid : null;
  }

  async listActive(userId: string, currentSid: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((session) => ({
      id: session.id,
      userAgent: describeUserAgent(session.userAgent),
      ip: maskIp(session.ip),
      remember: session.remember,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      current: session.id === currentSid,
    }));
  }

  revokeFamily(familyId: string) {
    return this.revokeWhere({ familyId });
  }

  revokeAllForUser(userId: string) {
    return this.revokeWhere({ userId });
  }

  private async revokeWhere(where: Prisma.SessionWhereInput) {
    const rows = await this.prisma.session.findMany({
      where: { ...where, revokedAt: null },
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);
    if (ids.length) {
      await this.prisma.session.updateMany({
        where: { id: { in: ids }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    this.cache.invalidate(ids);
    return ids.length;
  }

  private expiry(remember: boolean) {
    const ttl = remember ? this.config.refreshTtlRemember : this.config.refreshTtlSession;
    return new Date(Date.now() + ttl * 1000);
  }
}
