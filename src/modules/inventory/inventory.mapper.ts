import type { MovementType, Prisma } from '@prisma/client';
import { productInclude, toProduct } from '../products/product.mapper';
import type { InventoryRow } from './inventory.query';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type ProductRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof productInclude> }>;

export function toInventoryItem(row: ProductRow, extra: Omit<InventoryRow, 'id'>) {
  const product = toProduct(row, true);
  const stock = product.stock;
  const minStockValue = row.minStock;
  return {
    ...product,
    minStockValue,
    stockValue: Math.max(stock, 0) * (row.costPrice ?? row.price),
    level: stock <= 0 ? 'out' : stock <= minStockValue ? 'low' : 'ok',
    soldLast30: extra.sold,
    lastMovementAt: extra.lastMovementAt,
    slow: stock > 0 && extra.sold === 0,
  };
}

export const movementInclude = {
  product: { select: { name: true, sku: true, barcode: true, unit: { select: { name: true } } } },
  createdBy: { select: { name: true } },
} satisfies Prisma.StockMovementInclude;

type MovementRow = Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>;

export const toApiMovementType = (type: MovementType) => type.replace('_', '-');

export const toDbMovementType = (type: string) => type.replace('-', '_') as MovementType;

export function toMovement(row: MovementRow) {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
    sku: row.product.sku,
    barcode: row.product.barcode,
    unit: row.product.unit?.name ?? '',
    type: toApiMovementType(row.type),
    quantity: row.quantity,
    before: row.before,
    after: row.after,
    reason: row.reason,
    note: row.note,
    refCode: row.refCode,
    createdBy: row.createdBy.name,
    createdAt: row.createdAt,
  };
}

export function vnDayStart(now = Date.now()) {
  return Math.floor((now + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
}

export function buildStockSeries(
  current: number,
  movements: { quantity: number; createdAt: Date }[],
  days: number,
  now = Date.now(),
) {
  const today = vnDayStart(now);
  const sorted = [...movements].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const points: { date: string; stock: number }[] = [];
  let stock = current;
  let index = 0;
  for (let day = 0; day < days; day += 1) {
    const start = today - day * DAY_MS;
    points.push({ date: new Date(start + VN_OFFSET_MS).toISOString().slice(0, 10), stock });
    while (index < sorted.length && sorted[index].createdAt.getTime() >= start) {
      stock -= sorted[index].quantity;
      index += 1;
    }
  }
  return points.reverse();
}

export const seriesStart = (days: number, now = Date.now()) =>
  new Date(vnDayStart(now) - (days - 1) * DAY_MS);
