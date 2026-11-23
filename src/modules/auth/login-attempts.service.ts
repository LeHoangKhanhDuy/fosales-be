import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AppException } from '../../common/app-exception';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const MAX_FAILED = 5;
const BASE_LOCK_SECONDS = 30;
const MAX_LOCK_SECONDS = 15 * 60;

@Injectable()
export class LoginAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  remainingLock(user: Pick<User, 'lockedUntil'>): number {
    if (!user.lockedUntil) return 0;
    const remaining = user.lockedUntil.getTime() - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  async registerFailure(userId: string, client: ClientInfo): Promise<AppException> {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount % MAX_FAILED !== 0) {
      await this.audit.log('LOGIN_FAILED', client, {
        userId,
        meta: { reason: 'invalid_password', failedLoginCount },
      });
      return Errors.invalidCredentials();
    }
    const round = failedLoginCount / MAX_FAILED - 1;
    const seconds = Math.min(BASE_LOCK_SECONDS * 2 ** round, MAX_LOCK_SECONDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + seconds * 1000) },
    });
    await this.audit.log('LOGIN_LOCKED', client, {
      userId,
      meta: { failedLoginCount, lockSeconds: seconds },
    });
    return Errors.accountLocked(seconds);
  }
}
