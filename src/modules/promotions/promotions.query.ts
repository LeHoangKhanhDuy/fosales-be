import { Prisma } from '@prisma/client';
import { toNameKey } from '../../common/utils/text';
import { escapeLike } from '../products/products.utils';
import type { PromotionSort } from './dto/promotion-query.dto';
import type { PromotionStatus } from './promotions.utils';

export interface PromotionFilter {
  kind?: string;
  keyword?: string;
}

export interface StatusCountsRow {
  total: number;
  all: number;
  draft: number;
  scheduled: number;
  running: number;
  paused: number;
  ended: number;
}

export interface UsageRow {
  promotionId: string;
  count: number;
  discount: bigint;
  revenue: bigint;
  last30Count: number;
  last30Discount: bigint;
  lastUsedAt: Date | null;
}

const STATUS = Prisma.sql`CASE
  WHEN p.state <> 'active' THEN p.state::text
  WHEN p.start_at > now() THEN 'scheduled'
  WHEN p.end_at IS NOT NULL AND p.end_at < now() THEN 'ended'
  WHEN p.usage_limit IS NOT NULL AND p.used_count >= p.usage_limit THEN 'ended'
  ELSE 'running' END`;

const ORDER_BY: Record<PromotionSort, Prisma.Sql> = {
  newest: Prisma.sql`created_at DESC`,
  ending: Prisma.sql`end_at ASC NULLS LAST`,
  usage: Prisma.sql`used_count DESC, created_at DESC`,
};

function list(filter: PromotionFilter) {
  const conditions = [Prisma.sql`TRUE`];
  if (filter.kind) conditions.push(Prisma.sql`p.kind = ${filter.kind}::"PromotionKind"`);
  const key = filter.keyword ? toNameKey(filter.keyword) : '';
  if (key) conditions.push(Prisma.sql`p.search_key LIKE ${`%${escapeLike(key)}%`}`);
  return Prisma.sql`
    WITH list AS (
      SELECT p.id, p.created_at, p.end_at, p.used_count, ${STATUS} AS status
      FROM promotions p
      WHERE ${Prisma.join(conditions, ' AND ')}
    )`;
}

const statusSql = (status?: PromotionStatus) =>
  status ? Prisma.sql`status = ${status}` : Prisma.sql`TRUE`;

export const promotionPageSql = (
  filter: PromotionFilter,
  sort: PromotionSort,
  take: number,
  skip: number,
  status?: PromotionStatus,
) => Prisma.sql`${list(filter)}
  SELECT id FROM list WHERE ${statusSql(status)}
  ORDER BY ${ORDER_BY[sort]}, id
  LIMIT ${take} OFFSET ${skip}`;

export const statusCountsSql = (
  filter: PromotionFilter,
  status?: PromotionStatus,
) => Prisma.sql`${list(filter)}
  SELECT
    (count(*) FILTER (WHERE ${statusSql(status)}))::int AS total,
    count(*)::int AS "all",
    (count(*) FILTER (WHERE status = 'draft'))::int AS draft,
    (count(*) FILTER (WHERE status = 'scheduled'))::int AS scheduled,
    (count(*) FILTER (WHERE status = 'running'))::int AS running,
    (count(*) FILTER (WHERE status = 'paused'))::int AS paused,
    (count(*) FILTER (WHERE status = 'ended'))::int AS ended
  FROM list`;

export const usageSql = (ids: string[]) => Prisma.sql`
  SELECT promotion_id AS "promotionId",
    count(*)::int AS count,
    COALESCE(SUM(discount), 0)::bigint AS discount,
    COALESCE(SUM(revenue), 0)::bigint AS revenue,
    (count(*) FILTER (WHERE created_at >= now() - interval '30 days'))::int AS "last30Count",
    COALESCE(SUM(discount) FILTER (WHERE created_at >= now() - interval '30 days'), 0)::bigint AS "last30Discount",
    MAX(created_at) AS "lastUsedAt"
  FROM promotion_redemptions
  WHERE revoked_at IS NULL AND promotion_id = ANY(${ids}::uuid[])
  GROUP BY promotion_id`;
