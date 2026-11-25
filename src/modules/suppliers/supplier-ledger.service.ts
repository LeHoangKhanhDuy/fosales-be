import { Injectable } from '@nestjs/common';
import type { Prisma, SupplierLedgerKind } from '@prisma/client';
import { SupplierErrors } from './suppliers.errors';
import { DAY_MS, money } from './suppliers.utils';

export interface SupplierLedgerInput {
  supplierId: string;
  kind: SupplierLedgerKind;
  amount: number;
  code: string;
  label: string;
  refType?: string | null;
  refId?: string | null;
  occurredAt?: Date;
  userId: string;
  allowNegative?: boolean;
}

export const ledgerEntrySelect = {
  id: true,
  kind: true,
  code: true,
  label: true,
  occurredAt: true,
  dueAt: true,
  amount: true,
  balanceAfter: true,
} satisfies Prisma.SupplierLedgerEntrySelect;

type LedgerRow = Prisma.SupplierLedgerEntryGetPayload<{ select: typeof ledgerEntrySelect }>;

export const toLedgerEntry = (row: LedgerRow) => ({
  id: row.id,
  kind: row.kind,
  code: row.code,
  label: row.label,
  at: row.occurredAt,
  dueAt: row.dueAt,
  amount: money(row.amount),
  balance: money(row.balanceAfter),
});

@Injectable()
export class SupplierLedger {
  async apply(tx: Prisma.TransactionClient, input: SupplierLedgerInput) {
    const [supplier] = await tx.$queryRaw<{ debt: bigint; termDays: number }[]>`
      SELECT debt, payment_term_days AS "termDays" FROM suppliers
      WHERE id = ${input.supplierId}::uuid
      FOR UPDATE`;
    if (!supplier) throw SupplierErrors.notFound();
    const debtBefore = money(supplier.debt);
    const debtAfter = debtBefore + input.amount;
    if (debtAfter < 0 && !input.allowNegative) throw SupplierErrors.paymentExceedsDebt(debtBefore);
    const occurredAt = input.occurredAt ?? new Date();
    await tx.supplier.update({
      where: { id: input.supplierId },
      data: { debt: BigInt(debtAfter) },
    });
    const entry = await tx.supplierLedgerEntry.create({
      data: {
        supplierId: input.supplierId,
        kind: input.kind,
        amount: BigInt(input.amount),
        balanceAfter: BigInt(debtAfter),
        code: input.code,
        label: input.label,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        occurredAt,
        dueAt:
          input.kind === 'receipt'
            ? new Date(occurredAt.getTime() + supplier.termDays * DAY_MS)
            : null,
        createdById: input.userId,
      },
      select: ledgerEntrySelect,
    });
    return { entry: toLedgerEntry(entry), debtBefore, debtAfter };
  }
}
