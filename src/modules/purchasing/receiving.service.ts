import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { nextDailyCode } from '../../common/daily-code';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { StockLedger } from '../stock/stock-ledger.service';
import { SupplierLedger } from '../suppliers/supplier-ledger.service';
import { ReceiveDto } from './dto/receive.dto';
import { parseReceivingDraft } from './dto/receiving-draft.schema';
import { GoodsReceiptsService } from './goods-receipts.service';
import { addEvents } from './purchase-events';
import { lockOrder, type LockedOrder } from './purchase-orders.query';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseErrors } from './purchasing.errors';
import { planReceipt } from './receive-plan';
import { formatLotNote, LOCK_MS, RECEIVABLE_STATUSES, round100 } from './purchasing.utils';

type Tx = Prisma.TransactionClient;

const SCOPE = 'purchase.receive';
const MAX_DRAFT_BYTES = 1024 * 1024;

const parseVersion = (value: string | undefined) => {
  if (value === undefined || value === '') return undefined;
  const version = Number(value.replace(/^W\//, '').replace(/"/g, ''));
  if (!Number.isInteger(version)) throw PurchaseErrors.draftInvalid('If-Match không hợp lệ');
  return version;
};

@Injectable()
export class ReceivingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: PurchaseOrdersService,
    private readonly receipts: GoodsReceiptsService,
    private readonly stock: StockLedger,
    private readonly supplierLedger: SupplierLedger,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
  ) {}

  async saveDraft(
    user: AuthUser,
    id: string,
    body: unknown,
    ifMatch: string | undefined,
    takeover: boolean,
  ) {
    if (Buffer.byteLength(JSON.stringify(body ?? null)) > MAX_DRAFT_BYTES) {
      throw PurchaseErrors.draftInvalid('Phiên kiểm đếm vượt quá 1MB');
    }
    const data = parseReceivingDraft(body) as Prisma.InputJsonObject;
    const expectedVersion = parseVersion(ifMatch);
    const version = await this.prisma.$transaction(async (tx) => {
      const po = await this.lockReceivable(tx, user.storeId, id);
      const session = await tx.receivingSession.findUnique({
        where: { poId: id },
        include: { startedBy: { select: { name: true } } },
      });
      if (!session) {
        await tx.receivingSession.create({ data: { poId: id, data, startedById: user.id } });
        if (po.status !== 'receiving') {
          await tx.purchaseOrder.update({ where: { id }, data: { status: 'receiving' } });
        }
        await addEvents(tx, id, user.id, 'Bắt đầu kiểm đếm hàng');
        return 1;
      }
      const otherUser = session.startedById !== user.id;
      if (otherUser && this.isActive(session.updatedAt) && !takeover) {
        throw PurchaseErrors.receivingLocked(session.startedBy.name, session.updatedAt);
      }
      if (expectedVersion !== undefined && expectedVersion !== session.version) {
        throw PurchaseErrors.receivingConflict(session.version);
      }
      const updated = await tx.receivingSession.update({
        where: { poId: id },
        data: { data, version: { increment: 1 }, startedById: user.id },
        select: { version: true },
      });
      if (po.status !== 'receiving') {
        await tx.purchaseOrder.update({ where: { id }, data: { status: 'receiving' } });
      }
      if (otherUser)
        await addEvents(tx, id, user.id, `Tiếp quản phiên kiểm đếm từ ${session.startedBy.name}`);
      return updated.version;
    });
    return { order: await this.orders.listItem(user.storeId, id), version };
  }

  async discard(user: AuthUser, id: string, client: ClientInfo) {
    const discarded = await this.prisma.$transaction(async (tx) => {
      const po = await this.lockReceivable(tx, user.storeId, id);
      await this.assertNotLocked(tx, id, user.id);
      const { count } = await tx.receivingSession.deleteMany({ where: { poId: id } });
      if (po.status === 'receiving') {
        const receipts = await tx.goodsReceipt.count({ where: { poId: id } });
        await tx.purchaseOrder.update({
          where: { id },
          data: { status: receipts ? 'partial' : 'ordered' },
        });
      }
      if (count) await addEvents(tx, id, user.id, 'Bỏ phiên kiểm đếm');
      return count ? po : null;
    });
    if (discarded) {
      await this.audit.log('PURCHASE_RECEIVING_DISCARDED', client, {
        userId: user.id,
        meta: { purchaseOrderId: id, code: discarded.code },
      });
    }
    return this.orders.get(user.storeId, id);
  }

  async receive(
    user: AuthUser,
    id: string,
    dto: ReceiveDto,
    key: string | undefined,
    client: ClientInfo,
  ) {
    if (!key) throw PurchaseErrors.idempotencyRequired();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const replayed = await this.idempotency.claim(tx, user.id, key, SCOPE);
      if (replayed) return { receiptId: replayed, replayed: true as const };
      const po = await this.lockReceivable(tx, user.storeId, id);
      await this.assertNotLocked(tx, id, user.id);
      const result = await this.commit(tx, user, po, dto);
      await this.idempotency.save(tx, user.id, key, SCOPE, result.receiptId);
      return { ...result, replayed: false as const };
    });
    if (!outcome.replayed) {
      await this.audit.log('GOODS_RECEIVED', client, {
        userId: user.id,
        meta: {
          purchaseOrderId: id,
          receiptId: outcome.receiptId,
          code: outcome.code,
          value: outcome.value,
          status: outcome.status,
        },
      });
    }
    const receipt = await this.receipts.get(user.storeId, outcome.receiptId);
    return { order: await this.orders.get(user.storeId, receipt.poId), receipt };
  }

  private async commit(tx: Tx, user: AuthUser, po: LockedOrder, dto: ReceiveDto) {
    const items = await tx.purchaseOrderItem.findMany({
      where: { poId: po.id },
      orderBy: { lineNo: 'asc' },
    });
    const extraIds = dto.lines.filter((line) => line.extra).map((line) => line.productId);
    const validExtras = extraIds.length
      ? await tx.product.findMany({
          where: { id: { in: extraIds }, deletedAt: null },
          select: { id: true },
        })
      : [];
    const [{ discountGiven }] = await tx.$queryRaw<{ discountGiven: number }[]>`
      SELECT COALESCE(SUM(discount), 0)::int AS "discountGiven" FROM goods_receipts WHERE po_id = ${po.id}::uuid`;
    const plan = planReceipt({
      items,
      lines: dto.lines,
      validExtraIds: new Set(validExtras.map((product) => product.id)),
      approvedBy: dto.approvedBy,
      discount: po.discount,
      discountGiven,
    });

    const code = await nextDailyCode(tx, 'goods_receipts', 'PN');
    const receivedAt = new Date();
    const receipt = await tx.goodsReceipt.create({
      data: {
        code,
        poId: po.id,
        storeId: user.storeId,
        supplierId: po.supplierId,
        supplierDocNo: dto.checkIn.supplierDocNo,
        packageCount: dto.checkIn.packageCount,
        packagingOk: dto.checkIn.packagingOk,
        deliveredBy: dto.checkIn.deliveredBy ?? null,
        note: dto.note ?? null,
        approvedBy: dto.approvedBy ?? null,
        grossValue: plan.grossValue,
        discount: plan.discount,
        value: plan.value,
        receivedById: user.id,
        receivedAt,
        lines: {
          createMany: {
            data: plan.lines.map((line, index) => ({
              lineNo: index + 1,
              productId: line.productId,
              expectedQty: line.expectedQty,
              scannedQty: line.scannedQty,
              acceptedQty: line.acceptedQty,
              damagedQty: line.damagedQty,
              returnedQty: line.returnedQty,
              unitCost: line.unitCost,
              extra: line.extra,
              expiryDate: line.expiryDate,
              lotNo: line.lotNo,
            })),
          },
        },
      },
      select: { id: true },
    });

    const accepted = plan.lines
      .filter((line) => line.acceptedQty > 0)
      .sort((a, b) => a.productId.localeCompare(b.productId));
    for (const line of accepted) {
      const [{ costPrice }] = await tx.$queryRaw<{ costPrice: number | null }[]>`
        SELECT cost_price AS "costPrice" FROM products WHERE id = ${line.productId}::uuid FOR UPDATE`;
      const { before } = await this.stock.apply(tx, {
        productId: line.productId,
        storeId: user.storeId,
        userId: user.id,
        delta: line.acceptedQty,
        type: 'import',
        reason: `Nhận hàng ${po.code}`,
        note: formatLotNote(line.lotNo, line.expiryDate),
        refCode: code,
      });
      const cost =
        before <= 0 || costPrice === null
          ? line.unitCost
          : round100(
              (before * costPrice + line.acceptedQty * line.unitCost) / (before + line.acceptedQty),
            );
      await tx.product.update({ where: { id: line.productId }, data: { costPrice: cost } });
    }

    for (const update of plan.itemUpdates) {
      await tx.purchaseOrderItem.update({ where: { id: update.id }, data: update.data });
    }
    if (plan.newItems.length) {
      await tx.purchaseOrderItem.createMany({
        data: plan.newItems.map((item, index) => ({
          ...item,
          poId: po.id,
          lineNo: items.length + index + 1,
        })),
      });
    }

    if (plan.value > 0) {
      await this.supplierLedger.apply(tx, {
        supplierId: po.supplierId,
        kind: 'receipt',
        amount: plan.value,
        code,
        label: `Nhập hàng theo ${po.code}`,
        refType: 'GoodsReceipt',
        refId: receipt.id,
        occurredAt: receivedAt,
        userId: user.id,
      });
    }

    const status = plan.completed ? 'completed' : 'partial';
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status, completedAt: plan.completed ? receivedAt : null },
    });
    await tx.receivingSession.deleteMany({ where: { poId: po.id } });
    await addEvents(
      tx,
      po.id,
      user.id,
      `${plan.completed ? 'Nhận đủ hàng' : 'Nhận một phần'} & nhập kho (${code})`,
    );
    return { receiptId: receipt.id, code, value: plan.value, status };
  }

  private async lockReceivable(tx: Tx, storeId: string, id: string) {
    const po = await lockOrder(tx, storeId, id);
    if (!po) throw PurchaseErrors.notFound();
    if (!RECEIVABLE_STATUSES.includes(po.status)) throw PurchaseErrors.invalidStatus(po.status);
    return po;
  }

  private async assertNotLocked(tx: Tx, poId: string, userId: string) {
    const session = await tx.receivingSession.findUnique({
      where: { poId },
      select: { startedById: true, updatedAt: true, startedBy: { select: { name: true } } },
    });
    if (session && session.startedById !== userId && this.isActive(session.updatedAt)) {
      throw PurchaseErrors.receivingLocked(session.startedBy.name, session.updatedAt);
    }
  }

  private isActive(updatedAt: Date) {
    return Date.now() - updatedAt.getTime() < LOCK_MS;
  }
}
