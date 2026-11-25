import type { Prisma } from '@prisma/client';
import { formatDateOnly, money } from './customers.utils';
import { type Membership, nextTierInfo } from './membership.rules';

export const customerSelect = {
  id: true,
  code: true,
  name: true,
  phone: true,
  email: true,
  gender: true,
  birthday: true,
  address: true,
  note: true,
  status: true,
  tier: true,
  points: true,
  legacySpent: true,
  spent: true,
  orderCount: true,
  firstOrderAt: true,
  lastOrderAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

export type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;

export const liteSelect = {
  id: true,
  code: true,
  name: true,
  phone: true,
  tier: true,
  points: true,
  status: true,
} satisfies Prisma.CustomerSelect;

export function toCustomer(row: CustomerRow, settings: Membership) {
  const legacySpent = money(row.legacySpent);
  const spent = money(row.spent);
  const totalSpent = legacySpent + spent;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    email: row.email,
    gender: row.gender,
    birthday: formatDateOnly(row.birthday),
    address: row.address,
    note: row.note,
    status: row.status,
    tier: row.tier,
    points: row.points,
    legacySpent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stats: {
      spent,
      orders: row.orderCount,
      avgOrder: row.orderCount ? Math.round(spent / row.orderCount) : 0,
      lastOrderAt: row.lastOrderAt,
      firstOrderAt: row.firstOrderAt,
      orders30: 0,
    },
    totalSpent,
    nextTier: nextTierInfo(settings, row.tier, totalSpent),
  };
}

export type CustomerView = ReturnType<typeof toCustomer>;
