import { toNameKey } from '../../common/utils/text';

export const SKU_PATTERN = /^[A-Z0-9._-]{2,32}$/;
export const BARCODE_PATTERN = /^\d{8,14}$/;
export const PRICE_MAX = 1_000_000_000;
export const STOCK_MAX = 1_000_000;
export const MIN_STOCK_MAX = 100_000;
export const BULK_MAX = 200;

export const normalizeSku = (value: string) => value.trim().toUpperCase();

export const formatSku = (n: number) => `SP${String(n).padStart(4, '0')}`;

export function ean13CheckDigit(first12: string) {
  const sum = [...first12].reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

export function isValidBarcode(code: string) {
  if (!BARCODE_PATTERN.test(code)) return false;
  return code.length !== 13 || ean13CheckDigit(code.slice(0, 12)) === code[12];
}

export function productSearchKey(name: string, sku: string, barcode?: string | null) {
  return [toNameKey(name), sku.toLowerCase(), barcode ?? ''].filter(Boolean).join(' ');
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
