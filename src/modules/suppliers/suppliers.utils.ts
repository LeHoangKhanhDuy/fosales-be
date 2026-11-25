import { toNameKey } from '../../common/utils/text';

export const SUPPLIER_CODE_PATTERN = /^[A-Z0-9_-]{2,20}$/;
export const MAX_PAYMENT = 10_000_000_000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const formatSupplierCode = (n: number) => `NCC${String(n).padStart(3, '0')}`;

const compact = (value: string | null | undefined) =>
  value ? toNameKey(value).replace(/\s+/g, '') : '';

export function supplierSearchKey(fields: {
  name: string;
  code: string;
  contact: string;
  phone: string;
  taxCode?: string | null;
  email?: string | null;
}) {
  return [fields.name, fields.code, fields.contact, fields.phone, fields.taxCode, fields.email]
    .map(compact)
    .filter(Boolean)
    .join('|');
}

export const searchTerm = (keyword: string) => compact(keyword);

export const money = (value: bigint | number | null | undefined) => Number(value ?? 0);
