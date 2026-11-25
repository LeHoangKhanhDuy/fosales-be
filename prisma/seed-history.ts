import type { MovementType, Prisma, PrismaClient } from '@prisma/client';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const VN_OFFSET = 7 * HOUR;
const HISTORY_DAYS = 60;
const SLOW_SKUS = new Set(['SP0019', 'SP0022']);

interface Staff {
  admin: string;
  manager: string;
  cashier: string;
}

interface Draft {
  type: MovementType;
  quantity: number;
  at: number;
  refCode?: string;
  reason?: string;
  by: string;
}

const random = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const vnToday = () => Math.floor((Date.now() + VN_OFFSET) / DAY) * DAY - VN_OFFSET;

const ymd = (at: number) => new Date(at + VN_OFFSET).toISOString().slice(2, 10).replace(/-/g, '');

function dayDrafts(
  sku: string,
  daysAgo: number,
  bestSeller: boolean,
  rand: () => number,
  staff: Staff,
) {
  const start = vnToday() - daysAgo * DAY;
  const at = (hour: number) =>
    Math.min(start + hour * HOUR + Math.floor(rand() * 50) * 60_000, Date.now() - 60_000);
  const drafts: Draft[] = [];
  const selling = !(SLOW_SKUS.has(sku) && daysAgo < 30);
  const sales =
    selling && rand() < (bestSeller ? 0.9 : 0.55)
      ? 1 + Math.floor(rand() * (bestSeller ? 4 : 2))
      : 0;
  for (let i = 0; i < sales; i += 1) {
    const time = at(8 + Math.floor(rand() * 13));
    const refCode = `HD${ymd(time)}${String(Math.floor(rand() * 900) + 100)}`;
    drafts.push({
      type: 'sale',
      quantity: -(1 + Math.floor(rand() * (bestSeller ? 4 : 2))),
      at: time,
      refCode,
      by: staff.cashier,
    });
    if (rand() < 0.04) {
      drafts.push({
        type: 'return',
        quantity: 1,
        at: time + 2 * HOUR,
        refCode,
        reason: 'Khách đổi trả',
        by: staff.cashier,
      });
    }
  }
  if (rand() < 0.03) {
    const reason = rand() < 0.5 ? 'Hư hỏng' : 'Hết hạn sử dụng';
    drafts.push({
      type: 'adjust_out',
      quantity: -(1 + Math.floor(rand() * 2)),
      at: at(21),
      reason,
      by: staff.admin,
    });
  }
  if (daysAgo % 12 === 5) {
    const quantity = (bestSeller ? 48 : 18) + Math.floor(rand() * 4) * 6;
    drafts.push({
      type: 'import',
      quantity,
      at: at(7),
      refCode: `PN${ymd(start)}-${sku.slice(-3)}`,
      by: staff.manager,
    });
  }
  return drafts.sort((a, b) => b.at - a.at);
}

function buildHistory(
  sku: string,
  current: number,
  bestSeller: boolean,
  seed: number,
  staff: Staff,
) {
  const rand = random(seed);
  const rows: Omit<Prisma.StockMovementCreateManyInput, 'productId' | 'storeId'>[] = [];
  let after = current;
  for (let daysAgo = 0; daysAgo < HISTORY_DAYS; daysAgo += 1) {
    for (const draft of dayDrafts(sku, daysAgo, bestSeller, rand, staff)) {
      const quantity = draft.quantity > 0 ? Math.min(draft.quantity, after) : draft.quantity;
      if (quantity === 0) continue;
      const before = after - quantity;
      rows.push({
        type: draft.type,
        quantity,
        before,
        after,
        refCode: draft.refCode ?? null,
        reason: draft.reason ?? null,
        createdById: draft.by,
        createdAt: new Date(draft.at),
      });
      after = before;
    }
  }
  if (after > 0) {
    rows.push({
      type: 'initial',
      quantity: after,
      before: 0,
      after,
      reason: 'Tồn đầu kỳ',
      createdById: staff.admin,
      createdAt: new Date(vnToday() - HISTORY_DAYS * DAY + 7 * HOUR),
    });
  }
  return rows.reverse();
}

export async function seedHistory(
  prisma: PrismaClient,
  storeId: string,
  skus: string[],
  staff: Staff,
) {
  const products = await prisma.product.findMany({
    where: { skuKey: { in: skus } },
    select: {
      id: true,
      sku: true,
      isBestSeller: true,
      stocks: { where: { storeId }, select: { quantity: true } },
    },
    orderBy: { sku: 'asc' },
  });
  let seeded = 0;
  for (const [index, product] of products.entries()) {
    const generated = await prisma.stockMovement.count({
      where: { productId: product.id, storeId, refCode: { not: null } },
    });
    if (generated) continue;
    const current = product.stocks[0]?.quantity ?? 0;
    const rows = buildHistory(product.sku, current, product.isBestSeller, 7331 + index * 97, staff);
    await prisma.$transaction([
      prisma.stockMovement.deleteMany({ where: { productId: product.id, storeId } }),
      prisma.stockMovement.createMany({
        data: rows.map((row) => ({ ...row, productId: product.id, storeId })),
      }),
      prisma.productStock.upsert({
        where: { productId_storeId: { productId: product.id, storeId } },
        update: { lastMovementAt: rows.at(-1)?.createdAt ?? null },
        create: {
          productId: product.id,
          storeId,
          quantity: current,
          lastMovementAt: rows.at(-1)?.createdAt ?? null,
        },
      }),
    ]);
    seeded += 1;
  }
  return seeded;
}
