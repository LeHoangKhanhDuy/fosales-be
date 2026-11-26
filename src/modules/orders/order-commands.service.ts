import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { nextDailyCode } from '../../common/daily-code';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MembershipService } from '../customers/membership.service';
import { PointLedger } from '../customers/point-ledger.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { VoucherService } from '../promotions/voucher.service';
import { StockLedger } from '../stock/stock-ledger.service';
import { ConfirmPaymentDto, CreateOrderDto } from './dto/order.dto';
import { lockOrder } from './order-access';
import { OrderErrors } from './orders.errors';
import { OrdersService } from './orders.service';
import { CANCEL_WINDOW_MS, planPayments, vnDay } from './orders.utils';
import { PricingService, toQuote } from './pricing.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class OrderCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly orders: OrdersService,
    private readonly stock: StockLedger,
    private readonly vouchers: VoucherService,
    private readonly membership: MembershipService,
    private readonly points: PointLedger,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
  ) {}

  quote(user: AuthUser, dto: Omit<CreateOrderDto, 'payments' | 'note' | 'expectedTotal'>) {
    return this.pricing
      .price(this.prisma, { ...dto, storeId: user.storeId }, { strict: false })
      .then(toQuote);
  }

  async create(user: AuthUser, dto: CreateOrderDto, key: string | undefined, client: ClientInfo) {
    if (!key) throw OrderErrors.idempotencyRequired();
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const replayed = await this.idempotency.claim(tx, user.id, key, 'order.create');
        if (replayed) return { orderId: replayed, replayed: true as const };
        const priced = await this.pricing.price(
          tx,
          { ...dto, storeId: user.storeId },
          { strict: true },
        );
        if (dto.expectedTotal !== priced.totals.total)
          throw OrderErrors.totalChanged(toQuote(priced));
        const plan = planPayments(priced.totals.due, dto.payments);
        const code = await nextDailyCode(tx, 'orders', 'HD');
        await this.takeStock(tx, user, code, priced.lines, priced.allowNegativeStock);

        const now = new Date();
        const status = plan.pending ? 'pending' : 'completed';
        const voucherApplied =
          priced.voucher && priced.totals.voucherDiscount > 0 ? priced.voucher : null;
        const { totals, member, customer } = priced;
        const payments = [
          ...plan.payments,
          ...(totals.pointsDiscount > 0
            ? [
                {
                  method: 'points' as const,
                  amount: totals.pointsDiscount,
                  tendered: null,
                  reference: null,
                  status: 'confirmed' as const,
                },
              ]
            : []),
        ];
        const order = await tx.order.create({
          data: {
            code,
            storeId: user.storeId,
            cashierId: user.id,
            customerId: customer?.id ?? null,
            status,
            subtotal: totals.subtotal,
            productDiscount: totals.productDiscount,
            orderDiscount: totals.orderDiscount,
            memberDiscount: totals.memberDiscount,
            voucherDiscount: totals.voucherDiscount,
            pointsDiscount: totals.pointsDiscount,
            total: totals.total,
            paidTotal: plan.paidTotal,
            changeAmount: plan.changeAmount,
            voucherCode: voucherApplied?.code ?? null,
            memberTier: member?.tier ?? null,
            memberLabel: member?.label ?? null,
            memberPercent: member ? new Prisma.Decimal(member.discountPercent) : null,
            pointsRedeemed: priced.redeemPoints,
            note: dto.note ?? null,
            completedAt: status === 'completed' ? now : null,
            createdAt: now,
            lines: {
              createMany: {
                data: priced.lines.map((line, index) => ({
                  productId: line.productId,
                  lineNo: index + 1,
                  name: line.name,
                  sku: line.sku,
                  barcode: line.barcode,
                  unit: line.unit,
                  categoryId: line.categoryId,
                  price: line.price,
                  quantity: line.quantity,
                  costPrice: line.costPrice,
                  productDiscount: line.productDiscount,
                  allocatedDiscount: line.allocatedDiscount,
                  netAmount: line.netAmount,
                  isGift: line.isGift,
                  promotionId: line.promotionId,
                  promoName: line.promoName,
                })),
              },
            },
            promotions: {
              createMany: {
                data: priced.promotions.map((p) => ({
                  promotionId: p.id,
                  code: p.code,
                  name: p.name,
                  kind: p.kind,
                  amount: p.amount,
                })),
              },
            },
            payments: {
              createMany: {
                data: payments.map((p, index) => ({
                  ...p,
                  createdAt: new Date(now.getTime() + index),
                  confirmedAt: p.status === 'confirmed' ? now : null,
                  confirmedById: p.status === 'confirmed' ? user.id : null,
                })),
              },
            },
          },
          select: { id: true },
        });

        if (voucherApplied) {
          await this.vouchers.record(tx, {
            promotionId: voucherApplied.id,
            orderId: order.id,
            orderCode: code,
            customerId: customer?.id,
            discount: totals.voucherDiscount,
            revenue: totals.total,
          });
        }
        if (customer && priced.redeemPoints > 0) {
          await this.membership.redeem(tx, {
            customerId: customer.id,
            points: priced.redeemPoints,
            orderCode: code,
            reason: 'Dùng điểm thanh toán',
            userId: user.id,
          });
        }
        if (status === 'completed') await this.earn(tx, order.id, user.id, now);
        await this.idempotency.save(tx, user.id, key, 'order.create', order.id);
        return { orderId: order.id, code, total: totals.total, status, replayed: false as const };
      },
      { timeout: 15_000 },
    );
    if (!outcome.replayed) {
      await this.audit.log('ORDER_CREATED', client, {
        userId: user.id,
        meta: {
          orderId: outcome.orderId,
          code: outcome.code,
          total: outcome.total,
          status: outcome.status,
        },
      });
    }
    return this.orders.get(user, outcome.orderId);
  }

  async confirmPayment(
    user: AuthUser,
    id: string,
    dto: ConfirmPaymentDto,
    key: string | undefined,
    client: ClientInfo,
  ) {
    if (!key) throw OrderErrors.idempotencyRequired();
    const outcome = await this.prisma.$transaction(async (tx) => {
      if (await this.idempotency.claim(tx, user.id, key, 'order.confirm')) return null;
      const order = await lockOrder(tx, user, id);
      if (order.status !== 'pending') throw OrderErrors.invalidStatus(order.status);
      const pending = order.payments.filter((p) => p.status === 'pending');
      const target = dto.paymentId ? pending.find((p) => p.id === dto.paymentId) : pending[0];
      if (!target) throw OrderErrors.noPendingPayment();
      const now = new Date();
      await tx.orderPayment.update({
        where: { id: target.id },
        data: {
          status: 'confirmed',
          confirmedAt: now,
          confirmedById: user.id,
          reference: dto.reference ?? target.reference,
        },
      });
      const completed = pending.length === 1;
      if (completed) {
        await tx.order.update({ where: { id }, data: { status: 'completed', completedAt: now } });
        await this.earn(tx, id, user.id, now);
      }
      await this.idempotency.save(tx, user.id, key, 'order.confirm', id);
      return {
        code: order.code,
        paymentId: target.id,
        method: target.method,
        amount: target.amount,
        completed,
      };
    });
    if (outcome) {
      await this.audit.log('ORDER_PAYMENT_CONFIRMED', client, {
        userId: user.id,
        meta: { orderId: id, ...outcome },
      });
    }
    return this.orders.get(user, id);
  }

  async cancel(
    user: AuthUser,
    id: string,
    reason: string,
    key: string | undefined,
    client: ClientInfo,
  ) {
    if (!key) throw OrderErrors.idempotencyRequired();
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        if (await this.idempotency.claim(tx, user.id, key, 'order.cancel')) return null;
        const order = await lockOrder(tx, user, id);
        const now = new Date();
        const sameDay = vnDay(order.createdAt) === vnDay(now);
        const cancellable =
          order.status === 'pending' ||
          (order.status === 'completed' && sameDay && order.refundedTotal === 0);
        if (!cancellable) throw OrderErrors.invalidStatus(order.status);
        if (
          user.role === 'cashier' &&
          (order.status !== 'pending' ||
            order.cashierId !== user.id ||
            now.getTime() - order.createdAt.getTime() > CANCEL_WINDOW_MS)
        ) {
          throw OrderErrors.cancelForbidden();
        }
        for (const line of [...order.lines].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        )) {
          const qty = line.quantity - line.returnedQty;
          if (qty <= 0) continue;
          await this.stock.apply(tx, {
            productId: line.productId,
            storeId: order.storeId,
            userId: user.id,
            delta: qty,
            type: 'return',
            reason: `Hủy đơn ${order.code}`,
            refCode: order.code,
          });
        }
        await this.vouchers.revoke(tx, { orderId: id });
        let pointsRevoked = 0;
        if (order.customerId) {
          if (order.pointsRedeemed > 0) {
            await this.points.apply(tx, {
              customerId: order.customerId,
              type: 'adjust',
              points: order.pointsRedeemed,
              refCode: order.code,
              reason: `Hoàn điểm đã dùng – ${order.code}`,
              userId: user.id,
            });
          }
          if (order.status === 'completed') {
            const revoked = await this.membership.revokeOrder(tx, {
              customerId: order.customerId,
              orderTotal: order.total - order.pointsDiscount,
              earnedPoints: order.pointsEarned,
              orderCode: order.code,
              userId: user.id,
            });
            pointsRevoked = revoked.revoked;
          }
        }
        await tx.orderPayment.updateMany({ where: { orderId: id }, data: { status: 'voided' } });
        await tx.order.update({
          where: { id },
          data: {
            status: 'cancelled',
            cancelReason: reason,
            cancelledAt: now,
            cancelledById: user.id,
            pointsRefunded: order.pointsRedeemed,
            pointsRevoked,
          },
        });
        await this.idempotency.save(tx, user.id, key, 'order.cancel', id);
        return { code: order.code, from: order.status, total: order.total, reason };
      },
      { timeout: 15_000 },
    );
    if (outcome)
      await this.audit.log('ORDER_CANCELLED', client, {
        userId: user.id,
        meta: { orderId: id, ...outcome },
      });
    return this.orders.get(user, id);
  }

  async print(user: AuthUser, id: string, client: ClientInfo) {
    const order = await this.prisma.$transaction(async (tx) => {
      const locked = await lockOrder(tx, user, id);
      return tx.order.update({
        where: { id: locked.id },
        data: { printCount: { increment: 1 } },
        select: { code: true, printCount: true },
      });
    });
    await this.audit.log('ORDER_PRINTED', client, {
      userId: user.id,
      meta: { orderId: id, ...order },
    });
    return { printCount: order.printCount };
  }

  private async takeStock(
    tx: Tx,
    user: AuthUser,
    code: string,
    lines: { productId: string; quantity: number }[],
    allowNegative: boolean,
  ) {
    const shortages: { productId: string; available: number }[] = [];
    for (const line of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const { before, after } = await this.stock.apply(tx, {
        productId: line.productId,
        storeId: user.storeId,
        userId: user.id,
        delta: -line.quantity,
        type: 'sale',
        reason: 'Bán hàng',
        refCode: code,
        allowNegative: true,
      });
      if (after < 0) shortages.push({ productId: line.productId, available: Math.max(0, before) });
    }
    if (shortages.length && !allowNegative) throw OrderErrors.outOfStock(shortages);
  }

  private async earn(tx: Tx, orderId: string, userId: string, at: Date) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        code: true,
        total: true,
        pointsDiscount: true,
        customer: { select: { id: true, status: true } },
      },
    });
    if (!order.customer || order.customer.status !== 'active') return;
    const { earned } = await this.membership.applyOrder(tx, {
      customerId: order.customer.id,
      orderTotal: order.total - order.pointsDiscount,
      orderCode: order.code,
      userId,
      at,
    });
    await tx.order.update({ where: { id: orderId }, data: { pointsEarned: earned } });
  }
}
