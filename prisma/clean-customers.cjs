require('dotenv/config');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const apply = args.length === 1 && args[0] === '--confirm-delete-customers-and-orders';
  if (args.length && !apply) throw new Error('Tham số không hợp lệ.');

  await prisma.$transaction(async (tx) => {
    if (apply) {
      await tx.$executeRaw`LOCK TABLE customers, orders, order_lines, order_payments, order_promotions,
        return_receipts, return_lines, point_logs, promotions, promotion_redemptions
        IN SHARE ROW EXCLUSIVE MODE NOWAIT`;
    }
    const linked = { customerId: { not: null } };
    const related = { order: linked };
    const redemptions = await tx.$queryRaw`
      SELECT r.id, r.promotion_id, r.revoked_at FROM promotion_redemptions r
      WHERE r.customer_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM orders o WHERE o.id = r.order_id AND o.customer_id IS NOT NULL
      )`;
    const report = {
      customers: await tx.customer.count(),
      pointLogs: await tx.pointLog.count(),
      orders: await tx.order.count({ where: linked }),
      orderLines: await tx.orderLine.count({ where: related }),
      payments: await tx.orderPayment.count({ where: related }),
      orderPromotions: await tx.orderPromotion.count({ where: related }),
      returns: await tx.returnReceipt.count({ where: related }),
      returnLines: await tx.returnLine.count({ where: { receipt: related } }),
      redemptions: redemptions.length,
    };
    console.table(report);
    if (!apply) return;

    await tx.$executeRaw`
      WITH removed AS (
        DELETE FROM promotion_redemptions r WHERE r.customer_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM orders o WHERE o.id = r.order_id AND o.customer_id IS NOT NULL
        ) RETURNING promotion_id, revoked_at
      ), usage AS (
        SELECT promotion_id, count(*)::int AS n FROM removed WHERE revoked_at IS NULL GROUP BY promotion_id
      )
      UPDATE promotions p SET used_count = greatest(0, p.used_count - usage.n), updated_at = now()
      FROM usage WHERE p.id = usage.promotion_id`;
    await tx.returnReceipt.deleteMany({ where: related });
    await tx.order.deleteMany({ where: linked });
    await tx.pointLog.deleteMany();
    await tx.customer.deleteMany();
    if (await tx.customer.count() || await tx.pointLog.count()) throw new Error('Kiểm tra sau xóa thất bại.');
  }, { isolationLevel: 'RepeatableRead', timeout: 60000 });
  if (apply) console.log('Đã xóa. Khách hàng và bút toán điểm còn 0.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
