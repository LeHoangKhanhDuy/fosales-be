import type { ReceiveLineDto } from './dto/receive.dto';
import { PurchaseErrors } from './purchasing.errors';
import { APPROVAL_THRESHOLD, countLine, isPastDate, toDateOnly } from './purchasing.utils';

interface OrderItem {
  id: string;
  productId: string;
  orderedQty: number;
  receivedQty: number;
  damagedQty: number;
  unitCost: number;
}

interface PlanInput {
  items: OrderItem[];
  lines: ReceiveLineDto[];
  validExtraIds: Set<string>;
  approvedBy?: string | null;
  discount: number;
  discountGiven: number;
}

export function planReceipt({
  items,
  lines,
  validExtraIds,
  approvedBy,
  discount,
  discountGiven,
}: PlanInput) {
  const byProduct = new Map(items.map((item) => [item.productId, item]));
  const seen = new Set<string>();
  const counted = lines.map((line) => {
    if (seen.has(line.productId)) throw PurchaseErrors.duplicateProduct();
    seen.add(line.productId);
    const item = byProduct.get(line.productId);
    if (line.extra ? item : !item) throw PurchaseErrors.lineInvalid(line.productId);
    if (line.extra && !validExtraIds.has(line.productId))
      throw PurchaseErrors.productInvalid([line.productId]);
    if (line.damagedQty > line.scannedQty) throw PurchaseErrors.damagedExceeds();
    const expiryDate = line.expiryDate ? toDateOnly(line.expiryDate) : null;
    if (expiryDate && (Number.isNaN(expiryDate.getTime()) || isPastDate(expiryDate))) {
      throw PurchaseErrors.expiryInvalid();
    }
    const expectedQty = item ? Math.max(0, item.orderedQty - item.receivedQty) : 0;
    return {
      ...line,
      item,
      expectedQty,
      expiryDate,
      lotNo: line.lotNo ?? null,
      ...countLine({ ...line, expectedQty }),
    };
  });

  if (!counted.some((line) => line.scannedQty > 0)) throw PurchaseErrors.receiveEmpty();

  const lineOf = new Map(counted.map((line) => [line.productId, line]));
  const expectedValue = items.reduce((sum, item) => {
    const open = Math.max(0, item.orderedQty - item.receivedQty);
    return sum + open * (lineOf.get(item.productId)?.unitCost ?? item.unitCost);
  }, 0);
  const grossValue = counted.reduce((sum, line) => sum + line.acceptedQty * line.unitCost, 0);
  if (
    expectedValue > 0 &&
    Math.abs(grossValue - expectedValue) / expectedValue > APPROVAL_THRESHOLD &&
    !approvedBy?.trim()
  ) {
    throw PurchaseErrors.approvalRequired(expectedValue, grossValue);
  }

  const itemUpdates = items.flatMap((item) => {
    const line = lineOf.get(item.productId);
    if (!line) return [];
    const receivedQty = item.receivedQty + line.acceptedQty;
    const orderedQty =
      line.shortageAction === 'cancel' && receivedQty < item.orderedQty
        ? receivedQty
        : item.orderedQty;
    return [
      {
        id: item.id,
        data: {
          receivedQty,
          orderedQty,
          damagedQty: item.damagedQty + line.damagedQty,
          unitCost: line.unitCost,
        },
      },
    ];
  });
  const newItems = counted
    .filter((line) => line.extra && line.acceptedQty > 0)
    .map((line) => ({
      productId: line.productId,
      orderedQty: line.acceptedQty,
      receivedQty: line.acceptedQty,
      damagedQty: line.damagedQty,
      unitCost: line.unitCost,
      packSize: 1,
    }));

  const updated = new Map(itemUpdates.map((update) => [update.id, update.data]));
  const completed = items.every((item) => {
    const next = updated.get(item.id) ?? item;
    return next.receivedQty >= next.orderedQty;
  });

  const subtotal = items.reduce((sum, item) => sum + item.orderedQty * item.unitCost, 0);
  const remaining = Math.max(0, discount - discountGiven);
  const share = completed
    ? remaining
    : subtotal > 0
      ? Math.round((discount * grossValue) / subtotal)
      : 0;
  const receiptDiscount = Math.min(share, remaining, grossValue);

  return {
    lines: counted.filter((line) => line.scannedQty > 0 || line.damagedQty > 0),
    grossValue,
    discount: receiptDiscount,
    value: grossValue - receiptDiscount,
    expectedValue,
    itemUpdates,
    newItems,
    completed,
  };
}
