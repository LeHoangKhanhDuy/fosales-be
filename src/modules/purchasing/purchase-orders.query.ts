import { Prisma, type PurchaseOrderStatus } from '@prisma/client';
import { escapeLike } from '../products/products.utils';
import { searchTerm } from '../suppliers/suppliers.utils';
import { toNameKey } from '../../common/utils/text';
import type { PurchaseTab } from './dto/purchase-query.dto';
import { vnToday } from './purchasing.utils';

export interface PurchaseFilter {
  storeId: string;
  keyword?: string;
  supplierId?: string;
  overdue?: boolean;
  from?: string;
  to?: string;
}

export interface TabCountsRow {
  total: number;
  open: number;
  all: number;
  draft: number;
  ordered: number;
  partial: number;
  completed: number;
  cancelled: number;
}

export interface SuggestionRow {
  id: string;
  stock: number;
  minStock: number;
  lastCost: number | null;
}

const TABS: Record<PurchaseTab, Prisma.Sql> = {
  open: Prisma.sql`po.status IN ('ordered', 'receiving', 'partial')`,
  all: Prisma.sql`TRUE`,
  draft: Prisma.sql`po.status = 'draft'`,
  ordered: Prisma.sql`po.status IN ('ordered', 'receiving')`,
  partial: Prisma.sql`po.status = 'partial'`,
  completed: Prisma.sql`po.status = 'completed'`,
  cancelled: Prisma.sql`po.status = 'cancelled'`,
};

const overdueSql = () =>
  Prisma.sql`(po.status IN ('ordered', 'partial') AND po.expected_date < ${vnToday()}::date)`;

function where(filter: PurchaseFilter) {
  const conditions = [Prisma.sql`po.store_id = ${filter.storeId}::uuid`];
  if (filter.supplierId) conditions.push(Prisma.sql`po.supplier_id = ${filter.supplierId}::uuid`);
  if (filter.overdue) conditions.push(overdueSql());
  if (filter.from) conditions.push(Prisma.sql`po.created_at >= ${new Date(filter.from)}`);
  if (filter.to) conditions.push(Prisma.sql`po.created_at < ${new Date(filter.to)}`);
  const keyword = filter.keyword?.trim();
  if (keyword) {
    const code = `%${escapeLike(keyword.toLowerCase())}%`;
    const supplier = searchTerm(keyword);
    const product = toNameKey(keyword);
    conditions.push(Prisma.sql`(
      lower(po.code) LIKE ${code}
      ${supplier ? Prisma.sql`OR EXISTS (SELECT 1 FROM suppliers s WHERE s.id = po.supplier_id AND s.search_key LIKE ${`%${escapeLike(supplier)}%`})` : Prisma.empty}
      ${product ? Prisma.sql`OR EXISTS (SELECT 1 FROM purchase_order_items i JOIN products p ON p.id = i.product_id WHERE i.po_id = po.id AND p.search_key LIKE ${`%${escapeLike(product)}%`})` : Prisma.empty}
    )`);
  }
  return Prisma.join(conditions, ' AND ');
}

export const purchasePageSql = (
  filter: PurchaseFilter,
  tab: PurchaseTab,
  take: number,
  skip: number,
) =>
  Prisma.sql`
    SELECT po.id FROM purchase_orders po
    WHERE ${where(filter)} AND ${TABS[tab]}
    ORDER BY ${tab === 'open' ? Prisma.sql`po.expected_date ASC, po.created_at ASC` : Prisma.sql`po.created_at DESC`}, po.id
    LIMIT ${take} OFFSET ${skip}`;

export const purchaseTabCountsSql = (filter: PurchaseFilter, tab: PurchaseTab) => Prisma.sql`
  SELECT
    (count(*) FILTER (WHERE ${TABS[tab]}))::int AS total,
    (count(*) FILTER (WHERE ${TABS.open}))::int AS open,
    count(*)::int AS "all",
    (count(*) FILTER (WHERE ${TABS.draft}))::int AS draft,
    (count(*) FILTER (WHERE ${TABS.ordered}))::int AS ordered,
    (count(*) FILTER (WHERE ${TABS.partial}))::int AS partial,
    (count(*) FILTER (WHERE ${TABS.completed}))::int AS completed,
    (count(*) FILTER (WHERE ${TABS.cancelled}))::int AS cancelled
  FROM purchase_orders po
  WHERE ${where(filter)}`;

export const purchaseSummarySql = (storeId: string) => Prisma.sql`
  SELECT
    (count(*) FILTER (WHERE ${TABS.open}))::int AS open,
    (count(*) FILTER (WHERE ${overdueSql()}))::int AS overdue,
    (count(*) FILTER (WHERE po.status = 'receiving'))::int AS receiving,
    (count(*) FILTER (WHERE ${TABS.draft}))::int AS draft
  FROM purchase_orders po
  WHERE po.store_id = ${storeId}::uuid`;

export const suggestionsSql = (
  storeId: string,
  supplierId: string | undefined,
  limit: number,
) => Prisma.sql`
  SELECT p.id, COALESCE(ps.quantity, 0)::int AS stock, p.min_stock AS "minStock", lc.unit_cost AS "lastCost"
  FROM products p
  LEFT JOIN product_stocks ps ON ps.product_id = p.id AND ps.store_id = ${storeId}::uuid
  LEFT JOIN LATERAL (
    SELECT l.unit_cost FROM goods_receipt_lines l
    JOIN goods_receipts r ON r.id = l.receipt_id
    WHERE l.product_id = p.id AND l.accepted_qty > 0
      ${supplierId ? Prisma.sql`AND r.supplier_id = ${supplierId}::uuid` : Prisma.empty}
    ORDER BY r.received_at DESC, l.line_no DESC
    LIMIT 1
  ) lc ON TRUE
  WHERE p.deleted_at IS NULL AND p.status = 'active'
    AND COALESCE(ps.quantity, 0) <= p.min_stock
    ${
      supplierId
        ? Prisma.sql`AND (
            NOT EXISTS (SELECT 1 FROM supplier_categories sc WHERE sc.supplier_id = ${supplierId}::uuid)
            OR p.category_id IN (SELECT sc.category_id FROM supplier_categories sc WHERE sc.supplier_id = ${supplierId}::uuid))`
        : Prisma.empty
    }
  ORDER BY (COALESCE(ps.quantity, 0) <= 0) DESC,
    COALESCE(ps.quantity, 0)::float / GREATEST(p.min_stock, 1) ASC, p.name ASC, p.id
  LIMIT ${limit}`;

export interface LockedOrder {
  id: string;
  code: string;
  status: PurchaseOrderStatus;
  supplierId: string;
  discount: number;
  expectedDate: Date;
}

export async function lockOrder(tx: Prisma.TransactionClient, storeId: string, id: string) {
  const [row] = await tx.$queryRaw<LockedOrder[]>`
    SELECT id, code, status, supplier_id AS "supplierId", discount, expected_date AS "expectedDate"
    FROM purchase_orders
    WHERE id = ${id}::uuid AND store_id = ${storeId}::uuid
    FOR UPDATE`;
  return row;
}
