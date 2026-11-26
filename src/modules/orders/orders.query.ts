import { Prisma } from '@prisma/client';

export interface StatsRow {
  orders: number;
  revenue: bigint;
  completed: number;
  pending: number;
  pendingAmount: bigint;
  cancelled: number;
  cancelledAmount: bigint;
  refunded: number;
  refundedAmount: bigint;
}

export interface MethodRow {
  method: string;
  amount: bigint;
}

export interface TodayRow {
  revenue: bigint;
  orders: number;
  itemsSold: number;
  customers: number;
}

const scopeSql = (storeId: string | null) =>
  storeId ? Prisma.sql`o.store_id = ${storeId}::uuid` : Prisma.sql`TRUE`;

const rangeSql = (from?: Date, to?: Date) =>
  Prisma.sql`${from ? Prisma.sql`AND o.created_at >= ${from}` : Prisma.empty} ${to ? Prisma.sql`AND o.created_at < ${to}` : Prisma.empty}`;

const SOLD = Prisma.sql`o.status IN ('completed', 'partially_refunded', 'refunded')`;

export const orderStatsSql = (storeId: string | null, from?: Date, to?: Date) => Prisma.sql`
  SELECT
    count(*)::int AS orders,
    COALESCE(SUM(o.total - o.refunded_total) FILTER (WHERE ${SOLD}), 0)::bigint AS revenue,
    (count(*) FILTER (WHERE o.status IN ('completed', 'partially_refunded')))::int AS completed,
    (count(*) FILTER (WHERE o.status = 'pending'))::int AS pending,
    COALESCE(SUM(o.total) FILTER (WHERE o.status = 'pending'), 0)::bigint AS "pendingAmount",
    (count(*) FILTER (WHERE o.status = 'cancelled'))::int AS cancelled,
    COALESCE(SUM(o.total) FILTER (WHERE o.status = 'cancelled'), 0)::bigint AS "cancelledAmount",
    (count(*) FILTER (WHERE o.status IN ('partially_refunded', 'refunded')))::int AS refunded,
    COALESCE(SUM(o.refunded_total), 0)::bigint AS "refundedAmount"
  FROM orders o
  WHERE ${scopeSql(storeId)} ${rangeSql(from, to)}`;

export const methodStatsSql = (storeId: string | null, from?: Date, to?: Date) => Prisma.sql`
  SELECT p.method::text AS method, COALESCE(SUM(p.amount), 0)::bigint AS amount
  FROM order_payments p
  JOIN orders o ON o.id = p.order_id
  WHERE p.status = 'confirmed' AND o.status <> 'cancelled' AND ${scopeSql(storeId)} ${rangeSql(from, to)}
  GROUP BY p.method`;

export const todaySql = (storeId: string | null, from: Date, to: Date) => Prisma.sql`
  SELECT
    COALESCE(SUM(o.total - o.refunded_total) FILTER (WHERE ${SOLD}), 0)::bigint AS revenue,
    (count(*) FILTER (WHERE o.status <> 'cancelled'))::int AS orders,
    COALESCE((
      SELECT SUM(l.quantity - l.returned_qty) FROM order_lines l
      JOIN orders x ON x.id = l.order_id
      WHERE x.status <> 'cancelled' AND ${storeId ? Prisma.sql`x.store_id = ${storeId}::uuid` : Prisma.sql`TRUE`}
        AND x.created_at >= ${from} AND x.created_at < ${to}
    ), 0)::int AS "itemsSold",
    (count(DISTINCT o.customer_id) FILTER (WHERE o.status <> 'cancelled'))::int AS customers
  FROM orders o
  WHERE ${scopeSql(storeId)} AND o.created_at >= ${from} AND o.created_at < ${to}`;
