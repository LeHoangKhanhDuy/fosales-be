import { Prisma } from '@prisma/client';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const TABLES = {
  purchase_orders: Prisma.raw('purchase_orders'),
  goods_receipts: Prisma.raw('goods_receipts'),
  supplier_payments: Prisma.raw('supplier_payments'),
};

export type CodeTable = keyof typeof TABLES;

export const vnDateCode = (at = new Date()) =>
  new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(2, 10).replace(/-/g, '');

export async function nextDailyCode(
  tx: Prisma.TransactionClient,
  table: CodeTable,
  prefix: string,
) {
  const head = `${prefix}${vnDateCode()}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fosales:code:${head}`}))`;
  const [{ max }] = await tx.$queryRaw<{ max: number }[]>`
    SELECT COALESCE(max(substring(code FROM ${head.length + 1}::int)::int), 0)::int AS max
    FROM ${TABLES[table]} WHERE code LIKE ${`${head}%`}`;
  return `${head}${String(max + 1).padStart(4, '0')}`;
}
