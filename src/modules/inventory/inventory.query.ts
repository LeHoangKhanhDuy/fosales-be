import { Prisma } from '@prisma/client';
import { toNameKey } from '../../common/utils/text';
import { escapeLike } from '../products/products.utils';
import type { InventoryLevel, InventorySort } from './dto/inventory-query.dto';

export interface InventoryFilter {
  storeId: string;
  keyword?: string;
  categoryId?: string;
  productId?: string;
}

export interface InventoryRow {
  id: string;
  sold: number;
  lastMovementAt: Date | null;
}

export interface LevelCountsRow {
  total: number;
  all: number;
  ok: number;
  low: number;
  out: number;
  slow: number;
}

const LEVELS: Record<InventoryLevel, Prisma.Sql> = {
  out: Prisma.sql`stock <= 0`,
  low: Prisma.sql`stock > 0 AND stock <= min_stock`,
  ok: Prisma.sql`stock > min_stock`,
  slow: Prisma.sql`stock > 0 AND sold = 0`,
};

const ORDER_BY: Record<InventorySort, Prisma.Sql> = {
  'value-desc': Prisma.sql`value DESC, id ASC`,
  'stock-asc': Prisma.sql`stock ASC, id ASC`,
  'stock-desc': Prisma.sql`stock DESC, id ASC`,
  recent: Prisma.sql`last_movement_at DESC NULLS LAST, id ASC`,
  name: Prisma.sql`search_key ASC, id ASC`,
};

function inventory(filter: InventoryFilter) {
  const conditions = [Prisma.sql`p.deleted_at IS NULL`];
  const key = filter.keyword ? toNameKey(filter.keyword) : '';
  if (key) conditions.push(Prisma.sql`p.search_key LIKE ${`%${escapeLike(key)}%`}`);
  if (filter.categoryId) conditions.push(Prisma.sql`p.category_id = ${filter.categoryId}::uuid`);
  if (filter.productId) conditions.push(Prisma.sql`p.id = ${filter.productId}::uuid`);
  return Prisma.sql`
    WITH sales AS (
      SELECT product_id, (-SUM(quantity))::int AS sold
      FROM stock_movements
      WHERE store_id = ${filter.storeId}::uuid AND type = 'sale' AND created_at >= now() - interval '30 days'
      GROUP BY product_id
    ),
    inv AS (
      SELECT
        p.id,
        p.search_key,
        p.min_stock,
        COALESCE(s.quantity, 0) AS stock,
        GREATEST(COALESCE(s.quantity, 0), 0)::bigint * COALESCE(p.cost_price, p.price) AS value,
        COALESCE(sa.sold, 0) AS sold,
        s.last_movement_at
      FROM products p
      LEFT JOIN product_stocks s ON s.product_id = p.id AND s.store_id = ${filter.storeId}::uuid
      LEFT JOIN sales sa ON sa.product_id = p.id
      WHERE ${Prisma.join(conditions, ' AND ')}
    )`;
}

const levelWhere = (level?: InventoryLevel) =>
  level ? Prisma.sql`WHERE ${LEVELS[level]}` : Prisma.empty;

export const inventoryPageSql = (
  filter: InventoryFilter,
  sort: InventorySort,
  take: number,
  skip: number,
  level?: InventoryLevel,
) => Prisma.sql`${inventory(filter)}
  SELECT id, sold, last_movement_at AS "lastMovementAt" FROM inv ${levelWhere(level)}
  ORDER BY ${ORDER_BY[sort]} LIMIT ${take} OFFSET ${skip}`;

export const inventoryCountsSql = (
  filter: InventoryFilter,
  level?: InventoryLevel,
) => Prisma.sql`${inventory(filter)}
  SELECT
    (count(*) FILTER (WHERE ${level ? LEVELS[level] : Prisma.sql`TRUE`}))::int AS total,
    count(*)::int AS "all",
    (count(*) FILTER (WHERE ${LEVELS.ok}))::int AS ok,
    (count(*) FILTER (WHERE ${LEVELS.low}))::int AS low,
    (count(*) FILTER (WHERE ${LEVELS.out}))::int AS out,
    (count(*) FILTER (WHERE ${LEVELS.slow}))::int AS slow
  FROM inv`;

export const inventoryStatsSql = (storeId: string) => Prisma.sql`${inventory({ storeId })}
  SELECT
    COALESCE(sum(value), 0)::bigint AS "stockValue",
    count(*)::int AS "skuCount",
    COALESCE(sum(stock), 0)::bigint AS units,
    (count(*) FILTER (WHERE ${LEVELS.low}))::int AS low,
    (count(*) FILTER (WHERE ${LEVELS.out}))::int AS out,
    (count(*) FILTER (WHERE ${LEVELS.slow}))::int AS slow
  FROM inv`;

export interface InventoryStatsRow {
  stockValue: bigint;
  skuCount: number;
  units: bigint;
  low: number;
  out: number;
  slow: number;
}
