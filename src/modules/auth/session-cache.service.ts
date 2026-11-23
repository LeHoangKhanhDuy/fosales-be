import { Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface SessionState {
  userId: string;
  active: boolean;
  role: Role;
  storeId: string;
  passwordChangedAtSec: number;
}

const TTL_MS = 15_000;
const MAX_ENTRIES = 10_000;

@Injectable()
export class SessionCacheService {
  private readonly entries = new Map<string, { state: SessionState | null; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get(sid: string): Promise<SessionState | null> {
    const hit = this.entries.get(sid);
    if (hit && hit.expiresAt > Date.now()) return hit.state;
    const state = await this.load(sid);
    if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
    this.entries.set(sid, { state, expiresAt: Date.now() + TTL_MS });
    return state;
  }

  invalidate(sids: Iterable<string>) {
    for (const sid of sids) this.entries.delete(sid);
  }

  invalidateUser(userId: string) {
    for (const [sid, entry] of this.entries) {
      if (entry.state?.userId === userId) this.entries.delete(sid);
    }
  }

  private async load(sid: string): Promise<SessionState | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { status: true, role: true, storeId: true, passwordChangedAt: true } },
      },
    });
    if (!session) return null;
    return {
      userId: session.userId,
      active:
        !session.revokedAt && session.expiresAt > new Date() && session.user.status === 'active',
      role: session.user.role,
      storeId: session.user.storeId,
      passwordChangedAtSec: Math.floor(session.user.passwordChangedAt.getTime() / 1000),
    };
  }
}
