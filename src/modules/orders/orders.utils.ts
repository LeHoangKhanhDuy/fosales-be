import type { OrderPaymentMethod, OrderPaymentStatus } from '@prisma/client';
import { OrderErrors } from './orders.errors';

export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 86_400_000;
export const CANCEL_WINDOW_MS = 30 * 60 * 1000;

export const PAYMENT_LABEL: Record<OrderPaymentMethod, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  card: 'Thẻ',
  ewallet: 'Ví điện tử',
  points: 'Điểm thành viên',
};

export const vnDay = (at: Date) => new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

export const maskPhone = (phone: string) => `${phone.slice(0, 4)}***${phone.slice(-3)}`;

interface AllocLine {
  base: number;
  inVoucherScope: boolean;
}

function spread(amount: number, weights: number[]) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  const result = weights.map(() => 0);
  if (amount <= 0 || total <= 0) return result;
  const last = weights.map((w) => w > 0).lastIndexOf(true);
  let left = amount;
  weights.forEach((weight, index) => {
    if (weight <= 0) return;
    const share = index === last ? left : Math.min(left, Math.round((amount * weight) / total));
    result[index] = share;
    left -= share;
  });
  return result;
}

export function allocateDiscounts(lines: AllocLine[], voucherDiscount: number, shared: number) {
  const voucher = spread(
    voucherDiscount,
    lines.map((line) => (line.inVoucherScope ? line.base : 0)),
  );
  const rest = spread(
    shared,
    lines.map((line, index) => line.base - voucher[index]),
  );
  return lines.map((_, index) => voucher[index] + rest[index]);
}

export interface PaymentInput {
  method: 'cash' | 'transfer' | 'card' | 'ewallet';
  amount?: number;
  tendered?: number;
  reference?: string | null;
  confirmed?: boolean;
}

export interface PlannedPayment {
  method: OrderPaymentMethod;
  amount: number;
  tendered: number | null;
  reference: string | null;
  status: OrderPaymentStatus;
}

export function planPayments(due: number, inputs: PaymentInput[]) {
  const methods = inputs.map((p) => p.method);
  if (new Set(methods).size !== methods.length) {
    throw OrderErrors.paymentInvalid('Mỗi phương thức thanh toán chỉ được nhập 1 lần');
  }
  const cash = inputs.find((p) => p.method === 'cash');
  const others = inputs.filter((p) => p.method !== 'cash');
  for (const p of others) {
    if (!p.amount || p.amount <= 0) {
      throw OrderErrors.paymentInvalid('Số tiền chuyển khoản / thẻ / ví phải lớn hơn 0');
    }
  }
  const nonCash = others.reduce((sum, p) => sum + p.amount!, 0);
  if (nonCash > due) throw OrderErrors.paymentOverpaid(nonCash - due);
  const planned: PlannedPayment[] = others.map((p) => ({
    method: p.method,
    amount: p.amount!,
    tendered: null,
    reference: p.reference ?? null,
    status: p.method === 'card' || p.confirmed ? 'confirmed' : 'pending',
  }));
  let change = 0;
  let paid = nonCash;
  const cashDue = due - nonCash;
  if (cashDue > 0) {
    if (!cash) throw OrderErrors.paymentInsufficient(cashDue);
    const tendered = cash.tendered ?? cash.amount ?? cashDue;
    if (tendered < cashDue) throw OrderErrors.paymentInsufficient(cashDue - tendered);
    change = tendered - cashDue;
    paid += tendered;
    planned.unshift({
      method: 'cash',
      amount: cashDue,
      tendered,
      reference: null,
      status: 'confirmed',
    });
  }
  return {
    payments: planned,
    paidTotal: paid,
    changeAmount: change,
    pending: planned.some((p) => p.status === 'pending'),
  };
}

export const growth = (current: number, previous: number) =>
  previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : current > 0 ? 100 : 0;
