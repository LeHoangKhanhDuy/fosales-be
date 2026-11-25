import { Prisma } from '@prisma/client';
import type { SupplierSort, SupplierTab } from './dto/supplier-query.dto';
import { searchTerm } from './suppliers.utils';
import { escapeLike } from '../products/products.utils';

export interface SupplierFilter {
  keyword?: string;
  categoryId?: string;
  id?: string;
}

export interface SummaryRow {
  id: string;
  purchased: bigint;
  paid: bigint;
  overdue: bigint;
  nextDueAt: Date | null;
  lastReceiptAt: Date | null;
  orderCount: number;
  openOrders: number;
}

export interface TabCountsRow {
  total: number;
  all: number;
  active: number;
  suspended: number;
  inactive: number;
  debt: number;
}

export interface SupplierStatsRow {
  total: number;
  active: number;
  suspended: number;
  purchased30: bigint;
  debt: bigint;
  debtors: number;
  overdue: bigint;
  overdueCount: number;
  openOrders: number;
}

const TABS: Record<SupplierTab, Prisma.Sql> = {
  active: Prisma.sql`status = 'active'`,
  suspended: Prisma.sql`status = 'suspended'`,
  inactive: Prisma.sql`status = 'inactive'`,
  debt: Prisma.sql`debt > 0`,
};

const ORDER_BY: Record<SupplierSort, Prisma.Sql> = {
  newest: Prisma.sql`created_at DESC, id DESC`,
  name: Prisma.sql`name_key ASC, id ASC`,
  debt: Prisma.sql`debt DESC, id ASC`,
  purchased: Prisma.sql`purchased DESC, id ASC`,
};

function summary(filter: SupplierFilter) {
  const conditions = [Prisma.sql`TRUE`];
  const term = filter.keyword ? searchTerm(filter.keyword) : '';
  if (term) conditions.push(Prisma.sql`s.search_key LIKE ${`%${escapeLike(term)}%`}`);
  if (filter.id) conditions.push(Prisma.sql`s.id = ${filter.id}::uuid`);
  if (filter.categoryId) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM supplier_categories sc
      WHERE sc.supplier_id = s.id AND sc.category_id = ${filter.categoryId}::uuid)`);
  }
  return Prisma.sql`
    WITH totals AS (
      SELECT supplier_id,
        COALESCE(SUM(amount) FILTER (WHERE kind IN ('receipt', 'return')), 0) AS purchased,
        -COALESCE(SUM(amount) FILTER (WHERE kind = 'payment'), 0) AS paid,
        -COALESCE(SUM(amount) FILTER (WHERE amount < 0), 0) AS credit,
        MAX(occurred_at) FILTER (WHERE kind = 'receipt') AS last_receipt_at
      FROM supplier_ledger_entries
      GROUP BY supplier_id
    ),
    receipts AS (
      SELECT supplier_id, amount, due_at,
        SUM(amount) OVER (PARTITION BY supplier_id ORDER BY occurred_at, id) AS cumulative
      FROM supplier_ledger_entries
      WHERE kind = 'receipt'
    ),
    remaining AS (
      SELECT r.supplier_id, r.due_at,
        GREATEST(0, LEAST(r.amount, r.cumulative - COALESCE(t.credit, 0))) AS left_amount
      FROM receipts r
      LEFT JOIN totals t USING (supplier_id)
    ),
    due AS (
      SELECT supplier_id,
        COALESCE(SUM(left_amount) FILTER (WHERE due_at < now()), 0) AS overdue,
        MIN(due_at) FILTER (WHERE left_amount > 0 AND due_at >= now()) AS next_due_at
      FROM remaining
      GROUP BY supplier_id
    ),
    orders AS (
      SELECT supplier_id,
        count(*) FILTER (WHERE status <> 'draft') AS order_count,
        count(*) FILTER (WHERE status IN ('ordered', 'receiving', 'partial')) AS open_orders
      FROM purchase_orders
      GROUP BY supplier_id
    ),
    list AS (
      SELECT s.id, s.status, s.debt, s.name_key, s.created_at,
        COALESCE(t.purchased, 0) AS purchased,
        COALESCE(t.paid, 0) AS paid,
        COALESCE(d.overdue, 0) AS overdue,
        d.next_due_at,
        t.last_receipt_at,
        COALESCE(o.order_count, 0) AS order_count,
        COALESCE(o.open_orders, 0) AS open_orders
      FROM suppliers s
      LEFT JOIN totals t ON t.supplier_id = s.id
      LEFT JOIN due d ON d.supplier_id = s.id
      LEFT JOIN orders o ON o.supplier_id = s.id
      WHERE ${Prisma.join(conditions, ' AND ')}
    )`;
}

const SUMMARY_COLUMNS = Prisma.sql`id, purchased::bigint AS purchased, paid::bigint AS paid,
  overdue::bigint AS overdue, next_due_at AS "nextDueAt", last_receipt_at AS "lastReceiptAt",
  order_count::int AS "orderCount", open_orders::int AS "openOrders"`;

export const supplierPageSql = (
  filter: SupplierFilter,
  sort: SupplierSort,
  take: number,
  skip: number,
  tab?: SupplierTab,
) =>
  Prisma.sql`${summary(filter)}
    SELECT ${SUMMARY_COLUMNS} FROM list ${tab ? Prisma.sql`WHERE ${TABS[tab]}` : Prisma.empty}
    ORDER BY ${ORDER_BY[sort]} LIMIT ${take} OFFSET ${skip}`;

export const supplierSummarySql = (ids: string[]) =>
  Prisma.sql`${summary({})} SELECT ${SUMMARY_COLUMNS} FROM list WHERE id = ANY(${ids}::uuid[])`;

export const tabCountsSql = (
  filter: SupplierFilter,
  tab?: SupplierTab,
) => Prisma.sql`${summary(filter)}
  SELECT
    (count(*) FILTER (WHERE ${tab ? TABS[tab] : Prisma.sql`TRUE`}))::int AS total,
    count(*)::int AS "all",
    (count(*) FILTER (WHERE ${TABS.active}))::int AS active,
    (count(*) FILTER (WHERE ${TABS.suspended}))::int AS suspended,
    (count(*) FILTER (WHERE ${TABS.inactive}))::int AS inactive,
    (count(*) FILTER (WHERE ${TABS.debt}))::int AS debt
  FROM list`;

export const supplierStatsSql = () => Prisma.sql`${summary({})}
  SELECT
    count(*)::int AS total,
    (count(*) FILTER (WHERE ${TABS.active}))::int AS active,
    (count(*) FILTER (WHERE ${TABS.suspended}))::int AS suspended,
    (SELECT COALESCE(SUM(amount), 0) FROM supplier_ledger_entries
      WHERE kind = 'receipt' AND occurred_at >= now() - interval '30 days')::bigint AS purchased30,
    COALESCE(SUM(debt), 0)::bigint AS debt,
    (count(*) FILTER (WHERE debt > 0))::int AS debtors,
    COALESCE(SUM(overdue), 0)::bigint AS overdue,
    (count(*) FILTER (WHERE overdue > 0))::int AS "overdueCount",
    COALESCE(SUM(open_orders), 0)::int AS "openOrders"
  FROM list`;

export interface TopProductRow {
  productId: string;
  qty: number;
  value: bigint;
  lastCost: number;
  lastAt: Date;
}

export const topProductsSql = (supplierId: string, limit: number) => Prisma.sql`
  SELECT l.product_id AS "productId",
    SUM(l.accepted_qty)::int AS qty,
    SUM(l.accepted_qty::bigint * l.unit_cost)::bigint AS value,
    (array_agg(l.unit_cost ORDER BY r.received_at DESC, l.line_no DESC))[1]::int AS "lastCost",
    MAX(r.received_at) AS "lastAt"
  FROM goods_receipt_lines l
  JOIN goods_receipts r ON r.id = l.receipt_id
  WHERE r.supplier_id = ${supplierId}::uuid AND l.accepted_qty > 0
  GROUP BY l.product_id
  ORDER BY value DESC, qty DESC, l.product_id
  LIMIT ${limit}`;

export const reactivateExpiredSql = () => Prisma.sql`
  UPDATE suppliers
  SET status = 'active', suspend_reason = NULL, suspended_until = NULL, updated_at = now()
  WHERE status = 'suspended' AND suspended_until IS NOT NULL AND suspended_until <= now()`;
