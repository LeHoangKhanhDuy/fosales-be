import { randomInt } from 'node:crypto';
import type { DiscountType, PromotionState, ScopeType } from '@prisma/client';
import { toNameKey } from '../../common/utils/text';

export const PROMOTION_STATUSES = ['draft', 'scheduled', 'running', 'paused', 'ended'] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export const CODE_PATTERN = /^[A-Z0-9_-]{4,20}$/;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 86_400_000;

export interface StatusInput {
  state: PromotionState;
  startAt: Date;
  endAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
}

export function promotionStatus(p: StatusInput, now = Date.now()): PromotionStatus {
  if (p.state !== 'active') return p.state;
  if (p.startAt.getTime() > now) return 'scheduled';
  if (p.endAt && p.endAt.getTime() < now) return 'ended';
  if (p.usageLimit && p.usedCount >= p.usageLimit) return 'ended';
  return 'running';
}

export const isUsedUp = (p: Pick<StatusInput, 'usageLimit' | 'usedCount'>) =>
  !!p.usageLimit && p.usedCount >= p.usageLimit;

export const isExpired = (p: Pick<StatusInput, 'endAt'>, now = Date.now()) =>
  !!p.endAt && p.endAt.getTime() < now;

export function calcDiscount(base: number, type: DiscountType, value: number, max?: number | null) {
  if (base <= 0) return 0;
  let raw = type === 'percent' ? (base * Math.min(value, 100)) / 100 : value;
  if (type === 'percent' && max) raw = Math.min(raw, max);
  const rounded = type === 'percent' ? Math.round(raw / 100) * 100 : Math.round(raw);
  return Math.max(0, Math.min(rounded, base));
}

export interface Scope {
  type: ScopeType;
  categoryIds: string[];
  productIds: string[];
}

export const inScope = (scope: Scope, item: { productId: string; categoryId: string | null }) =>
  scope.type === 'all' ||
  (scope.type === 'categories'
    ? !!item.categoryId && scope.categoryIds.includes(item.categoryId)
    : scope.productIds.includes(item.productId));

export const promotionSearchKey = (name: string, code: string) =>
  `${toNameKey(name)} ${code.toLowerCase()}`;

export const randomCode = (prefix: string, length = 6) =>
  prefix + Array.from({ length }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');

export const vnDateLabel = (date: Date) =>
  new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10).split('-').reverse().join('/');
