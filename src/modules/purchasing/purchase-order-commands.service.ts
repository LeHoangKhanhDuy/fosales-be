import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { nextDailyCode } from '../../common/daily-code';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SupplierErrors } from '../suppliers/suppliers.errors';
import { SuppliersService } from '../suppliers/suppliers.service';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderInputDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { addEvents } from './purchase-events';
import { lockOrder } from './purchase-orders.query';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseErrors } from './purchasing.errors';
import {
  formatDateOnly,
  isPastDate,
  MAX_ORDER_VALUE,
  packSizeFor,
  toDateOnly,
} from './purchasing.utils';

type Tx = Prisma.TransactionClient;
type OrderInput = Required<Omit<PurchaseOrderInputDto, 'note'>> & { note: string | null };

@Injectable()
export class PurchaseOrderCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: PurchaseOrdersService,
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreatePurchaseOrderDto, client: ClientInfo) {
    await this.suppliers.reactivateExpired();
    const input: OrderInput = { ...dto, discount: dto.discount ?? 0, note: dto.note ?? null };
    const order = await this.prisma.$transaction(async (tx) => {
      const { items, expectedDate } = await this.prepare(tx, input, true);
      const code = await nextDailyCode(tx, 'purchase_orders', 'DH');
      const created = await tx.purchaseOrder.create({
        data: {
          code,
          storeId: user.storeId,
          supplierId: input.supplierId,
          status: dto.place ? 'ordered' : 'draft',
          discount: input.discount,
          note: input.note,
          expectedDate,
          placedAt: dto.place ? new Date() : null,
          createdById: user.id,
          items: { createMany: { data: items } },
        },
        select: { id: true, code: true },
      });
      const labels = ['Tạo đơn đặt hàng', ...(dto.place ? ['Gửi đơn cho nhà cung cấp'] : [])];
      await addEvents(tx, created.id, user.id, ...labels);
      return created;
    });
    await this.log('PURCHASE_ORDER_CREATED', user, client, order, { placed: !!dto.place });
    if (dto.place) await this.log('PURCHASE_ORDER_PLACED', user, client, order);
    return this.orders.get(user.storeId, order.id);
  }

  async update(user: AuthUser, id: string, dto: UpdatePurchaseOrderDto, client: ClientInfo) {
    await this.suppliers.reactivateExpired();
    const order = await this.prisma.$transaction(async (tx) => {
      const po = await this.lockDraft(tx, user.storeId, id);
      const current = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        select: {
          note: true,
          items: {
            orderBy: { lineNo: 'asc' },
            select: { productId: true, orderedQty: true, unitCost: true, packSize: true },
          },
        },
      });
      const input: OrderInput = {
        supplierId: dto.supplierId ?? po.supplierId,
        expectedDate: dto.expectedDate ?? formatDateOnly(po.expectedDate)!,
        items: dto.items ?? current.items,
        discount: dto.discount ?? po.discount,
        note: dto.note !== undefined ? (dto.note ?? null) : current.note,
      };
      const { items, expectedDate } = await this.prepare(tx, input, dto.expectedDate !== undefined);
      await tx.purchaseOrderItem.deleteMany({ where: { poId: id } });
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: input.supplierId,
          discount: input.discount,
          note: input.note,
          expectedDate,
          items: { createMany: { data: items } },
        },
      });
      await addEvents(tx, id, user.id, 'Cập nhật đơn nháp');
      return po;
    });
    await this.log('PURCHASE_ORDER_UPDATED', user, client, order);
    return this.orders.get(user.storeId, id);
  }

  async place(user: AuthUser, id: string, client: ClientInfo) {
    await this.suppliers.reactivateExpired();
    const order = await this.prisma.$transaction(async (tx) => {
      const po = await this.lockDraft(tx, user.storeId, id);
      const items = await tx.purchaseOrderItem.findMany({
        where: { poId: id },
        orderBy: { lineNo: 'asc' },
        select: { productId: true, orderedQty: true, unitCost: true, packSize: true },
      });
      await this.prepare(
        tx,
        {
          supplierId: po.supplierId,
          expectedDate: formatDateOnly(po.expectedDate)!,
          items,
          discount: po.discount,
          note: null,
        },
        true,
      );
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'ordered', placedAt: new Date() },
      });
      await addEvents(tx, id, user.id, 'Gửi đơn cho nhà cung cấp');
      return po;
    });
    await this.log('PURCHASE_ORDER_PLACED', user, client, order);
    return this.orders.get(user.storeId, id);
  }

  async cancel(user: AuthUser, id: string, reason: string, client: ClientInfo) {
    const order = await this.prisma.$transaction(async (tx) => {
      const po = await lockOrder(tx, user.storeId, id);
      if (!po) throw PurchaseErrors.notFound();
      if (po.status !== 'draft' && po.status !== 'ordered')
        throw PurchaseErrors.invalidStatus(po.status);
      await tx.receivingSession.deleteMany({ where: { poId: id } });
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'cancelled', cancelReason: reason, cancelledAt: new Date() },
      });
      await addEvents(tx, id, user.id, `Hủy đơn: ${reason}`);
      return po;
    });
    await this.log('PURCHASE_ORDER_CANCELLED', user, client, order, { reason, from: order.status });
    return this.orders.get(user.storeId, id);
  }

  private async lockDraft(tx: Tx, storeId: string, id: string) {
    const po = await lockOrder(tx, storeId, id);
    if (!po) throw PurchaseErrors.notFound();
    if (po.status !== 'draft') throw PurchaseErrors.invalidStatus(po.status);
    return po;
  }

  private async prepare(tx: Tx, input: OrderInput, checkDate: boolean) {
    if (!input.items.length) throw PurchaseErrors.itemsRequired();
    const ids = input.items.map((item) => item.productId);
    if (new Set(ids).size !== ids.length) throw PurchaseErrors.duplicateProduct();
    const supplier = await tx.supplier.findUnique({
      where: { id: input.supplierId },
      select: { status: true },
    });
    if (!supplier) throw SupplierErrors.notFound();
    if (supplier.status !== 'active') throw SupplierErrors.notActive();
    const expectedDate = toDateOnly(input.expectedDate);
    if (Number.isNaN(expectedDate.getTime())) throw PurchaseErrors.expectedDateInvalid();
    if (checkDate && isPastDate(expectedDate)) throw PurchaseErrors.expectedDateInvalid();
    const products = await tx.product.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, unit: { select: { name: true } } },
    });
    const units = new Map(products.map((product) => [product.id, product.unit?.name]));
    const missing = ids.filter((productId) => !units.has(productId));
    if (missing.length) throw PurchaseErrors.productInvalid(missing);
    const subtotal = input.items.reduce((sum, item) => sum + item.orderedQty * item.unitCost, 0);
    if (subtotal > MAX_ORDER_VALUE) throw PurchaseErrors.totalTooLarge();
    if (input.discount > subtotal) throw PurchaseErrors.discountInvalid();
    return {
      expectedDate,
      items: input.items.map((item, index) => ({
        productId: item.productId,
        lineNo: index + 1,
        orderedQty: item.orderedQty,
        unitCost: item.unitCost,
        packSize: item.packSize ?? packSizeFor(units.get(item.productId)),
      })),
    };
  }

  private log(
    action: AuditAction,
    user: AuthUser,
    client: ClientInfo,
    order: { id: string; code: string },
    meta: Prisma.InputJsonObject = {},
  ) {
    return this.audit.log(action, client, {
      userId: user.id,
      meta: { purchaseOrderId: order.id, code: order.code, ...meta },
    });
  }
}
