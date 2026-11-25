import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/auth-user';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { StockLedger } from '../stock/stock-ledger.service';
import { AdjustMode, AdjustStockDto } from './dto/inventory.dto';
import { InventoryErrors } from './inventory.errors';
import { InventoryService } from './inventory.service';
import { MovementsService } from './movements.service';

const SCOPE = 'inventory.adjust';

const deltaFor = (mode: AdjustMode, quantity: number) => (before: number) => {
  const delta =
    mode === 'increase' ? quantity : mode === 'decrease' ? -quantity : quantity - before;
  if (delta === 0) throw InventoryErrors.noChange();
  return delta;
};

@Injectable()
export class InventoryCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: StockLedger,
    private readonly idempotency: IdempotencyService,
    private readonly inventory: InventoryService,
    private readonly movements: MovementsService,
    private readonly audit: AuditService,
  ) {}

  async adjust(
    user: AuthUser,
    dto: AdjustStockDto,
    idempotencyKey: string | undefined,
    client: ClientInfo,
  ) {
    if (dto.mode !== 'set' && dto.quantity < 1) throw InventoryErrors.quantityRequired();
    const outcome = await this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const movementId = await this.idempotency.claim(tx, user.id, idempotencyKey, SCOPE);
        if (movementId) return { movementId, replayed: true as const };
      }
      const product = await tx.product.findFirst({
        where: { id: dto.productId, deletedAt: null },
        select: { id: true },
      });
      if (!product) throw InventoryErrors.productNotFound();
      const result = await this.ledger.apply(tx, {
        productId: dto.productId,
        storeId: user.storeId,
        userId: user.id,
        delta: deltaFor(dto.mode, dto.quantity),
        reason: dto.reason,
        note: dto.note,
        expectedBefore: dto.expectedStock,
      });
      if (idempotencyKey)
        await this.idempotency.save(tx, user.id, idempotencyKey, SCOPE, result.movementId);
      return { ...result, replayed: false as const };
    });

    if (!outcome.replayed) {
      await this.audit.log('STOCK_ADJUSTED', client, {
        userId: user.id,
        meta: {
          productId: dto.productId,
          mode: dto.mode,
          before: outcome.before,
          after: outcome.after,
          reason: dto.reason,
        },
      });
    }
    const [item, movement] = await Promise.all([
      this.inventory.item(user.storeId, dto.productId),
      this.movements.byId(outcome.movementId),
    ]);
    return { item, movement };
  }

  async setMinStock(user: AuthUser, productId: string, minStock: number, client: ClientInfo) {
    const before = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: { minStock: true },
      });
      if (!product) throw InventoryErrors.productNotFound();
      await tx.product.update({ where: { id: productId }, data: { minStock } });
      return product.minStock;
    });
    await this.audit.log('MIN_STOCK_UPDATED', client, {
      userId: user.id,
      meta: { productId, before, after: minStock },
    });
    return this.inventory.item(user.storeId, productId);
  }
}
