import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { normalizePhone } from '../../common/utils/mask';
import { PrismaService } from '../../prisma/prisma.service';

export type PublicUser = Pick<User, 'id' | 'username' | 'phone' | 'name' | 'role' | 'storeId'>;

export function toPublicUser(user: User): PublicUser {
  const { id, username, phone, name, role, storeId } = user;
  return { id, username, phone, name, role, storeId };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByLogin(login: string) {
    const value = login.trim();
    const phone = normalizePhone(value);
    return this.prisma.user.findFirst({
      where: { OR: [{ username: value.toLowerCase() }, ...(phone ? [{ phone }] : [])] },
    });
  }

  markLoginSuccess(id: string, rehashed?: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(rehashed ? { passwordHash: rehashed } : {}),
      },
    });
  }

  setPassword(id: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
  }
}
