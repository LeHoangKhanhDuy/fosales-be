import type { PurchaseOrderStatus } from '@prisma/client';

export const OPEN_STATUSES: PurchaseOrderStatus[] = ['ordered', 'receiving', 'partial'];
export const RECEIVABLE_STATUSES: PurchaseOrderStatus[] = ['ordered', 'receiving', 'partial'];
export const APPROVAL_THRESHOLD = 0.05;
export const LOCK_MS = 10 * 60 * 1000;
export const MAX_ORDER_VALUE = 2_000_000_000;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const PACK_BY_UNIT: Record<string, number> = {
  lon: 24,
  chai: 24,
  gói: 30,
  hộp: 12,
  lốc: 6,
  tuýp: 12,
};

export const packSizeFor = (unit: string | null | undefined) =>
  PACK_BY_UNIT[(unit ?? '').toLowerCase()] ?? 1;

export const round100 = (value: number) => Math.round(value / 100) * 100;

export const vnToday = (now = Date.now()) =>
  new Date(now + VN_OFFSET_MS).toISOString().slice(0, 10);

export function toDateOnly(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : vnToday(new Date(value).getTime());
  return new Date(`${date}T00:00:00.000Z`);
}

export const formatDateOnly = (value: Date | null | undefined) =>
  value ? value.toISOString().slice(0, 10) : null;

export const isPastDate = (date: Date) => formatDateOnly(date)! < vnToday();

export const isOverdue = (status: PurchaseOrderStatus, expectedDate: Date) =>
  (status === 'ordered' || status === 'partial') && isPastDate(expectedDate);

interface TotalsItem {
  orderedQty: number;
  unitCost: number;
  receivedQty: number;
}

export function calcTotals(items: TotalsItem[], discount: number, receivedValue = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.orderedQty * item.unitCost, 0);
  return {
    subtotal,
    total: Math.max(0, subtotal - discount),
    orderedQty: items.reduce((sum, item) => sum + item.orderedQty, 0),
    receivedQty: items.reduce((sum, item) => sum + item.receivedQty, 0),
    lines: items.length,
    receivedValue,
  };
}

export interface CountedLine {
  scannedQty: number;
  damagedQty: number;
  expectedQty: number;
  extra: boolean;
  excessAction: 'accept' | 'return';
}

export function countLine(line: CountedLine) {
  const base = line.extra
    ? line.excessAction === 'accept'
      ? line.scannedQty
      : 0
    : line.excessAction === 'accept'
      ? line.scannedQty
      : Math.min(line.scannedQty, line.expectedQty);
  return {
    acceptedQty: Math.max(0, base - Math.min(line.damagedQty, base)),
    returnedQty: line.scannedQty - base,
  };
}

export function formatLotNote(lotNo?: string | null, expiry?: Date | null) {
  const parts = [
    lotNo ? `Lô ${lotNo}` : '',
    expiry ? `HSD ${formatDateOnly(expiry)!.split('-').reverse().join('/')}` : '',
  ];
  return parts.filter(Boolean).join(' · ') || null;
}
