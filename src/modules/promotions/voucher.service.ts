import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerErrors } from '../customers/customers.errors';
import { ValidateVoucherDto } from './dto/promotion.dto';
import { promotionInclude, scopeOf, toVoucher, type PromotionRow } from './promotion.mapper';
import { PromotionErrors } from './promotions.errors';
import { calcDiscount, inScope, isUsedUp, promotionStatus, vnDateLabel } from './promotions.utils';
import { VoucherRateLimit } from './voucher-rate-limit';

type Client = Prisma.TransactionClient | PrismaService;

export interface RedeemLine {
  productId: string;
  categoryId: string | null;
  price: number;
  quantity: number;
  discount: number;
}

export interface RedeemInput {
  code: string;
  customerId?: string | null;
  orderId: string;
  orderCode: string;
  lines: RedeemLine[];
  subtotalAfterItems: number;
  orderPromo?: { name: string; amount: number } | null;
  memberDiscount?: number;
  userId: string;
}

@Injectable()
export class VoucherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: VoucherRateLimit,
  ) {}

  async validate(user: AuthUser, dto: ValidateVoucherDto) {
    this.limiter.consume(user.id);
    const promotion = await this.prisma.promotion.findUnique({
      where: { code: dto.code.trim().toUpperCase() },
      include: promotionInclude,
    });
    await this.check(this.prisma, promotion, dto.customerId ?? null);
    return toVoucher(promotion!);
  }

  async redeem(tx: Prisma.TransactionClient, input: RedeemInput) {
    const code = input.code.trim().toUpperCase();
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM promotions WHERE code = ${code} FOR UPDATE`;
    const promotion = locked
      ? await tx.promotion.findUnique({ where: { id: locked.id }, include: promotionInclude })
      : null;
    await this.check(tx, promotion, input.customerId ?? null);
    const voucher = promotion!;
    const scope = scopeOf(voucher);

    const eligible = input.lines
      .filter((line) => inScope(scope, line))
      .reduce((sum, line) => sum + line.price * line.quantity - line.discount, 0);
    if (eligible <= 0) throw PromotionErrors.voucherScopeMismatch();
    const missing = (voucher.minOrder ?? 0) - input.subtotalAfterItems;
    if (missing > 0) throw PromotionErrors.voucherMinOrder(missing);

    let discount = calcDiscount(
      eligible,
      voucher.discountType,
      voucher.discountValue,
      voucher.maxDiscount,
    );
    let dropOrderPromo = false;
    const orderPromo = input.orderPromo && input.orderPromo.amount > 0 ? input.orderPromo : null;
    if (orderPromo && !voucher.stackable) {
      if (discount >= orderPromo.amount) dropOrderPromo = true;
      else throw PromotionErrors.voucherNotStackable(orderPromo.name);
    }
    const orderDiscount = dropOrderPromo ? 0 : (orderPromo?.amount ?? 0);
    const memberDiscount = input.memberDiscount ?? 0;
    discount = Math.max(
      0,
      Math.min(discount, input.subtotalAfterItems - orderDiscount - memberDiscount),
    );
    const revenue = Math.max(
      0,
      input.subtotalAfterItems - orderDiscount - memberDiscount - discount,
    );

    if (await tx.promotionRedemption.count({ where: { orderId: input.orderId } })) {
      throw PromotionErrors.voucherAlreadyApplied();
    }
    const redemption = await tx.promotionRedemption.create({
      data: {
        promotionId: voucher.id,
        orderId: input.orderId,
        orderCode: input.orderCode,
        customerId: input.customerId ?? null,
        discount,
        revenue,
      },
      select: { id: true },
    });
    await tx.promotion.update({ where: { id: voucher.id }, data: { usedCount: { increment: 1 } } });
    return {
      promotion: toVoucher(voucher),
      discount,
      dropOrderPromo,
      revenue,
      redemptionId: redemption.id,
    };
  }

  async revoke(tx: Prisma.TransactionClient, { orderId }: { orderId: string }) {
    const redemption = await tx.promotionRedemption.findUnique({
      where: { orderId },
      select: { id: true, promotionId: true, revokedAt: true },
    });
    if (!redemption || redemption.revokedAt) return { revoked: false };
    await tx.$queryRaw`SELECT id FROM promotions WHERE id = ${redemption.promotionId}::uuid FOR UPDATE`;
    await tx.promotionRedemption.update({
      where: { id: redemption.id },
      data: { revokedAt: new Date() },
    });
    await tx.$executeRaw`
      UPDATE promotions SET used_count = GREATEST(used_count - 1, 0), updated_at = now()
      WHERE id = ${redemption.promotionId}::uuid`;
    return { revoked: true, promotionId: redemption.promotionId };
  }

  private async check(client: Client, promotion: PromotionRow | null, customerId: string | null) {
    if (!promotion || promotion.kind !== 'voucher' || promotion.state === 'draft') {
      throw PromotionErrors.voucherNotFound();
    }
    const status = promotionStatus(promotion);
    if (status === 'scheduled') {
      throw PromotionErrors.voucherNotStarted(promotion.startAt, vnDateLabel(promotion.startAt));
    }
    if (status === 'paused') throw PromotionErrors.voucherPaused();
    if (status === 'ended') {
      throw isUsedUp(promotion)
        ? PromotionErrors.voucherUsedUp()
        : PromotionErrors.voucherExpired();
    }
    if (promotion.perCustomerLimit && !customerId) throw PromotionErrors.voucherMemberOnly();
    if (!customerId) return;
    const customer = await client.customer.findUnique({
      where: { id: customerId },
      select: { status: true },
    });
    if (!customer) throw CustomerErrors.notFound();
    if (customer.status !== 'active') throw CustomerErrors.blocked();
    if (promotion.perCustomerLimit) {
      const used = await client.promotionRedemption.count({
        where: { promotionId: promotion.id, customerId, revokedAt: null },
      });
      if (used >= promotion.perCustomerLimit) {
        throw PromotionErrors.voucherCustomerLimit(promotion.perCustomerLimit);
      }
    }
  }
}
