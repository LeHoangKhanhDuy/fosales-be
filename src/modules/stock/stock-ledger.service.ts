import { Injectable } from '@nestjs/common';
import type { MovementType, Prisma } from '@prisma/client';
import { StockErrors } from './stock.errors';

type Tx = Prisma.TransactionClient;

interface StockTarget {
  productId: string;
  storeId: string;
}

export interface StockEntry extends StockTarget {
  userId: string;
  delta: number | ((before: number) => number);
  type?: MovementType;
  reason?: string | null;
  note?: string | null;
  refCode?: string | null;
  expectedBefore?: number;
  allowNegative?: boolean;
}

export interface StockResult {
  before: number;
  after: number;
  movementId: string;
}

@Injectable()
export class StockLedger {
  async apply(tx: Tx, entry: StockEntry): Promise<StockResult> {
    const before = await this.lock(tx, entry);
    if (entry.expectedBefore !== undefined && entry.expectedBefore !== before) {
      throw StockErrors.changed(before);
    }
    const delta = typeof entry.delta === 'function' ? entry.delta(before) : entry.delta;
    return this.write(tx, entry, before, delta);
  }

  async setQuantity(tx: Tx, entry: Omit<StockEntry, 'delta'> & { quantity: number }) {
    const before = await this.lock(tx, entry);
    if (before === entry.quantity) return null;
    const { after } = await this.write(tx, entry, before, entry.quantity - before);
    return { before, after };
  }

  private async lock(tx: Tx, { productId, storeId }: StockTarget) {
    await tx.$executeRaw`
      INSERT INTO product_stocks (product_id, store_id, quantity, updated_at)
      VALUES (${productId}::uuid, ${storeId}::uuid, 0, now())
      ON CONFLICT (product_id, store_id) DO NOTHING`;
    const [{ quantity }] = await tx.$queryRaw<{ quantity: number }[]>`
      SELECT quantity FROM product_stocks
      WHERE product_id = ${productId}::uuid AND store_id = ${storeId}::uuid
      FOR UPDATE`;
    return quantity;
  }

  private async write(tx: Tx, entry: Omit<StockEntry, 'delta'>, before: number, delta: number) {
    const after = before + delta;
    if (after < 0 && !entry.allowNegative) throw StockErrors.insufficient(before);
    const { productId, storeId } = entry;
    const now = new Date();
    await tx.productStock.update({
      where: { productId_storeId: { productId, storeId } },
      data: { quantity: after, lastMovementAt: now },
    });
    const movement = await tx.stockMovement.create({
      data: {
        productId,
        storeId,
        createdById: entry.userId,
        type: entry.type ?? (delta > 0 ? 'adjust_in' : 'adjust_out'),
        quantity: delta,
        before,
        after,
        reason: entry.reason ?? null,
        note: entry.note ?? null,
        refCode: entry.refCode ?? null,
        createdAt: now,
      },
      select: { id: true },
    });
    return { before, after, movementId: movement.id };
  }
}
