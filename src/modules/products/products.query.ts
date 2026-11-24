import { Prisma } from '@prisma/client';
import { toNameKey } from '../../common/utils/text';
import type { ProductSort, StockFilter } from './dto/product-query.dto';
import { escapeLike } from './products.utils';

export interface ProductFilter {
  storeId: string;
  keyword?: string;
  categoryId?: string;
  status?: 'active' | 'inactive';
  stock?: StockFilter;
}

const QTY = Prisma.sql`COALESCE(s.quantity, 0)`;

const STOCK_CONDITIONS: Record<StockFilter, Prisma.Sql> = {
  'in-stock': Prisma.sql`${QTY} > 0`,
  low: Prisma.sql`${QTY} > 0 AND ${QTY} <= p.min_stock`,
  out: Prisma.sql`${QTY} <= 0`,
};

const ORDER_BY: Record<ProductSort, Prisma.Sql> = {
  newest: Prisma.sql`p.created_at DESC, p.id DESC`,
  name: Prisma.sql`p.search_key ASC, p.id ASC`,
  'price-desc': Prisma.sql`p.price DESC, p.id ASC`,
  'price-asc': Prisma.sql`p.price ASC, p.id ASC`,
  'stock-asc': Prisma.sql`${QTY} ASC, p.id ASC`,
};

function source(filter: ProductFilter) {
  const conditions = [Prisma.sql`p.deleted_at IS NULL`];
  const key = filter.keyword ? toNameKey(filter.keyword) : '';
  if (key) conditions.push(Prisma.sql`p.search_key LIKE ${`%${escapeLike(key)}%`}`);
  if (filter.categoryId) conditions.push(Prisma.sql`p.category_id = ${filter.categoryId}::uuid`);
  if (filter.status) conditions.push(Prisma.sql`p.status = ${filter.status}::"ProductStatus"`);
  if (filter.stock) conditions.push(STOCK_CONDITIONS[filter.stock]);
  return Prisma.sql`FROM products p
    LEFT JOIN product_stocks s ON s.product_id = p.id AND s.store_id = ${filter.storeId}::uuid
    WHERE ${Prisma.join(conditions, ' AND ')}`;
}

export const pageIdsSql = (filter: ProductFilter, sort: ProductSort, take: number, skip: number) =>
  Prisma.sql`SELECT p.id ${source(filter)} ORDER BY ${ORDER_BY[sort]} LIMIT ${take} OFFSET ${skip}`;

export const countSql = (filter: ProductFilter) =>
  Prisma.sql`SELECT count(*)::int AS total ${source(filter)}`;

export const statsSql = (filter: ProductFilter) => Prisma.sql`
  SELECT
    count(*)::int AS total,
    (count(*) FILTER (WHERE p.status = 'active'))::int AS active,
    COALESCE(sum(${QTY}::bigint * COALESCE(p.cost_price, p.price)), 0)::bigint AS "inventoryValue",
    COALESCE(sum(${QTY}), 0)::bigint AS "inventoryUnits",
    (count(*) FILTER (WHERE ${QTY} > 0 AND ${QTY} <= p.min_stock))::int AS low,
    (count(*) FILTER (WHERE ${QTY} <= 0))::int AS out
  ${source(filter)}`;

export interface StatsRow {
  total: number;
  active: number;
  inventoryValue: bigint;
  inventoryUnits: bigint;
  low: number;
  out: number;
}
