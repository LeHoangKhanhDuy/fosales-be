import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerErrors } from '../customers/customers.errors';
import { earnedPoints, tierSetting } from '../customers/membership.rules';
import { MembershipService } from '../customers/membership.service';
import {
  promotionInclude,
  scopeOf,
  toVoucher,
  type PromotionRow,
} from '../promotions/promotion.mapper';
import { calcDiscount, inScope, isUsedUp } from '../promotions/promotions.utils';
import { evaluateVoucher, VoucherService } from '../promotions/voucher.service';
import { OrderErrors } from './orders.errors';
import { allocateDiscounts } from './orders.utils';

type Client = Prisma.TransactionClient | PrismaService;

export interface PriceInput {
  storeId: string;
  items: { productId: string; quantity: number }[];
  customerId?: string | null;
  voucherCode?: string | null;
  redeemPoints?: number;
}

interface PriceMode {
  strict: boolean;
}

const productSelect = (storeId: string) =>
  ({
    id: true,
    name: true,
    sku: true,
    barcode: true,
    categoryId: true,
    image: true,
    imageFit: true,
    price: true,
    costPrice: true,
    status: true,
    deletedAt: true,
    unit: { select: { name: true } },
    category: { select: { status: true } },
    stocks: { where: { storeId }, select: { quantity: true } },
  }) satisfies Prisma.ProductSelect;

function mergeItems(items: PriceInput['items']) {
  const merged = new Map<string, number>();
  for (const item of items)
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly vouchers: VoucherService,
  ) {}

  async price(client: Client, input: PriceInput, mode: PriceMode) {
    const items = mergeItems(input.items);
    const now = new Date();
    const [products, store, autoPromos, settings] = await Promise.all([
      client.product.findMany({
        where: { id: { in: items.map((i) => i.productId) } },
        select: productSelect(input.storeId),
      }),
      client.store.findUniqueOrThrow({
        where: { id: input.storeId },
        select: { allowNegativeStock: true },
      }),
      client.promotion.findMany({
        where: {
          kind: { in: ['product', 'order'] },
          state: 'active',
          startAt: { lte: now },
          OR: [{ endAt: null }, { endAt: { gte: now } }],
        },
        include: promotionInclude,
      }),
      this.membership.settings(),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const invalid = items
      .filter(({ productId }) => {
        const p = byId.get(productId);
        return (
          !p ||
          p.deletedAt ||
          p.status !== 'active' ||
          (p.category && p.category.status !== 'active')
        );
      })
      .map((i) => i.productId);
    if (invalid.length) throw OrderErrors.productInvalid(invalid);
    const promos = autoPromos.filter((p) => !isUsedUp(p));

    const lines = items.map(({ productId, quantity }) => {
      const p = byId.get(productId)!;
      const item = { productId, categoryId: p.categoryId };
      let best: { promo: PromotionRow; unit: number } | null = null;
      for (const promo of promos) {
        if (promo.kind !== 'product' || !inScope(scopeOf(promo), item)) continue;
        const unit = calcDiscount(p.price, promo.discountType, promo.discountValue);
        if (unit > 0 && (!best || unit > best.unit)) best = { promo, unit };
      }
      return {
        productId,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        unit: p.unit?.name ?? '',
        categoryId: p.categoryId,
        image: p.image,
        imageFit: p.imageFit,
        price: p.price,
        quantity,
        stock: p.stocks[0]?.quantity ?? 0,
        costPrice: p.costPrice ?? 0,
        productDiscount: best ? best.unit * quantity : 0,
        promotionId: best?.promo.id ?? null,
        promoName: best?.promo.name ?? null,
        promoCode: best?.promo.code ?? null,
        isGift: false,
        inVoucherScope: false,
      };
    });

    const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
    const productDiscount = lines.reduce((sum, l) => sum + l.productDiscount, 0);
    const afterItems = subtotal - productDiscount;

    let order: { promo: PromotionRow; amount: number } | null = null;
    for (const promo of promos) {
      if (promo.kind !== 'order' || afterItems < (promo.minOrder ?? 0)) continue;
      const amount = calcDiscount(
        afterItems,
        promo.discountType,
        promo.discountValue,
        promo.maxDiscount,
      );
      if (amount > 0 && (!order || amount > order.amount)) order = { promo, amount };
    }

    const customer = input.customerId
      ? await client.customer.findUnique({
          where: { id: input.customerId },
          select: {
            id: true,
            code: true,
            name: true,
            phone: true,
            tier: true,
            points: true,
            status: true,
          },
        })
      : null;
    if (input.customerId && !customer) throw CustomerErrors.notFound();
    if (customer && customer.status !== 'active') throw CustomerErrors.blocked();

    let voucher: PromotionRow | null = null;
    let voucherRaw = 0;
    let voucherIssue: string | null = null;
    if (input.voucherCode?.trim()) {
      try {
        const row = await this.vouchers.resolve(
          client,
          input.voucherCode,
          customer?.id ?? null,
          mode.strict,
        );
        const evaluated = evaluateVoucher(row, {
          lines: lines.map((l) => ({ ...l, discount: l.productDiscount })),
          subtotalAfterItems: afterItems,
          orderPromo: order ? { name: order.promo.name, amount: order.amount } : null,
        });
        voucher = row;
        voucherRaw = evaluated.discount;
        if (evaluated.dropOrderPromo) order = null;
        for (const line of lines) line.inVoucherScope = inScope(evaluated.scope, line);
      } catch (error) {
        if (mode.strict || !(error instanceof AppException)) throw error;
        voucherIssue = error.body.message;
      }
    }

    const orderDiscount = order?.amount ?? 0;
    const tier = customer ? tierSetting(settings, customer.tier) : null;
    const memberDiscount =
      tier && tier.discountPercent > 0 && lines.length
        ? calcDiscount(afterItems - orderDiscount, 'percent', tier.discountPercent)
        : 0;
    const voucherDiscount = Math.max(
      0,
      Math.min(voucherRaw, afterItems - orderDiscount - memberDiscount),
    );
    const total = subtotal - productDiscount - orderDiscount - memberDiscount - voucherDiscount;

    const redeemPoints = input.redeemPoints ?? 0;
    const maxRedeemPoints = customer
      ? Math.min(customer.points, Math.floor(total / settings.pointValue))
      : 0;
    if (redeemPoints > 0) {
      if (!customer) throw OrderErrors.pointsNeedCustomer();
      if (redeemPoints > customer.points) throw CustomerErrors.pointsInsufficient(customer.points);
      if (redeemPoints > maxRedeemPoints)
        throw OrderErrors.pointsExceedTotal(customer.points, maxRedeemPoints);
    }
    const pointsDiscount = redeemPoints * settings.pointValue;
    const due = total - pointsDiscount;

    const allocated = allocateDiscounts(
      lines.map((l) => ({
        base: l.price * l.quantity - l.productDiscount,
        inVoucherScope: l.inVoucherScope,
      })),
      voucherDiscount,
      orderDiscount + memberDiscount,
    );
    const pricedLines = lines.map((line, index) => ({
      ...line,
      allocatedDiscount: allocated[index],
      netAmount: line.price * line.quantity - line.productDiscount - allocated[index],
    }));

    const promotions: {
      id: string | null;
      code: string;
      name: string;
      kind: string;
      amount: number;
    }[] = [];
    for (const line of pricedLines) {
      if (!line.promotionId || !line.productDiscount) continue;
      const existing = promotions.find((p) => p.id === line.promotionId);
      if (existing) existing.amount += line.productDiscount;
      else
        promotions.push({
          id: line.promotionId,
          code: line.promoCode!,
          name: line.promoName!,
          kind: 'product',
          amount: line.productDiscount,
        });
    }
    if (order)
      promotions.push({
        id: order.promo.id,
        code: order.promo.code,
        name: order.promo.name,
        kind: 'order',
        amount: orderDiscount,
      });
    if (tier && memberDiscount > 0) {
      promotions.push({
        id: null,
        code: tier.tier.toUpperCase(),
        name: `Ưu đãi hạng ${tier.label}`,
        kind: 'member',
        amount: memberDiscount,
      });
    }
    if (voucher && voucherDiscount > 0) {
      promotions.push({
        id: voucher.id,
        code: voucher.code,
        name: voucher.name,
        kind: 'voucher',
        amount: voucherDiscount,
      });
    }

    return {
      lines: pricedLines,
      promotions,
      customer,
      member: tier
        ? { tier: tier.tier, label: tier.label, discountPercent: tier.discountPercent }
        : null,
      voucher,
      voucherIssue,
      totals: {
        itemCount: pricedLines.reduce((sum, l) => sum + l.quantity, 0),
        subtotal,
        productDiscount,
        orderDiscount,
        memberDiscount,
        voucherDiscount,
        pointsDiscount,
        discountAmount: productDiscount + orderDiscount + memberDiscount + voucherDiscount,
        total,
        due,
      },
      redeemPoints,
      pointValue: settings.pointValue,
      maxRedeemPoints,
      pointsToEarn: customer ? earnedPoints(settings, customer.tier, due) : 0,
      stockWarnings: pricedLines
        .filter((l) => l.quantity > l.stock)
        .map((l) => ({ productId: l.productId, requested: l.quantity, available: l.stock })),
      allowNegativeStock: store.allowNegativeStock,
    };
  }
}

export type Priced = Awaited<ReturnType<PricingService['price']>>;

export function toQuote(priced: Priced) {
  return {
    lines: priced.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      sku: l.sku,
      barcode: l.barcode,
      unit: l.unit,
      categoryId: l.categoryId,
      image: l.image,
      imageFit: l.imageFit,
      price: l.price,
      quantity: l.quantity,
      stock: l.stock,
      productDiscount: l.productDiscount,
      allocatedDiscount: l.allocatedDiscount,
      netAmount: l.netAmount,
      promotionId: l.promotionId,
      promoName: l.promoName,
      isGift: l.isGift,
    })),
    gifts: [],
    promotions: priced.promotions,
    customer: priced.customer,
    member: priced.member,
    voucher: priced.voucher ? toVoucher(priced.voucher) : null,
    voucherIssue: priced.voucherIssue,
    totals: priced.totals,
    redeemPoints: priced.redeemPoints,
    pointValue: priced.pointValue,
    maxRedeemPoints: priced.maxRedeemPoints,
    pointsToEarn: priced.pointsToEarn,
    stockWarnings: priced.allowNegativeStock ? [] : priced.stockWarnings,
  };
}
