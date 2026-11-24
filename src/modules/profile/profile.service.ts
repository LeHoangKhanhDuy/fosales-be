import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/http/client-info';
import { rethrowPrisma } from '../../common/prisma-errors';
import { verifyPassword } from '../../common/security/password';
import { normalizePhone } from '../../common/utils/mask';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateProfileDto } from './dto/profile.dto';

const PROFILE_SELECT = {
  id: true,
  username: true,
  phone: true,
  name: true,
  role: true,
  storeId: true,
  store: { select: { id: true, code: true, name: true } },
  lastLoginAt: true,
  passwordChangedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type Profile = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(userId: string): Promise<Profile> {
    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    if (!profile) throw Errors.unauthenticated();
    return profile;
  }

  async update(user: AuthUser, dto: UpdateProfileDto, client: ClientInfo): Promise<Profile> {
    if (dto.name === undefined && dto.phone === undefined) throw Errors.emptyUpdate();
    const current = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, phone: true, passwordHash: true },
    });
    if (!current) throw Errors.unauthenticated();

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined && dto.name !== current.name) data.name = dto.name;
    if (dto.phone !== undefined) {
      const phone = normalizePhone(dto.phone);
      if (!phone) throw Errors.invalidPhone();
      if (phone !== current.phone) {
        if (!dto.currentPassword) throw Errors.passwordRequired();
        if (!(await verifyPassword(current.passwordHash, dto.currentPassword))) {
          throw Errors.wrongCurrentPassword();
        }
        data.phone = phone;
      }
    }

    const fields = Object.keys(data);
    if (!fields.length) return this.get(user.id);

    const profile = await this.prisma.user
      .update({ where: { id: user.id }, data, select: PROFILE_SELECT })
      .catch(rethrowPrisma({ P2002: Errors.phoneTaken }));
    await this.audit.log('PROFILE_UPDATED', client, { userId: user.id, meta: { fields } });
    return profile;
  }
}
