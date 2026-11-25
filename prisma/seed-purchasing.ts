import type { PrismaClient, Role } from '@prisma/client';
import type { AuthUser } from '../src/common/auth-user';
import { vnDateCode } from '../src/common/daily-code';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { GoodsReceiptsService } from '../src/modules/purchasing/goods-receipts.service';
import { PurchaseOrderCommandsService } from '../src/modules/purchasing/purchase-order-commands.service';
import { PurchaseOrdersService } from '../src/modules/purchasing/purchase-orders.service';
import { vnToday } from '../src/modules/purchasing/purchasing.utils';
import { ReceivingService } from '../src/modules/purchasing/receiving.service';
import { StockLedger } from '../src/modules/stock/stock-ledger.service';
import { SupplierLedger } from '../src/modules/suppliers/supplier-ledger.service';
import { SuppliersService } from '../src/modules/suppliers/suppliers.service';

type Status = 'draft' | 'ordered' | 'partial' | 'completed' | 'cancelled';

interface Seed {
  supplier: string;
  skus: [string, number][];
  status: Status;
  createdDaysAgo: number;
  expectedIn: number;
  receivedRatio?: number;
  discount?: number;
  note?: string;
}

const SEEDS: Seed[] = [
  {
    supplier: 'NCC001',
    skus: [
      ['SP0001', 96],
      ['SP0002', 48],
      ['SP0004', 48],
      ['SP0005', 24],
    ],
    status: 'ordered',
    createdDaysAgo: 1,
    expectedIn: 1,
    note: 'Giao buổi sáng trước 10h',
  },
  {
    supplier: 'NCC002',
    skus: [
      ['SP0011', 36],
      ['SP0012', 24],
      ['SP0013', 30],
      ['SP0014', 12],
    ],
    status: 'ordered',
    createdDaysAgo: 4,
    expectedIn: -1,
  },
  {
    supplier: 'NCC003',
    skus: [
      ['SP0007', 30],
      ['SP0008', 60],
      ['SP0009', 12],
      ['SP0010', 24],
    ],
    status: 'partial',
    createdDaysAgo: 6,
    expectedIn: -3,
    receivedRatio: 0.6,
  },
  {
    supplier: 'NCC004',
    skus: [
      ['SP0019', 20],
      ['SP0020', 30],
      ['SP0021', 15],
    ],
    status: 'draft',
    createdDaysAgo: 0,
    expectedIn: 2,
  },
  {
    supplier: 'NCC005',
    skus: [
      ['SP0022', 12],
      ['SP0023', 36],
      ['SP0024', 12],
      ['SP0025', 24],
    ],
    status: 'draft',
    createdDaysAgo: 0,
    expectedIn: 3,
  },
  {
    supplier: 'NCC001',
    skus: [
      ['SP0003', 120],
      ['SP0006', 24],
    ],
    status: 'completed',
    createdDaysAgo: 9,
    expectedIn: -7,
    receivedRatio: 1,
    discount: 50_000,
  },
  {
    supplier: 'NCC003',
    skus: [
      ['SP0015', 300],
      ['SP0016', 90],
      ['SP0017', 60],
    ],
    status: 'completed',
    createdDaysAgo: 14,
    expectedIn: -12,
    receivedRatio: 1,
  },
  {
    supplier: 'NCC002',
    skus: [
      ['SP0011', 48],
      ['SP0013', 30],
    ],
    status: 'completed',
    createdDaysAgo: 18,
    expectedIn: -16,
    receivedRatio: 1,
  },
  {
    supplier: 'NCC005',
    skus: [
      ['SP0026', 30],
      ['SP0027', 20],
      ['SP0028', 24],
    ],
    status: 'partial',
    createdDaysAgo: 11,
    expectedIn: -8,
    receivedRatio: 0.5,
  },
  {
    supplier: 'NCC004',
    skus: [
      ['SP0019', 25],
      ['SP0020', 40],
    ],
    status: 'cancelled',
    createdDaysAgo: 7,
    expectedIn: -5,
  },
  {
    supplier: 'NCC003',
    skus: [['SP0018', 20]],
    status: 'completed',
    createdDaysAgo: 24,
    expectedIn: -22,
    receivedRatio: 1,
  },
];

const CLIENT = { ip: '127.0.0.1', userAgent: 'seed' };
const DAY_MS = 86_400_000;

const vnDate = (daysAgo: number) => vnToday(Date.now() - daysAgo * DAY_MS);
const at = (daysAgo: number, hour: number) =>
  new Date(`${vnDate(daysAgo)}T${String(hour).padStart(2, '0')}:15:00+07:00`);

function services(prisma: PrismaClient) {
  const db = prisma as unknown as PrismaService;
  const audit = new AuditService(db);
  const suppliers = new SuppliersService(db);
  const orders = new PurchaseOrdersService(db);
  const receipts = new GoodsReceiptsService(db);
  return {
    commands: new PurchaseOrderCommandsService(db, orders, suppliers, audit),
    receiving: new ReceivingService(
      db,
      orders,
      receipts,
      new StockLedger(),
      new SupplierLedger(),
      new IdempotencyService(),
      audit,
    ),
  };
}

async function recode(
  prisma: PrismaClient,
  table: 'purchase_orders' | 'goods_receipts',
  id: string,
  prefix: string,
  when: Date,
) {
  const head = `${prefix}${vnDateCode(when)}-`;
  const [{ max }] = await prisma.$queryRawUnsafe<{ max: number }[]>(
    `SELECT COALESCE(max(substring(code FROM ${head.length + 1})::int), 0)::int AS max FROM ${table} WHERE code LIKE $1`,
    `${head}%`,
  );
  const code = `${head}${String(max + 1).padStart(4, '0')}`;
  await prisma.$executeRawUnsafe(`UPDATE ${table} SET code = $1 WHERE id = $2::uuid`, code, id);
  return code;
}

async function backdate(prisma: PrismaClient, seed: Seed, poId: string, oldCode: string) {
  const created = at(seed.createdDaysAgo, 8);
  const code = seed.createdDaysAgo
    ? await recode(prisma, 'purchase_orders', poId, 'DH', created)
    : oldCode;
  const placed = seed.status === 'draft' ? null : at(seed.createdDaysAgo, 9);
  await prisma.$executeRaw`
    UPDATE purchase_orders SET created_at = ${created}, placed_at = ${placed},
      expected_date = ${vnDate(-seed.expectedIn)}::date,
      cancelled_at = CASE WHEN cancelled_at IS NULL THEN NULL ELSE ${at(seed.createdDaysAgo - 1, 15)}::timestamp END
    WHERE id = ${poId}::uuid`;
  await prisma.$executeRaw`UPDATE purchase_order_events SET at = ${created} WHERE po_id = ${poId}::uuid AND label = 'Tạo đơn đặt hàng'`;
  if (placed) {
    await prisma.$executeRaw`UPDATE purchase_order_events SET at = ${placed} WHERE po_id = ${poId}::uuid AND label = 'Gửi đơn cho nhà cung cấp'`;
  }
  await prisma.$executeRaw`UPDATE purchase_order_events SET at = ${at(seed.createdDaysAgo - 1, 15)} WHERE po_id = ${poId}::uuid AND label LIKE 'Hủy đơn:%'`;
  if (code !== oldCode) {
    await prisma.$executeRaw`UPDATE purchase_order_events SET label = replace(label, ${oldCode}, ${code}) WHERE po_id = ${poId}::uuid`;
    await prisma.$executeRaw`UPDATE stock_movements SET reason = replace(reason, ${oldCode}, ${code}) WHERE reason = ${`Nhận hàng ${oldCode}`}`;
    await prisma.$executeRaw`UPDATE supplier_ledger_entries SET label = replace(label, ${oldCode}, ${code}) WHERE label = ${`Nhập hàng theo ${oldCode}`}`;
  }
}

async function backdateReceipt(
  prisma: PrismaClient,
  receiptId: string,
  oldCode: string,
  poId: string,
  daysAgo: number,
  completed: boolean,
) {
  const received = at(daysAgo, 7);
  const code = daysAgo
    ? await recode(prisma, 'goods_receipts', receiptId, 'PN', received)
    : oldCode;
  await prisma.$executeRaw`UPDATE goods_receipts SET received_at = ${received} WHERE id = ${receiptId}::uuid`;
  await prisma.$executeRaw`
    UPDATE supplier_ledger_entries e
    SET occurred_at = ${received}, code = ${code},
      due_at = ${received}::timestamp + make_interval(days => s.payment_term_days)
    FROM suppliers s
    WHERE e.ref_id = ${receiptId}::uuid AND s.id = e.supplier_id`;
  await prisma.$executeRaw`UPDATE stock_movements SET ref_code = ${code} WHERE ref_code = ${oldCode}`;
  await prisma.$executeRaw`
    UPDATE purchase_order_events SET at = ${received}, label = replace(label, ${oldCode}, ${code})
    WHERE po_id = ${poId}::uuid AND label LIKE ${`%${oldCode}%`}`;
  if (completed) {
    await prisma.$executeRaw`UPDATE purchase_orders SET completed_at = ${received} WHERE id = ${poId}::uuid`;
  }
}

export async function seedPurchasing(
  prisma: PrismaClient,
  storeId: string,
  users: { admin: string; manager: string },
) {
  if (await prisma.purchaseOrder.count({ where: { storeId } })) return 0;
  const { commands, receiving } = services(prisma);
  const asUser = (id: string, role: Role): AuthUser => ({ id, role, storeId, sid: 'seed' });
  const admin = asUser(users.admin, 'admin');
  const manager = asUser(users.manager, 'manager');
  const suppliers = new Map(
    (
      await prisma.supplier.findMany({
        select: { id: true, code: true, status: true, suspendReason: true, suspendedUntil: true },
      })
    ).map((row) => [row.code, row]),
  );
  const products = new Map(
    (
      await prisma.product.findMany({
        where: { deletedAt: null },
        select: { id: true, sku: true, costPrice: true, price: true },
      })
    ).map((row) => [row.sku, row]),
  );
  let created = 0;
  for (const seed of [...SEEDS].sort((a, b) => b.createdDaysAgo - a.createdDaysAgo)) {
    const supplier = suppliers.get(seed.supplier);
    const items = seed.skus.flatMap(([sku, orderedQty]) => {
      const product = products.get(sku);
      return product
        ? [
            {
              productId: product.id,
              orderedQty,
              unitCost: product.costPrice ?? Math.round(product.price * 0.75),
            },
          ]
        : [];
    });
    if (!supplier || !items.length) continue;
    const suspended = supplier.status !== 'active';
    if (suspended)
      await prisma.supplier.update({ where: { id: supplier.id }, data: { status: 'active' } });
    try {
      const order = await commands.create(
        admin,
        {
          supplierId: supplier.id,
          expectedDate: vnDate(-Math.max(seed.expectedIn, 0)),
          items,
          discount: seed.discount ?? 0,
          note: seed.note ?? null,
          place: seed.status !== 'draft',
        },
        CLIENT,
      );
      if (seed.status === 'cancelled') {
        await commands.cancel(admin, order.id, 'Nhà cung cấp hết hàng', CLIENT);
      }
      if (seed.receivedRatio) {
        const ratio = seed.receivedRatio;
        const { receipt } = await receiving.receive(
          manager,
          order.id,
          {
            checkIn: {
              supplierDocNo: `HĐ${10230 + created * 11}`,
              packageCount: items.length * 2,
              packagingOk: true,
              deliveredBy: null,
            },
            lines: order.items.map((item, index) => ({
              productId: item.productId,
              scannedQty: ratio < 1 && index % 2 === 1 ? 0 : Math.round(item.orderedQty * ratio),
              damagedQty: 0,
              unitCost: item.unitCost,
              extra: false,
              shortageAction: 'backorder',
              excessAction: 'accept',
            })),
            approvedBy: ratio < 1 ? 'Khánh Duy' : null,
          },
          `seed:${order.id}`,
          CLIENT,
        );
        await backdateReceipt(
          prisma,
          receipt.id,
          receipt.code,
          order.id,
          Math.max(0, -seed.expectedIn),
          ratio >= 1,
        );
      }
      await backdate(prisma, seed, order.id, order.code);
      created += 1;
    } finally {
      if (suspended) {
        await prisma.supplier.update({
          where: { id: supplier.id },
          data: {
            status: supplier.status,
            suspendReason: supplier.suspendReason,
            suspendedUntil: supplier.suspendedUntil,
          },
        });
      }
    }
  }
  return created;
}
