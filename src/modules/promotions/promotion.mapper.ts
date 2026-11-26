import type { Prisma } from '@prisma/client';
import type { UsageRow } from './promotions.query';
import { promotionStatus, type Scope } from './promotions.utils';

export const promotionInclude = {
  categories: { select: { categoryId: true } },
  products: { select: { productId: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.PromotionInclude;

export type PromotionRow = Prisma.PromotionGetPayload<{ include: typeof promotionInclude }>;

export const scopeOf = (
  row: Pick<PromotionRow, 'scopeType' | 'categories' | 'products'>,
): Scope => ({
  type: row.scopeType,
  categoryIds: row.categories.map((c) => c.categoryId),
  productIds: row.products.map((p) => p.productId),
});

export const toUsage = (row?: Omit<UsageRow, 'promotionId'>) => ({
  count: row?.count ?? 0,
  discount: Number(row?.discount ?? 0),
  revenue: Number(row?.revenue ?? 0),
  last30Count: row?.last30Count ?? 0,
  last30Discount: Number(row?.last30Discount ?? 0),
  lastUsedAt: row?.lastUsedAt ?? null,
});

export const toPromotion = (row: PromotionRow, usage?: Omit<UsageRow, 'promotionId'>) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description,
  kind: row.kind,
  discountType: row.discountType,
  discountValue: row.discountValue,
  maxDiscount: row.maxDiscount,
  minOrder: row.minOrder,
  scope: scopeOf(row),
  usageLimit: row.usageLimit,
  perCustomerLimit: row.perCustomerLimit,
  stackable: row.stackable,
  state: row.state,
  status: promotionStatus(row),
  startAt: row.startAt,
  endAt: row.endAt,
  usedCount: row.usedCount,
  createdBy: row.createdBy.name,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  usage: toUsage(usage),
});

export const toVoucher = (row: PromotionRow) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  type: row.discountType,
  value: row.discountValue,
  maxDiscount: row.maxDiscount,
  minOrder: row.minOrder,
  expiresAt: row.endAt,
  scope: scopeOf(row),
  stackable: row.stackable,
});
