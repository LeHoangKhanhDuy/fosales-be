import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { OrderErrors } from './orders.errors';

export const storeScope = (user: AuthUser) =>
  user.role === 'admin' ? {} : { storeId: user.storeId };

export async function lockOrder(tx: Prisma.TransactionClient, user: AuthUser, id: string) {
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM orders
    WHERE id = ${id}::uuid AND (${user.role === 'admin'} OR store_id = ${user.storeId}::uuid)
    FOR UPDATE`;
  if (!row) throw OrderErrors.notFound();
  return tx.order.findUniqueOrThrow({
    where: { id },
    include: {
      lines: { orderBy: { lineNo: 'asc' } },
      payments: true,
      customer: { select: { status: true } },
    },
  });
}
