import type { Prisma } from '@prisma/client';
import type { SummaryRow } from './suppliers.query';
import { money } from './suppliers.utils';

export const supplierSelect = {
  id: true,
  code: true,
  name: true,
  contact: true,
  phone: true,
  email: true,
  address: true,
  taxCode: true,
  paymentTermDays: true,
  bankName: true,
  bankAccount: true,
  bankHolder: true,
  note: true,
  status: true,
  suspendReason: true,
  suspendedUntil: true,
  debt: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: { categoryId: true } },
} satisfies Prisma.SupplierSelect;

type SupplierRow = Prisma.SupplierGetPayload<{ select: typeof supplierSelect }>;

export function toSupplierItem(row: SupplierRow, summary?: Omit<SummaryRow, 'id'>) {
  const { categories, debt, ...supplier } = row;
  return {
    ...supplier,
    categoryIds: categories.map((category) => category.categoryId),
    summary: {
      orderCount: summary?.orderCount ?? 0,
      openOrders: summary?.openOrders ?? 0,
      purchased: money(summary?.purchased),
      paid: money(summary?.paid),
      debt: money(debt),
      overdue: money(summary?.overdue),
      lastReceiptAt: summary?.lastReceiptAt ?? null,
      nextDueAt: summary?.nextDueAt ?? null,
    },
  };
}

export const paymentInclude = {
  paidBy: { select: { name: true } },
} satisfies Prisma.SupplierPaymentInclude;

type PaymentRow = Prisma.SupplierPaymentGetPayload<{ include: typeof paymentInclude }>;

export const toPayment = (row: PaymentRow) => ({
  id: row.id,
  code: row.code,
  supplierId: row.supplierId,
  amount: money(row.amount),
  method: row.method,
  reference: row.reference,
  note: row.note,
  paidAt: row.paidAt,
  paidBy: row.paidBy.name,
});
