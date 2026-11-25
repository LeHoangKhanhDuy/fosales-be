import type { CustomerTier } from '@prisma/client';
import { CustomerErrors } from './customers.errors';
import { TIER_ORDER } from './customers.utils';

export interface TierSetting {
  tier: CustomerTier;
  label: string;
  minSpent: number;
  discountPercent: number;
  pointMultiplier: number;
  perks: string;
}

export interface Membership {
  amountPerPoint: number;
  pointValue: number;
  tiers: TierSetting[];
}

export const DEFAULT_MEMBERSHIP: Membership = {
  amountPerPoint: 10_000,
  pointValue: 100,
  tiers: [
    {
      tier: 'retail',
      label: 'Thành viên',
      minSpent: 0,
      discountPercent: 0,
      pointMultiplier: 1,
      perks: 'Tích điểm mọi hóa đơn',
    },
    {
      tier: 'silver',
      label: 'Bạc',
      minSpent: 1_000_000,
      discountPercent: 2,
      pointMultiplier: 1.2,
      perks: 'Giảm 2% mỗi hóa đơn, x1.2 điểm',
    },
    {
      tier: 'gold',
      label: 'Vàng',
      minSpent: 3_000_000,
      discountPercent: 3,
      pointMultiplier: 1.5,
      perks: 'Giảm 3% mỗi hóa đơn, x1.5 điểm, quà sinh nhật',
    },
    {
      tier: 'diamond',
      label: 'Kim cương',
      minSpent: 8_000_000,
      discountPercent: 5,
      pointMultiplier: 2,
      perks: 'Giảm 5% mỗi hóa đơn, x2 điểm, quà sinh nhật, ưu tiên giao hàng',
    },
  ],
};

const MIN_SPENT_MAX = 100_000_000_000;

const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;

const inRange = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

export function validateMembership(input: Membership): Membership {
  const fail = CustomerErrors.membershipInvalid;
  if (!Number.isInteger(input.amountPerPoint) || !inRange(input.amountPerPoint, 1000, 10_000_000)) {
    throw fail('amountPerPoint', 'Số tiền cho 1 điểm phải từ 1.000đ tới 10.000.000đ');
  }
  if (!Number.isInteger(input.pointValue) || !inRange(input.pointValue, 1, 100_000)) {
    throw fail('pointValue', 'Giá trị 1 điểm phải từ 1đ tới 100.000đ');
  }
  if (
    input.tiers.length !== TIER_ORDER.length ||
    input.tiers.some((t, i) => t.tier !== TIER_ORDER[i])
  ) {
    throw fail('tiers', 'Cần đủ 4 hạng theo thứ tự Thành viên, Bạc, Vàng, Kim cương');
  }
  const tiers = input.tiers.map((t, index) => {
    const label = t.label.trim().replace(/\s+/g, ' ');
    if (!label || label.length > 30) throw fail('label', 'Tên hạng gồm 1–30 ký tự', t.tier);
    if (!Number.isInteger(t.minSpent) || !inRange(t.minSpent, 0, MIN_SPENT_MAX)) {
      throw fail('minSpent', 'Mức chi tiêu không hợp lệ', t.tier);
    }
    if (index === 0 && t.minSpent !== 0)
      throw fail('minSpent', 'Hạng Thành viên phải bắt đầu từ 0đ', t.tier);
    if (index > 0 && t.minSpent <= input.tiers[index - 1].minSpent) {
      throw fail('minSpent', 'Mức chi tiêu phải tăng dần theo hạng', t.tier);
    }
    if (!inRange(t.discountPercent, 0, 50) || !twoDecimals(t.discountPercent)) {
      throw fail('discountPercent', 'Ưu đãi từ 0% tới 50%, tối đa 2 chữ số thập phân', t.tier);
    }
    if (!inRange(t.pointMultiplier, 1, 10) || !twoDecimals(t.pointMultiplier)) {
      throw fail('pointMultiplier', 'Hệ số điểm từ 1 tới 10, tối đa 2 chữ số thập phân', t.tier);
    }
    const perks = t.perks.trim();
    if (perks.length > 200) throw fail('perks', 'Quyền lợi tối đa 200 ký tự', t.tier);
    return { ...t, label, perks };
  });
  return { amountPerPoint: input.amountPerPoint, pointValue: input.pointValue, tiers };
}

export const resolveTier = (settings: Membership, totalSpent: number): CustomerTier =>
  [...settings.tiers].sort((a, b) => b.minSpent - a.minSpent).find((t) => totalSpent >= t.minSpent)
    ?.tier ?? 'retail';

export const tierSetting = (settings: Membership, tier: CustomerTier) =>
  settings.tiers.find((t) => t.tier === tier) ?? settings.tiers[0];

export const earnedPoints = (settings: Membership, tier: CustomerTier, amount: number) =>
  Math.max(
    0,
    Math.floor(
      (amount / settings.amountPerPoint) * tierSetting(settings, tier).pointMultiplier + 1e-9,
    ),
  );

export function nextTierInfo(settings: Membership, tier: CustomerTier, totalSpent: number) {
  const next = settings.tiers.find((t) => t.tier === TIER_ORDER[TIER_ORDER.indexOf(tier) + 1]);
  if (!next) return null;
  const current = tierSetting(settings, tier);
  const span = Math.max(1, next.minSpent - current.minSpent);
  const progress = Math.min(100, Math.max(0, ((totalSpent - current.minSpent) / span) * 100));
  return {
    tier: next.tier,
    label: next.label,
    minSpent: next.minSpent,
    remaining: Math.max(0, next.minSpent - totalSpent),
    progress: Math.round(progress * 10) / 10,
  };
}
