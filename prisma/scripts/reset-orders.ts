import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const money = (n: number) => n.toLocaleString('vi-VN');

async function main() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Chỉ chạy khi NODE_ENV=development');
  const keepCodes = process.argv
    .slice(2)
    .filter((a) => !a.startsWith('--'))
    .map((c) => c.toUpperCase());
  const apply = process.argv.includes('--apply');

  const keep = await prisma.order.findMany({
    where: { code: { in: keepCodes } },
    select: { id: true, code: true, total: true, status: true },
  });
  const missing = keepCodes.filter((c) => !keep.some((o) => o.code === c));
  if (missing.length) throw new Error(`Không tìm thấy đơn cần giữ: ${missing.join(', ')}`);
  const orders = await prisma.order.findMany({
    where: { code: { notIn: keepCodes } },
    select: {
      id: true,
      code: true,
      total: true,
      status: true,
      customerId: true,
      returns: { select: { id: true, code: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `Giữ lại: ${keep.map((o) => `${o.code} (${money(o.total)}, ${o.status})`).join(', ') || '—'}`,
  );
  console.log(`Sẽ xóa ${orders.length} đơn: ${orders.map((o) => o.code).join(', ') || '—'}`);
  if (!orders.length) return;
  if (!apply) {
    console.log('Chạy thử — chưa thay đổi gì. Thêm --apply để thực hiện.');
    return;
  }

  const orderIds = orders.map((o) => o.id);
  const returnIds = orders.flatMap((o) => o.returns.map((r) => r.id));
  const codes = [
    ...orders.map((o) => o.code),
    ...orders.flatMap((o) => o.returns.map((r) => r.code)),
  ];
  const customerIds = [
    ...new Set(orders.map((o) => o.customerId).filter((id): id is string => !!id)),
  ];

  await prisma.$transaction(
    async (tx) => {
      const stock = await tx.$executeRaw`
        UPDATE product_stocks ps SET quantity = ps.quantity - m.delta, updated_at = now()
        FROM (
          SELECT product_id, store_id, SUM(quantity)::int AS delta FROM stock_movements
          WHERE ref_code = ANY(${codes}) GROUP BY product_id, store_id
        ) m
        WHERE ps.product_id = m.product_id AND ps.store_id = m.store_id`;
      await tx.$executeRaw`DELETE FROM stock_movements WHERE ref_code = ANY(${codes})`;

      const touched = await tx.$queryRaw<{ customer_id: string }[]>`
        SELECT DISTINCT customer_id FROM point_logs WHERE ref_code = ANY(${codes})`;
      const affected = [...new Set([...customerIds, ...touched.map((r) => r.customer_id)])];
      await tx.$executeRaw`DELETE FROM point_logs WHERE ref_code = ANY(${codes})`;

      const promos = await tx.$queryRaw<{ promotion_id: string }[]>`
        SELECT DISTINCT promotion_id FROM promotion_redemptions WHERE order_id = ANY(${orderIds}::uuid[])`;
      await tx.$executeRaw`DELETE FROM promotion_redemptions WHERE order_id = ANY(${orderIds}::uuid[])`;
      await tx.$executeRaw`
        UPDATE promotions p SET used_count = (
          SELECT count(*) FROM promotion_redemptions r WHERE r.promotion_id = p.id AND r.revoked_at IS NULL
        ), updated_at = now()
        WHERE p.id = ANY(${promos.map((p) => p.promotion_id)}::uuid[])`;

      await tx.$executeRaw`
        DELETE FROM idempotency_keys
        WHERE scope LIKE 'order.%' AND resource_id = ANY(${[...orderIds, ...returnIds]}::uuid[])`;
      await tx.returnReceipt.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });

      if (affected.length) {
        await tx.$executeRaw`
          UPDATE customers c SET
            points = COALESCE((SELECT SUM(l.points) FROM point_logs l WHERE l.customer_id = c.id), 0),
            spent = COALESCE((
              SELECT SUM(o.total - o.points_discount) FROM orders o
              WHERE o.customer_id = c.id AND o.status IN ('completed', 'partially_refunded', 'refunded')
            ), 0) - COALESCE((
              SELECT SUM(r.cash_refund) FROM return_receipts r JOIN orders o ON o.id = r.order_id
              WHERE o.customer_id = c.id
            ), 0),
            order_count = (
              SELECT count(*) FROM orders o
              WHERE o.customer_id = c.id AND o.status IN ('completed', 'partially_refunded')
            ),
            first_order_at = (
              SELECT min(o.created_at) FROM orders o
              WHERE o.customer_id = c.id AND o.status IN ('completed', 'partially_refunded', 'refunded')
            ),
            last_order_at = (
              SELECT max(o.created_at) FROM orders o
              WHERE o.customer_id = c.id AND o.status IN ('completed', 'partially_refunded', 'refunded')
            ),
            updated_at = now()
          WHERE c.id = ANY(${affected}::uuid[])`;
        await tx.$executeRaw`
          UPDATE customers c SET tier = COALESCE((
            SELECT t.tier FROM membership_tiers t
            WHERE t.min_spent <= c.legacy_spent + c.spent ORDER BY t.min_spent DESC LIMIT 1
          ), 'retail')
          WHERE c.id = ANY(${affected}::uuid[])`;
      }
      console.log(
        `Đã hoàn tồn kho cho ${stock} dòng sản phẩm, cập nhật ${affected.length} khách, ${promos.length} voucher.`,
      );
    },
    { timeout: 60_000 },
  );
  console.log(`Xong: đã xóa ${orders.length} đơn và ${returnIds.length} phiếu trả.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
