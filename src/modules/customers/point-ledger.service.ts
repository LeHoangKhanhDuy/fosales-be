import { Injectable } from '@nestjs/common';
import type { PointLogType, Prisma } from '@prisma/client';
import { CustomerErrors } from './customers.errors';

export interface PointEntry {
  customerId: string;
  type: PointLogType;
  points: number;
  refCode?: string | null;
  reason?: string | null;
  userId: string;
  allowNegative?: boolean;
  at?: Date;
}

export const pointLogInclude = {
  createdBy: { select: { name: true } },
} satisfies Prisma.PointLogInclude;

type PointLogRow = Prisma.PointLogGetPayload<{ include: typeof pointLogInclude }>;

export const toPointLog = (row: PointLogRow) => ({
  id: row.id,
  customerId: row.customerId,
  type: row.type,
  points: row.points,
  balance: row.balance,
  refCode: row.refCode,
  reason: row.reason,
  createdAt: row.createdAt,
  createdBy: row.createdBy.name,
});

@Injectable()
export class PointLedger {
  async apply(tx: Prisma.TransactionClient, entry: PointEntry) {
    const [customer] = await tx.$queryRaw<{ points: number }[]>`
      SELECT points FROM customers WHERE id = ${entry.customerId}::uuid FOR UPDATE`;
    if (!customer) throw CustomerErrors.notFound();
    const balanceBefore = customer.points;
    const balanceAfter = balanceBefore + entry.points;
    if (balanceAfter < 0 && !entry.allowNegative)
      throw CustomerErrors.pointsInsufficient(balanceBefore);
    await tx.customer.update({ where: { id: entry.customerId }, data: { points: balanceAfter } });
    const log = await tx.pointLog.create({
      data: {
        customerId: entry.customerId,
        type: entry.type,
        points: entry.points,
        balance: balanceAfter,
        refCode: entry.refCode ?? null,
        reason: entry.reason ?? null,
        createdById: entry.userId,
        ...(entry.at ? { createdAt: entry.at } : {}),
      },
      include: pointLogInclude,
    });
    return { log: toPointLog(log), balanceBefore, balanceAfter };
  }
}
