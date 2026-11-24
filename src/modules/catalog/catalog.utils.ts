export const PRODUCT_COUNT = { _count: { select: { products: true } } } as const;

export function withProductCount<T extends { _count: { products: number } }>({ _count, ...rest }: T) {
  return { ...rest, productCount: _count.products };
}

export function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
