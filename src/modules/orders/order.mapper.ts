import type { OrderPaymentMethod, Prisma } from '@prisma/client';
import { maskPhone, PAYMENT_LABEL } from './orders.utils';

const customerSelect = {
  select: { id: true, code: true, name: true, phone: true, tier: true, points: true },
} as const;
const nameOnly = { select: { name: true } } as const;

export const orderListInclude = {
  customer: customerSelect,
  cashier: nameOnly,
  lines: { select: { quantity: true } },
  payments: { select: { method: true, amount: true, status: true } },
} satisfies Prisma.OrderInclude;

export const orderInclude = {
  customer: customerSelect,
  cashier: nameOnly,
  cancelledBy: nameOnly,
  lines: { orderBy: { lineNo: 'asc' } },
  payments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  promotions: true,
  returns: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, code: true, refundTotal: true, cashRefund: true, createdAt: true },
  },
} satisfies Prisma.OrderInclude;

type OrderListRow = Prisma.OrderGetPayload<{ include: typeof orderListInclude }>;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const PROMO_ORDER = ['product', 'gift', 'order', 'voucher', 'member'];

function totals(row: OrderListRow | OrderRow) {
  return {
    itemCount: row.lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: row.subtotal,
    productDiscount: row.productDiscount,
    orderDiscount: row.orderDiscount,
    memberDiscount: row.memberDiscount,
    voucherDiscount: row.voucherDiscount,
    pointsDiscount: row.pointsDiscount,
    discountAmount:
      row.productDiscount + row.orderDiscount + row.memberDiscount + row.voucherDiscount,
    total: row.total,
    due: row.total - row.pointsDiscount,
  };
}

const primaryMethod = (payments: { method: OrderPaymentMethod; amount: number }[]) =>
  [...payments].filter((p) => p.method !== 'points').sort((a, b) => b.amount - a.amount)[0]
    ?.method ?? (payments.length ? payments[0].method : 'cash');

export function toOrderListItem(row: OrderListRow) {
  const pendingAmount = row.payments
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    channel: row.channel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customer: row.customer,
    cashier: row.cashier.name,
    totals: totals(row),
    paidAmount: row.paidTotal,
    changeAmount: row.changeAmount,
    paymentMethod: primaryMethod(row.payments),
    paymentMethods: [
      ...new Set(row.payments.filter((p) => p.status !== 'voided').map((p) => p.method)),
    ],
    pendingAmount,
    voucherCode: row.voucherCode,
    refundedTotal: row.refundedTotal,
    note: row.note,
    reason: row.cancelReason,
  };
}

export function toOrder(row: OrderRow) {
  return {
    ...toOrderListItem({ ...row, payments: row.payments }),
    completedAt: row.completedAt,
    items: row.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      name: line.name,
      sku: line.sku,
      barcode: line.barcode,
      unit: line.unit,
      categoryId: line.categoryId,
      price: line.price,
      quantity: line.quantity,
      discount: line.productDiscount,
      productDiscount: line.productDiscount,
      allocatedDiscount: line.allocatedDiscount,
      netAmount: line.netAmount,
      isGift: line.isGift,
      promotionId: line.promotionId,
      promoName: line.promoName,
      returnedQty: line.returnedQty,
      refundedAmount: line.refundedAmount,
    })),
    payments: row.payments.map((p) => ({
      id: p.id,
      method: p.method,
      label: PAYMENT_LABEL[p.method],
      amount: p.amount,
      tendered: p.tendered,
      change: p.tendered !== null ? p.tendered - p.amount : null,
      reference: p.reference,
      status: p.status,
      confirmedAt: p.confirmedAt,
    })),
    promotions: [...row.promotions]
      .sort((a, b) => PROMO_ORDER.indexOf(a.kind) - PROMO_ORDER.indexOf(b.kind))
      .map((p) => ({
        id: p.promotionId ?? p.code,
        code: p.code,
        name: p.name,
        kind: p.kind,
        amount: p.amount,
      })),
    voucher: row.voucherCode ? { code: row.voucherCode, amount: row.voucherDiscount } : null,
    member: row.memberTier
      ? {
          tier: row.memberTier,
          label: row.memberLabel,
          discountPercent: Number(row.memberPercent ?? 0),
        }
      : null,
    pointsEarned: row.pointsEarned,
    pointsRedeemed: row.pointsRedeemed,
    pointsRefunded: row.pointsRefunded,
    pointsRevoked: row.pointsRevoked,
    cancelledAt: row.cancelledAt,
    cancelledBy: row.cancelledBy?.name ?? null,
    printCount: row.printCount,
    returns: row.returns,
  };
}

export interface ReceiptStore {
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  taxCode: string | null;
  receiptFooter: string | null;
  branchName: string | null;
  returnDays: number;
}

export const receiptStore = (store: ReceiptStore) => ({
  name: store.name,
  branchName: store.branchName,
  code: store.code,
  address: store.address,
  phone: store.phone,
  taxCode: store.taxCode,
  receiptFooter: 'CẢM ƠN QUÝ KHÁCH – HẸN GẶP LẠI!',
  returnPolicy:
    store.receiptFooter ??
    `Đổi/trả trong ${store.returnDays} ngày, kèm hóa đơn và sản phẩm còn nguyên tem`,
});

export function toReceipt(row: OrderRow, store: ReceiptStore, pointsBalance: number | null) {
  const order = toOrder(row);
  const vatRate = Number(row.vatRate);
  return {
    store: receiptStore(store),
    order: {
      code: row.code,
      createdAt: row.createdAt,
      cashier: row.cashier.name,
      status: row.status,
      note: row.note,
      printCount: row.printCount,
    },
    customer: row.customer
      ? {
          name: row.customer.name,
          maskedPhone: maskPhone(row.customer.phone),
          tierLabel: row.memberLabel,
          pointsEarned: row.pointsEarned,
          pointsBalance: pointsBalance ?? row.customer.points,
        }
      : null,
    lines: row.lines.map((line) => ({
      name: line.name,
      unit: line.unit,
      quantity: line.quantity,
      price: line.price,
      amount: line.price * line.quantity,
      productDiscount: line.productDiscount,
      promoName: line.promoName,
      isGift: line.isGift,
    })),
    summary: {
      itemCount: order.totals.itemCount,
      subtotal: row.subtotal,
      productDiscount: row.productDiscount,
      orderPromos: row.promotions
        .filter((p) => p.kind === 'order')
        .map((p) => ({ name: p.name, amount: p.amount })),
      voucher: order.voucher,
      memberDiscount:
        row.memberDiscount > 0
          ? {
              label: row.memberLabel,
              percent: Number(row.memberPercent ?? 0),
              amount: row.memberDiscount,
            }
          : null,
      pointsDiscount: row.pointsDiscount,
      total: row.total,
      vatRate,
      vatIncluded: Math.round((row.total * vatRate) / (100 + vatRate)),
    },
    payments: order.payments
      .filter((p) => p.status !== 'voided')
      .map((p) => ({
        method: p.method,
        label: p.method === 'points' ? `Điểm thành viên (${row.pointsRedeemed} điểm)` : p.label,
        amount: p.amount,
        tendered: p.tendered,
        change: p.change,
        reference: p.reference,
        status: p.status,
      })),
    changeAmount: row.changeAmount,
    barcode: row.code,
  };
}
