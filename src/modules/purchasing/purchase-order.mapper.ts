import type { Prisma } from '@prisma/client';
import { calcTotals, formatDateOnly, isOverdue } from './purchasing.utils';

const productSelect = {
  name: true,
  sku: true,
  barcode: true,
  categoryId: true,
  image: true,
  imageFit: true,
  unit: { select: { name: true } },
} satisfies Prisma.ProductSelect;

const nameOnly = { select: { name: true } } as const;

export const receiptInclude = {
  receivedBy: nameOnly,
  lines: {
    orderBy: { lineNo: 'asc' },
    include: { product: { select: { name: true, sku: true, barcode: true, unit: nameOnly } } },
  },
} satisfies Prisma.GoodsReceiptInclude;

export const orderInclude = {
  supplier: nameOnly,
  createdBy: nameOnly,
  items: { orderBy: { lineNo: 'asc' }, include: { product: { select: productSelect } } },
  events: { orderBy: [{ at: 'asc' }, { id: 'asc' }], include: { by: nameOnly } },
  receipts: { orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }], include: receiptInclude },
  session: { include: { startedBy: nameOnly } },
} satisfies Prisma.PurchaseOrderInclude;

export const orderListInclude = {
  supplier: nameOnly,
  createdBy: nameOnly,
  items: { select: { orderedQty: true, unitCost: true, receivedQty: true } },
  receipts: { select: { value: true } },
  session: { select: { startedBy: nameOnly } },
} satisfies Prisma.PurchaseOrderInclude;

type ReceiptRow = Prisma.GoodsReceiptGetPayload<{ include: typeof receiptInclude }>;
type OrderRow = Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>;
type OrderListRow = Prisma.PurchaseOrderGetPayload<{ include: typeof orderListInclude }>;
type ItemProduct = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

export const toItemProduct = (productId: string, product: ItemProduct) => ({
  productId,
  name: product.name,
  sku: product.sku,
  barcode: product.barcode,
  unit: product.unit?.name ?? '',
  categoryId: product.categoryId ?? '',
  image: product.image,
  imageFit: product.imageFit,
});

export const itemProductSelect = productSelect;

export const toReceipt = (row: ReceiptRow) => ({
  id: row.id,
  code: row.code,
  receivedAt: row.receivedAt,
  receivedBy: row.receivedBy.name,
  supplierDocNo: row.supplierDocNo,
  packageCount: row.packageCount,
  packagingOk: row.packagingOk,
  deliveredBy: row.deliveredBy,
  note: row.note,
  approvedBy: row.approvedBy,
  grossValue: row.grossValue,
  discount: row.discount,
  value: row.value,
  lines: row.lines.map((line) => ({
    productId: line.productId,
    name: line.product.name,
    sku: line.product.sku,
    barcode: line.product.barcode,
    unit: line.product.unit?.name ?? '',
    expectedQty: line.expectedQty,
    scannedQty: line.scannedQty,
    acceptedQty: line.acceptedQty,
    damagedQty: line.damagedQty,
    returnedQty: line.returnedQty,
    unitCost: line.unitCost,
    extra: line.extra,
    expiryDate: formatDateOnly(line.expiryDate),
    lotNo: line.lotNo,
  })),
});

function base(row: OrderListRow | OrderRow) {
  const receivedValue = row.receipts.reduce((sum, receipt) => sum + receipt.value, 0);
  return {
    id: row.id,
    code: row.code,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    status: row.status,
    discount: row.discount,
    note: row.note,
    expectedDate: formatDateOnly(row.expectedDate)!,
    createdAt: row.createdAt,
    createdBy: row.createdBy.name,
    placedAt: row.placedAt,
    completedAt: row.completedAt,
    cancelReason: row.cancelReason,
    cancelledAt: row.cancelledAt,
    totals: calcTotals(row.items, row.discount, receivedValue),
    overdue: isOverdue(row.status, row.expectedDate),
    receivingBy: row.session?.startedBy.name ?? null,
  };
}

export const toOrderListItem = (row: OrderListRow) => base(row);

export const toOrder = (row: OrderRow) => ({
  ...base(row),
  items: row.items.map((item) => ({
    ...toItemProduct(item.productId, item.product),
    orderedQty: item.orderedQty,
    unitCost: item.unitCost,
    packSize: item.packSize,
    receivedQty: item.receivedQty,
    damagedQty: item.damagedQty,
  })),
  history: row.events.map((event) => ({ label: event.label, at: event.at, by: event.by.name })),
  receipts: row.receipts.map(toReceipt),
  draftReceipt: row.session?.data ?? null,
  draftVersion: row.session?.version ?? null,
});

export type PurchaseOrderView = ReturnType<typeof toOrder>;
