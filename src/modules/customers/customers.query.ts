import { Prisma } from '@prisma/client';
import { toNameKey } from '../../common/utils/text';
import { escapeLike } from '../products/products.utils';
import type { CustomerSegment, CustomerSort, CustomerTierValue } from './dto/customer-query.dto';
import { digitsOf } from './customers.utils';

export interface CustomerFilter {
  keyword?: string;
  segment?: CustomerSegment;
}

export interface TierCountsRow {
  total: number;
  all: number;
  retail: number;
  silver: number;
  gold: number;
  diamond: number;
}

export interface CustomerStatsRow {
  total: number;
  new30: number;
  active30: number;
  returning: number;
  points: number;
  birthday: number;
}

const VN_MONTH = Prisma.sql`EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))`;

const SEGMENTS: Record<CustomerSegment, Prisma.Sql> = {
  birthday: Prisma.sql`EXTRACT(MONTH FROM c.birthday) = ${VN_MONTH}`,
  new30: Prisma.sql`c.created_at >= now() - interval '30 days'`,
  inactive60: Prisma.sql`(c.last_order_at IS NULL OR c.last_order_at < now() - interval '60 days')`,
  blocked: Prisma.sql`c.status = 'blocked'`,
};

const ORDER_BY: Record<CustomerSort, Prisma.Sql> = {
  newest: Prisma.sql`c.created_at DESC`,
  spent: Prisma.sql`(c.legacy_spent + c.spent) DESC`,
  points: Prisma.sql`c.points DESC`,
  recent: Prisma.sql`c.last_order_at DESC NULLS LAST`,
  name: Prisma.sql`c.given_name_key ASC, c.search_key ASC`,
};

export function keywordSql(keyword: string | undefined) {
  const key = keyword ? toNameKey(keyword) : '';
  if (!key) return null;
  if (/\p{L}/u.test(key)) return Prisma.sql`c.search_key LIKE ${`%${escapeLike(key)}%`}`;
  const digits = digitsOf(key);
  if (digits.length < 3) return Prisma.sql`FALSE`;
  return Prisma.sql`(c.phone LIKE ${`%${digits}%`} OR c.code LIKE ${`%${digits}%`})`;
}

function where(filter: CustomerFilter) {
  const conditions = [Prisma.sql`TRUE`];
  const keyword = keywordSql(filter.keyword);
  if (keyword) conditions.push(keyword);
  if (filter.segment) conditions.push(SEGMENTS[filter.segment]);
  return Prisma.join(conditions, ' AND ');
}

const tierSql = (tier?: CustomerTierValue) =>
  tier ? Prisma.sql`c.tier = ${tier}::"CustomerTier"` : Prisma.sql`TRUE`;

export const customerPageSql = (
  filter: CustomerFilter,
  sort: CustomerSort,
  take: number,
  skip: number,
  tier?: CustomerTierValue,
) => Prisma.sql`
  SELECT c.id FROM customers c
  WHERE ${where(filter)} AND ${tierSql(tier)}
  ORDER BY ${ORDER_BY[sort]}, c.id
  LIMIT ${take} OFFSET ${skip}`;

export const tierCountsSql = (filter: CustomerFilter, tier?: CustomerTierValue) => Prisma.sql`
  SELECT
    (count(*) FILTER (WHERE ${tierSql(tier)}))::int AS total,
    count(*)::int AS "all",
    (count(*) FILTER (WHERE c.tier = 'retail'))::int AS retail,
    (count(*) FILTER (WHERE c.tier = 'silver'))::int AS silver,
    (count(*) FILTER (WHERE c.tier = 'gold'))::int AS gold,
    (count(*) FILTER (WHERE c.tier = 'diamond'))::int AS diamond
  FROM customers c
  WHERE ${where(filter)}`;

const RECENT_ORDERS = Prisma.sql`
  SELECT customer_id, count(*) AS n FROM orders
  WHERE customer_id IS NOT NULL AND status IN ('completed', 'partially_refunded')
    AND created_at >= now() - interval '30 days'
  GROUP BY customer_id`;

export const orders30Sql = (ids: string[]) => Prisma.sql`
  SELECT customer_id AS "customerId", n::int AS count FROM (${RECENT_ORDERS}) r
  WHERE customer_id = ANY(${ids}::uuid[])`;

export const customerStatsSql = () => Prisma.sql`
  WITH recent AS (${RECENT_ORDERS})
  SELECT
    (SELECT count(*) FROM recent)::int AS active30,
    (SELECT count(*) FROM recent WHERE n >= 2)::int AS returning,
    count(*)::int AS total,
    (count(*) FILTER (WHERE ${SEGMENTS.new30}))::int AS new30,
    COALESCE(SUM(c.points) FILTER (WHERE c.status = 'active'), 0)::int AS points,
    (count(*) FILTER (WHERE c.status = 'active' AND ${SEGMENTS.birthday}))::int AS birthday
  FROM customers c`;

export const customerSearchSql = (q: string | undefined, limit: number) => {
  const keyword = keywordSql(q);
  const digits = q ? digitsOf(q) : '';
  const code = q ? q.trim().toUpperCase() : '';
  return Prisma.sql`
    SELECT c.id FROM customers c
    WHERE c.status = 'active' ${keyword ? Prisma.sql`AND ${keyword}` : Prisma.empty}
    ORDER BY (c.phone = ${digits}) DESC, (c.code = ${code}) DESC,
      ${keyword ? Prisma.sql`c.given_name_key ASC, c.search_key ASC` : Prisma.sql`c.last_order_at DESC NULLS LAST, c.created_at DESC`},
      c.id
    LIMIT ${limit}`;
};

export const nextCustomerCodeSql = () => Prisma.sql`
  SELECT COALESCE(max(substring(code FROM 3)::int), 0)::int AS max
  FROM customers WHERE code ~ '^KH[0-9]{6,9}$'`;
