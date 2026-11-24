import type { Prisma, Role } from '@prisma/client';

export const productInclude = (storeId: string) =>
  ({
    unit: { select: { name: true } },
    stocks: { where: { storeId }, select: { quantity: true } },
  }) satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof productInclude> }>;

export const canSeeCost = (role: Role) => role !== 'cashier';

export function toProduct(row: ProductRow, showCost: boolean) {
  const product = {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    categoryId: row.categoryId ?? '',
    unitId: row.unitId ?? '',
    unit: row.unit?.name ?? '',
    price: row.price,
    originalPrice: row.originalPrice,
    costPrice: row.costPrice,
    stock: row.stocks[0]?.quantity ?? 0,
    minStock: row.minStock,
    image: row.image,
    imageFit: row.imageFit,
    isBestSeller: row.isBestSeller,
    status: row.status,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (showCost) return product;
  const { costPrice: _hidden, ...publicProduct } = product;
  return publicProduct;
}

export type ProductView = ReturnType<typeof toProduct>;

export function toOption(row: ProductRow, showCost: boolean) {
  const { id, sku, barcode, name, unit, price, stock, image, categoryId, status, ...rest } =
    toProduct(row, showCost);
  const option = { id, sku, barcode, name, unit, price, stock, image, categoryId, status };
  return 'costPrice' in rest ? { ...option, costPrice: rest.costPrice } : option;
}
