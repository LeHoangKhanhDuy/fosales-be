import { Injectable } from '@nestjs/common';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/http/client-info';
import { maskPhone } from '../../common/utils/mask';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { SessionCacheService } from './session-cache.service';
import { SessionsService } from './sessions.service';
import { SmsService } from './sms.service';

const OTP_TTL_MS = 5 * 60_000;
const OTP_RESEND_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly cache: SessionCacheService,
    private readonly passwords: PasswordService,
    private readonly otp: OtpService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
  ) {}

  async request(dto: ForgotPasswordDto, client: ClientInfo) {
    const user = await this.users.findByLogin(dto.account);
    if (!user || user.status !== 'active') {
      await this.audit.log('PASSWORD_RESET_REQUESTED', client, { meta: { matched: false } });
      return { maskedTarget: this.otp.decoyTarget(dto.account) };
    }

    const recent = await this.prisma.passwordResetOtp.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        createdAt: { gt: new Date(Date.now() - OTP_RESEND_MS) },
      },
      select: { id: true },
    });
    if (!recent) {
      const code = this.otp.generate();
      await this.prisma.$transaction([
        this.prisma.passwordResetOtp.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.passwordResetOtp.create({
          data: {
            userId: user.id,
            codeHash: this.otp.hash(user.id, code),
            expiresAt: new Date(Date.now() + OTP_TTL_MS),
          },
        }),
      ]);
      await this.sms.sendOtp(user.phone, code);
    }
    await this.audit.log('PASSWORD_RESET_REQUESTED', client, {
      userId: user.id,
      meta: { matched: true, resent: !recent },
    });
    return { maskedTarget: maskPhone(user.phone) };
  }

  async reset(dto: ResetPasswordDto, client: ClientInfo): Promise<void> {
    const user = await this.users.findByLogin(dto.account);
    if (!user || user.status !== 'active') throw Errors.otpInvalid();

    const otp = await this.prisma.passwordResetOtp.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw Errors.otpInvalid();

    if (!this.otp.verify(user.id, dto.otp, otp.codeHash)) {
      const attempts = otp.attempts + 1;
      await this.prisma.passwordResetOtp.update({
        where: { id: otp.id },
        data: { attempts, ...(attempts >= OTP_MAX_ATTEMPTS ? { usedAt: new Date() } : {}) },
      });
      await this.audit.log('PASSWORD_RESET_FAILED', client, {
        userId: user.id,
        meta: { attempts },
      });
      throw Errors.otpInvalid();
    }

    const claimed = await this.prisma.passwordResetOtp.updateMany({
      where: { id: otp.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw Errors.otpInvalid();

    await this.users.setPassword(user.id, await this.passwords.hash(dto.newPassword));
    const revoked = await this.sessions.revokeAllForUser(user.id);
    this.cache.invalidateUser(user.id);
    await this.audit.log('PASSWORD_RESET', client, {
      userId: user.id,
      meta: { revokedSessions: revoked },
    });
  }
}
