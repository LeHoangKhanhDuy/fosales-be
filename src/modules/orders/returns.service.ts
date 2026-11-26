import { Injectable } from '@nestjs/common';
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
import { CreateReturnDto, RefundOptionsDto } from './dto/order.dto';
import { lockOrder } from './order-access';
import { OrderErrors } from './orders.errors';
import { OrdersService } from './orders.service';
import { DAY_MS } from './orders.utils';

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly stock: StockLedger,
    private readonly vouchers: VoucherService,
    private readonly membership: MembershipService,
    private readonly points: PointLedger,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
  ) {}

  async refundAll(
    user: AuthUser,
    orderId: string,
    dto: RefundOptionsDto,
    key: string | undefined,
    client: ClientInfo,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...(user.role === 'admin' ? {} : { storeId: user.storeId }) },
      select: {
        lines: { select: { id: true, quantity: true, returnedQty: true } },
        payments: { select: { method: true, amount: true } },
      },
    });
    if (!order) throw OrderErrors.notFound();
    const primary = order.payments
      .filter((p) => p.method !== 'points')
      .sort((a, b) => b.amount - a.amount)[0]?.method;
    return this.create(
      user,
      orderId,
      {
        ...dto,
        refundMethod: dto.refundMethod ?? (primary && primary !== 'points' ? primary : 'cash'),
        lines: order.lines
          .filter((line) => line.quantity > line.returnedQty)
          .map((line) => ({
            orderLineId: line.id,
            quantity: line.quantity - line.returnedQty,
            restock: true,
          })),
      },
      key,
      client,
    );
  }

  async create(
    user: AuthUser,
    orderId: string,
    dto: CreateReturnDto,
    key: string | undefined,
    client: ClientInfo,
  ) {
    if (!key) throw OrderErrors.idempotencyRequired();
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const replayed = await this.idempotency.claim(tx, user.id, key, 'order.return');
        if (replayed) return { returnId: replayed, replayed: true as const };
        const order = await lockOrder(tx, user, orderId);
        if (order.status !== 'completed' && order.status !== 'partially_refunded') {
          throw OrderErrors.invalidStatus(order.status);
        }
        const store = await tx.store.findUniqueOrThrow({
          where: { id: order.storeId },
          select: { returnDays: true },
        });
        if (
          Date.now() - order.createdAt.getTime() > store.returnDays * DAY_MS &&
          !(dto.override && user.role === 'admin')
        ) {
          throw OrderErrors.returnExpired(store.returnDays);
        }
        if (!dto.lines.length)
          throw OrderErrors.returnLineInvalid('Chọn ít nhất 1 dòng hàng để trả');
        const ids = dto.lines.map((l) => l.orderLineId);
        if (new Set(ids).size !== ids.length)
          throw OrderErrors.returnLineInvalid('Dòng hàng bị trùng');
        const byId = new Map(order.lines.map((line) => [line.id, line]));
        const picked = dto.lines.map((input) => {
          const line = byId.get(input.orderLineId);
          if (!line)
            throw OrderErrors.returnLineInvalid('Dòng hàng không thuộc đơn này', input.orderLineId);
          const remaining = line.quantity - line.returnedQty;
          if (input.quantity > remaining) {
            throw OrderErrors.returnLineInvalid(
              `Chỉ còn ${remaining} ${line.unit} có thể trả`,
              input.orderLineId,
            );
          }
          const finalLine = input.quantity === remaining;
          const refundAmount = finalLine
            ? line.netAmount - line.refundedAmount
            : Math.round((line.netAmount / line.quantity) * input.quantity);
          return { line, input, refundAmount };
        });
        const giftOnly = picked.some((p) => p.line.isGift) && picked.every((p) => p.line.isGift);
        if (giftOnly) throw OrderErrors.returnLineInvalid('Quà tặng không trả riêng');

        const closing = order.lines.every((line) => {
          const p = picked.find((x) => x.line.id === line.id);
          return line.returnedQty + (p?.input.quantity ?? 0) >= line.quantity;
        });
        const refundable = order.total - order.refundedTotal;
        const refundTotal = closing
          ? refundable
          : Math.min(
              refundable,
              picked.reduce((sum, p) => sum + p.refundAmount, 0),
            );
        const pointValue = order.pointsRedeemed ? order.pointsDiscount / order.pointsRedeemed : 0;
        const pointsRefunded = closing
          ? order.pointsRedeemed - order.pointsRefunded
          : order.total
            ? Math.min(
                order.pointsRedeemed - order.pointsRefunded,
                Math.round((order.pointsRedeemed * refundTotal) / order.total),
              )
            : 0;
        const cashRefund = Math.max(0, refundTotal - pointsRefunded * pointValue);

        const code = await nextDailyCode(tx, 'return_receipts', 'TH');
        const receipt = await tx.returnReceipt.create({
          data: {
            code,
            orderId,
            storeId: order.storeId,
            refundTotal,
            cashRefund,
            refundMethod: dto.refundMethod,
            refundReference: dto.refundReference ?? null,
            reason: dto.reason,
            note: dto.note ?? null,
            pointsRefunded,
            createdById: user.id,
            approvedBy: dto.approvedBy ?? null,
            lines: {
              createMany: {
                data: picked.map((p) => ({
                  orderLineId: p.line.id,
                  productId: p.line.productId,
                  quantity: p.input.quantity,
                  refundAmount: p.refundAmount,
                  restock: p.input.restock,
                })),
              },
            },
          },
          select: { id: true },
        });

        for (const p of [...picked].sort((a, b) =>
          a.line.productId.localeCompare(b.line.productId),
        )) {
          await tx.orderLine.update({
            where: { id: p.line.id },
            data: {
              returnedQty: { increment: p.input.quantity },
              refundedAmount: { increment: p.refundAmount },
            },
          });
          if (!p.input.restock) continue;
          await this.stock.apply(tx, {
            productId: p.line.productId,
            storeId: order.storeId,
            userId: user.id,
            delta: p.input.quantity,
            type: 'return',
            reason: `Trả hàng ${order.code}`,
            refCode: code,
          });
        }

        let pointsRevoked = 0;
        if (order.customerId) {
          if (pointsRefunded > 0) {
            await this.points.apply(tx, {
              customerId: order.customerId,
              type: 'adjust',
              points: pointsRefunded,
              refCode: code,
              reason: `Hoàn điểm đã dùng – ${code}`,
              userId: user.id,
            });
          }
          const earnedLeft = order.pointsEarned - order.pointsRevoked;
          const toRevoke = closing
            ? earnedLeft
            : Math.min(earnedLeft, Math.floor((order.pointsEarned * refundTotal) / order.total));
          const revoked = await this.membership.revokeOrder(tx, {
            customerId: order.customerId,
            orderTotal: cashRefund,
            earnedPoints: toRevoke,
            orderCode: code,
            userId: user.id,
            keepOrderCount: !closing,
          });
          pointsRevoked = revoked.revoked;
          await tx.returnReceipt.update({ where: { id: receipt.id }, data: { pointsRevoked } });
        }
        if (closing) await this.vouchers.revoke(tx, { orderId });
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: closing ? 'refunded' : 'partially_refunded',
            refundedTotal: { increment: refundTotal },
            pointsRefunded: { increment: pointsRefunded },
            pointsRevoked: { increment: pointsRevoked },
          },
        });
        await this.idempotency.save(tx, user.id, key, 'order.return', receipt.id);
        return {
          returnId: receipt.id,
          code,
          orderCode: order.code,
          refundTotal,
          closing,
          replayed: false as const,
        };
      },
      { timeout: 15_000 },
    );
    if (!outcome.replayed) {
      await this.audit.log('ORDER_RETURNED', client, {
        userId: user.id,
        meta: {
          orderId,
          returnId: outcome.returnId,
          code: outcome.code,
          orderCode: outcome.orderCode,
          refundTotal: outcome.refundTotal,
          full: outcome.closing,
        },
      });
    }
    return this.orders.getReturn(user, outcome.returnId);
  }
}
