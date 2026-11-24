export function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function toNameKey(value: string): string {
  return collapseSpaces(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

export const compareVi = (a: string, b: string) => collator.compare(a, b);
