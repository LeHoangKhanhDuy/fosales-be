import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import type { CreatePromotionDto } from '../src/modules/promotions/dto/promotion.dto';
import { PromotionCommandsService } from '../src/modules/promotions/promotion-commands.service';
import { PromotionsService } from '../src/modules/promotions/promotions.service';
import { VoucherRateLimit } from '../src/modules/promotions/voucher-rate-limit';
import { VoucherService } from '../src/modules/promotions/voucher.service';

interface SeedVoucher {
  input: Omit<CreatePromotionDto, 'startAt' | 'endAt' | 'scope'> & { categoryKey?: string };
  start: number;
  end: number;
  created: number;
  state: 'draft' | 'active' | 'paused';
  redeemed?: number;
}

const VOUCHERS: SeedVoucher[] = [
  {
    input: {
      code: 'FOSALE10',
      name: 'Giảm 10% toàn đơn',
      discountType: 'percent',
      discountValue: 10,
      maxDiscount: 50_000,
      minOrder: 100_000,
      usageLimit: 500,
    },
    start: -40,
    end: 38,
    created: -42,
    state: 'active',
  },
  {
    input: {
      code: 'GIAM20K',
      name: 'Giảm 20.000đ',
      discountType: 'amount',
      discountValue: 20_000,
      minOrder: 150_000,
      usageLimit: 300,
    },
    start: -36,
    end: 38,
    created: -37,
    state: 'active',
  },
  {
    input: {
      code: 'KHAITRUONG',
      name: 'Khai trương giảm 15%',
      discountType: 'percent',
      discountValue: 15,
      maxDiscount: 100_000,
      minOrder: 300_000,
      stackable: false,
    },
    start: -33,
    end: 22,
    created: -34,
    state: 'active',
  },
  {
    input: {
      code: 'VIP50K',
      name: 'Ưu đãi khách VIP',
      discountType: 'amount',
      discountValue: 50_000,
      minOrder: 500_000,
      perCustomerLimit: 1,
    },
    start: -30,
    end: 128,
    created: -31,
    state: 'active',
  },
  {
    input: {
      code: 'SUAVIET10',
      name: 'Giảm 10% hàng sữa',
      description: 'Hợp tác cùng Nhà phân phối Sữa Việt',
      discountType: 'percent',
      discountValue: 10,
      maxDiscount: 30_000,
      usageLimit: 200,
      categoryKey: 'dairy',
    },
    start: -12,
    end: 18,
    created: -13,
    state: 'active',
  },
  {
    input: {
      code: 'BLACKFRIDAY',
      name: 'Black Friday giảm 30%',
      discountType: 'percent',
      discountValue: 30,
      maxDiscount: 200_000,
    },
    start: -28,
    end: -22,
    created: -30,
    state: 'active',
  },
  {
    input: {
      code: 'TET2027',
      name: 'Tết 2027 giảm 8%',
      discountType: 'percent',
      discountValue: 8,
      maxDiscount: 80_000,
      minOrder: 200_000,
      usageLimit: 1000,
    },
    start: 40,
    end: 70,
    created: -2,
    state: 'active',
  },
  {
    input: {
      code: 'NOEL2026',
      name: 'Giáng sinh tặng 25.000đ',
      discountType: 'amount',
      discountValue: 25_000,
      minOrder: 250_000,
    },
    start: 25,
    end: 33,
    created: -1,
    state: 'draft',
  },
  {
    input: {
      code: 'FLASH5K',
      name: 'Flash sale giảm 5.000đ',
      discountType: 'amount',
      discountValue: 5_000,
      usageLimit: 3,
    },
    start: -5,
    end: 25,
    created: -6,
    state: 'active',
    redeemed: 3,
  },
  {
    input: {
      code: 'CUOITUAN5',
      name: 'Cuối tuần giảm 5%',
      discountType: 'percent',
      discountValue: 5,
      maxDiscount: 20_000,
    },
    start: -10,
    end: 20,
    created: -11,
    state: 'paused',
  },
];

const CLIENT = { ip: '127.0.0.1', userAgent: 'seed' };
const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

const vnAt = (days: number, time: string) =>
  new Date(
    `${new Date(Date.now() + VN_OFFSET_MS + days * DAY_MS).toISOString().slice(0, 10)}T${time}+07:00`,
  );

export async function seedPromotions(
  prisma: PrismaClient,
  storeId: string,
  adminId: string,
  categories: Map<string, string>,
) {
  if (await prisma.promotion.count({ where: { kind: 'voucher' } })) return 0;
  const db = prisma as unknown as PrismaService;
  const promotions = new PromotionsService(db);
  const commands = new PromotionCommandsService(db, promotions, new AuditService(db));
  const vouchers = new VoucherService(db, new VoucherRateLimit());
  const admin = { id: adminId, role: 'admin' as const, storeId, sid: 'seed' };
  let created = 0;
  for (const seed of VOUCHERS) {
    const { categoryKey, ...input } = seed.input;
    const categoryId = categoryKey ? categories.get(categoryKey) : undefined;
    const promotion = await commands.create(
      admin,
      {
        ...input,
        scope: categoryId ? { type: 'categories', categoryIds: [categoryId] } : { type: 'all' },
        startAt: vnAt(Math.min(seed.start, 0), '00:00:00').toISOString(),
        endAt: vnAt(Math.max(seed.end, 1), '23:59:59').toISOString(),
        activate: seed.state !== 'draft',
      },
      CLIENT,
    );
    for (let n = 1; n <= (seed.redeemed ?? 0); n += 1) {
      await prisma.$transaction((tx) =>
        vouchers.redeem(tx, {
          code: promotion.code,
          orderId: randomUUID(),
          orderCode: `HDSEED-${String(n).padStart(4, '0')}`,
          lines: [
            { productId: randomUUID(), categoryId: null, price: 120_000, quantity: 1, discount: 0 },
          ],
          subtotalAfterItems: 120_000,
          userId: adminId,
        }),
      );
    }
    if (seed.state === 'paused') await commands.setState(admin, promotion.id, 'paused', CLIENT);
    await prisma.promotion.update({
      where: { id: promotion.id },
      data: {
        startAt: vnAt(seed.start, '00:00:00'),
        endAt: vnAt(seed.end, '23:59:59'),
        createdAt: vnAt(seed.created, '09:00:00'),
      },
    });
    created += 1;
  }
  return created;
}
