import type { PrismaClient } from '@prisma/client';
import { vnDateCode } from '../src/common/daily-code';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { MembershipService } from '../src/modules/customers/membership.service';
import { PointLedger } from '../src/modules/customers/point-ledger.service';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import type { PaymentDto } from '../src/modules/orders/dto/order.dto';
import { OrderCommandsService } from '../src/modules/orders/order-commands.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { PricingService } from '../src/modules/orders/pricing.service';
import { ReturnsService } from '../src/modules/orders/returns.service';
import { VoucherRateLimit } from '../src/modules/promotions/voucher-rate-limit';
import { VoucherService } from '../src/modules/promotions/voucher.service';
import { StockLedger } from '../src/modules/stock/stock-ledger.service';

type Pay = 'cash' | 'transfer' | 'card' | 'mixed' | 'ewallet' | 'pending';

interface SeedOrder {
  daysAgo: number;
  hour: number;
  items: [string, number][];
  phone?: string;
  voucher?: string;
  pay: Pay;
  redeem?: number;
  then?: 'cancel' | 'return';
}

const ORDERS: SeedOrder[] = [
  {
    daysAgo: 13,
    hour: 9,
    items: [
      ['SP0001', 6],
      ['SP0003', 2],
    ],
    pay: 'cash',
  },
  {
    daysAgo: 12,
    hour: 17,
    items: [
      ['SP0007', 2],
      ['SP0008', 4],
      ['SP0015', 3],
    ],
    phone: '0987654321',
    pay: 'transfer',
  },
  {
    daysAgo: 11,
    hour: 11,
    items: [
      ['SP0011', 5],
      ['SP0013', 2],
    ],
    phone: '0901234567',
    voucher: 'FOSALE10',
    pay: 'cash',
  },
  {
    daysAgo: 10,
    hour: 19,
    items: [
      ['SP0019', 1],
      ['SP0022', 2],
    ],
    pay: 'card',
  },
  { daysAgo: 9, hour: 8, items: [['SP0002', 12]], phone: '0952917034', pay: 'mixed' },
  {
    daysAgo: 8,
    hour: 20,
    items: [
      ['SP0016', 2],
      ['SP0017', 3],
      ['SP0009', 1],
    ],
    pay: 'ewallet',
  },
  {
    daysAgo: 7,
    hour: 10,
    items: [
      ['SP0004', 6],
      ['SP0005', 4],
    ],
    phone: '0951819093',
    pay: 'cash',
  },
  {
    daysAgo: 6,
    hour: 15,
    items: [
      ['SP0026', 1],
      ['SP0027', 2],
    ],
    phone: '0978123456',
    voucher: 'GIAM20K',
    pay: 'transfer',
  },
  {
    daysAgo: 5,
    hour: 18,
    items: [
      ['SP0010', 3],
      ['SP0012', 2],
      ['SP0014', 1],
    ],
    pay: 'cash',
  },
  {
    daysAgo: 4,
    hour: 12,
    items: [
      ['SP0020', 2],
      ['SP0021', 1],
    ],
    phone: '0959013962',
    redeem: 50,
    pay: 'cash',
  },
  {
    daysAgo: 3,
    hour: 9,
    items: [
      ['SP0006', 4],
      ['SP0003', 3],
    ],
    phone: '0944026859',
    pay: 'card',
  },
  {
    daysAgo: 2,
    hour: 16,
    items: [
      ['SP0001', 12],
      ['SP0007', 2],
    ],
    phone: '0987654321',
    pay: 'mixed',
    then: 'return',
  },
  {
    daysAgo: 1,
    hour: 10,
    items: [
      ['SP0023', 1],
      ['SP0024', 2],
    ],
    pay: 'cash',
  },
  {
    daysAgo: 1,
    hour: 19,
    items: [
      ['SP0011', 3],
      ['SP0002', 6],
    ],
    phone: '0912345678',
    pay: 'transfer',
  },
  {
    daysAgo: 0,
    hour: 8,
    items: [
      ['SP0008', 6],
      ['SP0015', 2],
    ],
    pay: 'cash',
  },
  {
    daysAgo: 0,
    hour: 9,
    items: [
      ['SP0028', 1],
      ['SP0016', 1],
    ],
    phone: '0868987654',
    pay: 'pending',
  },
  { daysAgo: 0, hour: 10, items: [['SP0019', 2]], pay: 'pending', then: 'cancel' },
];

const CLIENT = { ip: '127.0.0.1', userAgent: 'seed' };
const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

const vnAt = (daysAgo: number, hour: number, minute: number) =>
  new Date(
    `${new Date(Date.now() + VN_OFFSET_MS - daysAgo * DAY_MS).toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`,
  );

function payments(pay: Pay, due: number): PaymentDto[] {
  const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;
  if (due <= 0) return [];
  if (pay === 'cash')
    return [{ method: 'cash', tendered: roundUp(due, due > 200_000 ? 100_000 : 50_000) }];
  if (pay === 'card') return [{ method: 'card', amount: due, reference: '4821' }];
  if (pay === 'ewallet')
    return [{ method: 'ewallet', amount: due, reference: 'MOMO-SEED', confirmed: true }];
  if (pay === 'transfer')
    return [{ method: 'transfer', amount: due, reference: 'FT-SEED', confirmed: true }];
  if (pay === 'pending') return [{ method: 'transfer', amount: due, reference: null }];
  const transfer = Math.floor(due / 2 / 1000) * 1000;
  return [
    { method: 'cash', tendered: roundUp(due - transfer, 10_000) },
    { method: 'transfer', amount: transfer, reference: 'FT-SEED', confirmed: true },
  ];
}

async function recode(
  prisma: PrismaClient,
  table: 'orders' | 'return_receipts',
  id: string,
  prefix: string,
  at: Date,
) {
  const head = `${prefix}${vnDateCode(at)}-`;
  const [{ max }] = await prisma.$queryRawUnsafe<{ max: number }[]>(
    `SELECT COALESCE(max(substring(code FROM ${head.length + 1})::int), 0)::int AS max FROM ${table} WHERE code LIKE $1`,
    `${head}%`,
  );
  const code = `${head}${String(max + 1).padStart(4, '0')}`;
  await prisma.$executeRawUnsafe(`UPDATE ${table} SET code = $1 WHERE id = $2::uuid`, code, id);
  return code;
}

async function backdate(prisma: PrismaClient, orderId: string, oldCode: string, at: Date) {
  const code =
    vnDateCode(at) === vnDateCode() ? oldCode : await recode(prisma, 'orders', orderId, 'HD', at);
  await prisma.$executeRaw`
    UPDATE orders SET created_at = ${at}, completed_at = CASE WHEN completed_at IS NULL THEN NULL ELSE ${at}::timestamp END
    WHERE id = ${orderId}::uuid`;
  await prisma.$executeRaw`
    UPDATE order_payments SET created_at = ${at},
      confirmed_at = CASE WHEN confirmed_at IS NULL THEN NULL ELSE ${at}::timestamp END
    WHERE order_id = ${orderId}::uuid`;
  await prisma.$executeRaw`UPDATE promotion_redemptions SET created_at = ${at}, order_code = ${code} WHERE order_id = ${orderId}::uuid`;
  await prisma.$executeRaw`UPDATE point_logs SET created_at = ${at}, ref_code = ${code} WHERE ref_code = ${oldCode}`;
  await prisma.$executeRaw`UPDATE stock_movements SET ref_code = ${code} WHERE ref_code = ${oldCode}`;
  return code;
}

export async function seedOrders(
  prisma: PrismaClient,
  storeId: string,
  users: { cashier: string; manager: string },
) {
  if (await prisma.order.count({ where: { storeId } })) return 0;
  const db = prisma as unknown as PrismaService;
  const ledger = new PointLedger();
  const membership = new MembershipService(db, ledger);
  const vouchers = new VoucherService(db, new VoucherRateLimit());
  const stock = new StockLedger();
  const idem = new IdempotencyService();
  const audit = new AuditService(db);
  const orders = new OrdersService(db);
  const pricing = new PricingService(db, membership, vouchers);
  const commands = new OrderCommandsService(
    db,
    pricing,
    orders,
    stock,
    vouchers,
    membership,
    ledger,
    idem,
    audit,
  );
  const returns = new ReturnsService(db, orders, stock, vouchers, membership, ledger, idem, audit);
  const cashier = { id: users.cashier, role: 'cashier' as const, storeId, sid: 'seed' };
  const manager = { id: users.manager, role: 'manager' as const, storeId, sid: 'seed' };
  const products = new Map(
    (
      await prisma.product.findMany({
        where: { deletedAt: null, status: 'active', category: { status: 'active' } },
        select: { id: true, sku: true, stocks: { where: { storeId }, select: { quantity: true } } },
      })
    ).map((p) => [p.sku, { id: p.id, stock: p.stocks[0]?.quantity ?? 0 }]),
  );
  const customers = new Map(
    (
      await prisma.customer.findMany({
        where: { status: 'active' },
        select: { id: true, phone: true },
      })
    ).map((c) => [c.phone, c.id]),
  );
  const run = Date.now().toString(36);
  let created = 0;
  for (const [index, seed] of ORDERS.entries()) {
    const items = seed.items.flatMap(([sku, quantity]) => {
      const product = products.get(sku);
      if (!product || product.stock < quantity) return [];
      product.stock -= quantity;
      return [{ productId: product.id, quantity }];
    });
    if (!items.length) continue;
    const input = {
      items,
      customerId: seed.phone ? (customers.get(seed.phone) ?? null) : null,
      voucherCode: seed.voucher ?? null,
      redeemPoints: seed.redeem ?? 0,
    };
    const quote = await commands.quote(cashier, input);
    if (quote.voucherIssue) input.voucherCode = null;
    const priced = quote.voucherIssue ? await commands.quote(cashier, input) : quote;
    const order = await commands.create(
      cashier,
      {
        ...input,
        payments: payments(seed.pay, priced.totals.due),
        note: null,
        expectedTotal: priced.totals.total,
      },
      `seed:order:${run}:${index}`,
      CLIENT,
    );
    const at = vnAt(seed.daysAgo, seed.hour, 10 + index);
    if (seed.then === 'cancel') {
      await commands.cancel(
        cashier,
        order.id,
        'Khách không chuyển khoản',
        `seed:cancel:${run}:${index}`,
        CLIENT,
      );
    }
    if (seed.then === 'return') {
      const receipt = await returns.create(
        manager,
        order.id,
        {
          lines: [
            {
              orderLineId: order.items[0].id,
              quantity: Math.min(2, order.items[0].quantity),
              restock: true,
            },
          ],
          reason: 'Sản phẩm móp méo',
          refundMethod: 'cash',
        },
        `seed:return:${run}:${index}`,
        CLIENT,
      );
      const returnAt = new Date(at.getTime() + DAY_MS / 2);
      const code = await recode(prisma, 'return_receipts', receipt.id, 'TH', returnAt);
      await prisma.$executeRaw`UPDATE return_receipts SET created_at = ${returnAt} WHERE id = ${receipt.id}::uuid`;
      await prisma.$executeRaw`UPDATE stock_movements SET ref_code = ${code} WHERE ref_code = ${receipt.code}`;
      await prisma.$executeRaw`UPDATE point_logs SET ref_code = ${code}, created_at = ${returnAt} WHERE ref_code = ${receipt.code}`;
    }
    await backdate(prisma, order.id, order.code, at);
    created += 1;
  }
  await prisma.$executeRaw`
    UPDATE customers c SET first_order_at = r.first_at, last_order_at = r.last_at
    FROM (
      SELECT customer_id, min(created_at) AS first_at, max(created_at) AS last_at FROM orders
      WHERE customer_id IS NOT NULL AND status IN ('completed', 'partially_refunded', 'refunded')
      GROUP BY customer_id
    ) r
    WHERE c.id = r.customer_id`;
  return created;
}
