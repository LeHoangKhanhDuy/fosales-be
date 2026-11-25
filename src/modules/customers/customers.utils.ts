import type { CustomerTier } from '@prisma/client';
import { toNameKey } from '../../common/utils/text';

export const TIER_ORDER: CustomerTier[] = ['retail', 'silver', 'gold', 'diamond'];
export const LEGACY_SPENT_MAX = 10_000_000_000;
export const POINTS_MAX = 1_000_000;
export const DAY_MS = 86_400_000;

export const formatCustomerCode = (n: number) => `KH${String(n).padStart(6, '0')}`;

export const customerSearchKey = (fields: { name: string; code: string; email?: string | null }) =>
  [toNameKey(fields.name), fields.code.toLowerCase(), fields.email ?? ''].filter(Boolean).join(' ');

export const givenNameKey = (name: string) => toNameKey(name).split(' ').at(-1) ?? '';

export const digitsOf = (value: string) => value.replace(/\D/g, '');

export const money = (value: bigint | number | null | undefined) => Number(value ?? 0);

export const toDateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

export const formatDateOnly = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : null;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export const vnToday = () => new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);

export function isValidBirthday(value: string) {
  const date = toDateOnly(value);
  return (
    !Number.isNaN(date.getTime()) &&
    formatDateOnly(date) === value &&
    value >= '1900-01-01' &&
    value <= vnToday()
  );
}
