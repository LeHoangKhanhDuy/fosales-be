import { Injectable } from '@nestjs/common';
import type { MovementType, Prisma } from '@prisma/client';

interface StockChange {
  productId: string;
  storeId: string;
  userId: string;
  quantity: number;
  reason: string;
  type?: MovementType;
}

@Injectable()
export class StockLedger {
  async setQuantity(tx: Prisma.TransactionClient, change: StockChange) {
    const { productId, storeId } = change;
    await tx.$executeRaw`
      INSERT INTO product_stocks (product_id, store_id, quantity, updated_at)
      VALUES (${productId}::uuid, ${storeId}::uuid, 0, now())
      ON CONFLICT (product_id, store_id) DO NOTHING`;
    const [{ quantity: before }] = await tx.$queryRaw<{ quantity: number }[]>`
      SELECT quantity FROM product_stocks
      WHERE product_id = ${productId}::uuid AND store_id = ${storeId}::uuid
      FOR UPDATE`;
    if (before === change.quantity) return null;
    const delta = change.quantity - before;
    await tx.productStock.update({
      where: { productId_storeId: { productId, storeId } },
      data: { quantity: change.quantity },
    });
    await tx.stockMovement.create({
      data: {
        productId,
        storeId,
        createdById: change.userId,
        type: change.type ?? (delta > 0 ? 'adjust_in' : 'adjust_out'),
        quantity: delta,
        before,
        after: change.quantity,
        reason: change.reason,
      },
    });
    return { before, after: change.quantity };
  }
}
