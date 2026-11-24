import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/app-exception';

const TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PATTERN = /^[\w.:-]{8,100}$/;

export const IdempotencyErrors = {
  invalidKey: () =>
    new AppException(
      400,
      'IDEMPOTENCY_KEY_INVALID',
      'Idempotency-Key gồm 8–100 ký tự chữ, số, dấu gạch',
    ),
  reused: () =>
    new AppException(
      409,
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency-Key đã được dùng cho thao tác khác',
    ),
};

export function parseIdempotencyKey(value: string | undefined) {
  if (value === undefined || value === '') return undefined;
  if (!KEY_PATTERN.test(value)) throw IdempotencyErrors.invalidKey();
  return value;
}

@Injectable()
export class IdempotencyService {
  async claim(tx: Prisma.TransactionClient, userId: string, key: string, scope: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`idem:${userId}:${key}`}))`;
    const existing = await tx.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
    if (!existing) return null;
    if (existing.createdAt.getTime() < Date.now() - TTL_MS) {
      await tx.idempotencyKey.delete({ where: { userId_key: { userId, key } } });
      return null;
    }
    if (existing.scope !== scope) throw IdempotencyErrors.reused();
    return existing.resourceId;
  }

  async save(
    tx: Prisma.TransactionClient,
    userId: string,
    key: string,
    scope: string,
    resourceId: string,
  ) {
    await tx.idempotencyKey.create({ data: { userId, key, scope, resourceId } });
  }
}
