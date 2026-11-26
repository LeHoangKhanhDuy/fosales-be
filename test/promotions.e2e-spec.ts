import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { type RedeemInput, VoucherService } from '../src/modules/promotions/voucher.service';
import { createTestApp, TestClient, TestData } from './support';

interface Promotion {
  id: string;
  code: string;
  status: string;
  state: string;
  usedCount: number;
  usage: { count: number; discount: number };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let app: NestFastifyApplication;
let data: TestData;
let admin: TestClient;
let manager: TestClient;
let cashier: TestClient;
let adminId = '';
let catA = '';
let catB = '';
let productA = '';
let productB = '';
let customerId = '';
let blockedId = '';

const newCode = () => `T${randomUUID().replace(/-/g, '').slice(0, 11).toUpperCase()}`;

const signIn = async (role: 'admin' | 'manager' | 'cashier') => {
  const user = await data.user(role);
  const client = new TestClient(app);
  await client.login(user.username);
  return { user, client };
};

const create = async (fields: Record<string, unknown> = {}) => {
  const res = await manager.call('post', '/promotions', {
    code: newCode(),
    name: `${data.run} Voucher`,
    discountType: 'percent',
    discountValue: 10,
    startAt: new Date(Date.now() - HOUR).toISOString(),
    endAt: new Date(Date.now() + 7 * DAY).toISOString(),
    activate: true,
    ...fields,
  });
  expect(res.status).toBe(201);
  return res.body as Promotion;
};

const line = (
  productId: string,
  categoryId: string,
  price: number,
  quantity = 1,
  discount = 0,
) => ({
  productId,
  categoryId,
  price,
  quantity,
  discount,
});

const redeem = (code: string, input: Partial<RedeemInput> = {}) =>
  data.prisma.$transaction((tx) =>
    app.get(VoucherService).redeem(tx, {
      code,
      orderId: randomUUID(),
      orderCode: `HD-${randomUUID().slice(0, 8)}`,
      lines: [line(productA, catA, 100_000)],
      subtotalAfterItems: 100_000,
      userId: adminId,
      ...input,
    }),
  );

const validate = (code: string, customer?: string, client = manager) =>
  client.call('post', '/promotions/vouchers/validate', { code, customerId: customer });

beforeAll(async () => {
  app = await createTestApp();
  data = TestData.for(app);
  const signed = await signIn('admin');
  admin = signed.client;
  adminId = signed.user.id;
  manager = (await signIn('manager')).client;
  cashier = (await signIn('cashier')).client;
  const a = await data.catalog();
  const b = await data.catalog();
  catA = a.category.id;
  catB = b.category.id;
  productA = (await data.product(catA, a.unit.id)).id;
  productB = (await data.product(catB, b.unit.id)).id;
  const phone = (n: number) => data.phone(7000 + n);
  customerId = (
    await manager.call('post', '/customers', { name: `${data.run} Khách VIP`, phone: phone(1) })
  ).body.id;
  blockedId = (
    await manager.call('post', '/customers', { name: `${data.run} Khách khóa`, phone: phone(2) })
  ).body.id;
  await manager.call('patch', `/customers/${blockedId}/status`, { status: 'blocked' });
});

afterAll(async () => {
  await data?.cleanup();
  await app?.close();
});

describe('Quyền', () => {
  it('cashier chỉ gọi được validate', async () => {
    expect((await cashier.call('get', '/promotions')).status).toBe(403);
    expect((await cashier.call('post', '/promotions', {})).status).toBe(403);
    expect((await cashier.call('get', '/promotions/generate-code')).status).toBe(403);
    expect((await validate(newCode(), undefined, cashier)).status).toBe(404);
  });
});

describe('Tạo / sửa / trạng thái / xóa', () => {
  it('tạo, trùng mã, validate dữ liệu', async () => {
    const code = newCode();
    const voucher = await create({
      code: ` ${code.toLowerCase()} `,
      maxDiscount: 50_000,
      minOrder: 100_000,
    });
    expect(voucher).toMatchObject({
      code,
      state: 'active',
      status: 'running',
      usedCount: 0,
      usage: { count: 0 },
    });
    const dup = await manager.call('post', '/promotions', {
      code,
      name: 'Trùng',
      discountType: 'amount',
      discountValue: 5000,
      startAt: new Date().toISOString(),
    });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('PROMOTION_CODE_TAKEN');

    const draft = await create({ activate: false });
    expect(draft).toMatchObject({ state: 'draft', status: 'draft' });

    const bad = async (fields: Record<string, unknown>) =>
      manager.call('post', '/promotions', {
        code: newCode(),
        name: `${data.run} Sai`,
        discountType: 'percent',
        discountValue: 10,
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + DAY).toISOString(),
        ...fields,
      });
    expect((await bad({ scope: { type: 'categories', categoryIds: [] } })).body.code).toBe(
      'PROMOTION_SCOPE_INVALID',
    );
    expect((await bad({ scope: { type: 'products', productIds: [randomUUID()] } })).body.code).toBe(
      'PROMOTION_SCOPE_INVALID',
    );
    expect((await bad({ discountValue: 150 })).status).toBe(400);
    expect((await bad({ discountType: 'amount', discountValue: 500 })).status).toBe(400);
    expect((await bad({ endAt: new Date(Date.now() - DAY).toISOString() })).status).toBe(400);
    expect((await bad({ usageLimit: 1, perCustomerLimit: 2 })).status).toBe(400);
    expect((await bad({ code: 'AB' })).status).toBe(400);
    expect((await bad({ kind: 'order' })).status).toBe(400);
  });

  it('sửa, đổi trạng thái, danh sách, gợi ý mã, xóa', async () => {
    const voucher = await create({ name: `${data.run} Khuyến mãi Mùa Đông` });
    const renamed = await manager.call('patch', `/promotions/${voucher.id}`, {
      name: `${data.run} Ưu đãi Mùa Đông`,
      usageLimit: 50,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ usageLimit: 50 });

    const paused = await manager.call('patch', `/promotions/${voucher.id}/state`, {
      state: 'paused',
    });
    expect(paused.body).toMatchObject({ state: 'paused', status: 'paused' });
    const resumed = await manager.call('patch', `/promotions/${voucher.id}/state`, {
      state: 'active',
    });
    expect(resumed.body.status).toBe('running');

    const scheduled = await create({ startAt: new Date(Date.now() + 2 * DAY).toISOString() });
    expect(scheduled.status).toBe('scheduled');

    const list = await manager.call(
      'get',
      `/promotions?kind=voucher&keyword=${encodeURIComponent(`${data.run} uu dai mua dong`)}`,
    );
    expect(list.status).toBe(200);
    expect(list.body.items.map((p: Promotion) => p.id)).toEqual([voucher.id]);
    const running = await manager.call('get', `/promotions?keyword=${data.run}&status=running`);
    expect(running.body.statusCounts.scheduled).toBeGreaterThanOrEqual(1);
    expect(running.body.items.every((p: Promotion) => p.status === 'running')).toBe(true);

    const generated = await manager.call('get', '/promotions/generate-code?prefix=fotech');
    expect(generated.body.code).toMatch(/^FOTECH[A-HJ-NP-Z2-9]{6}$/);

    expect((await manager.call('delete', `/promotions/${scheduled.id}`)).status).toBe(204);
    expect((await manager.call('get', `/promotions/${scheduled.id}`)).status).toBe(404);
  });

  it('khóa field khi đã có lượt dùng, không xóa được, không kích hoạt lại khi hết lượt', async () => {
    const voucher = await create({ discountType: 'amount', discountValue: 10_000, usageLimit: 1 });
    await redeem(voucher.code);
    const locked = await manager.call('patch', `/promotions/${voucher.id}`, {
      discountValue: 20_000,
      name: `${data.run} Đổi`,
    });
    expect(locked.status).toBe(409);
    expect(locked.body).toMatchObject({
      code: 'PROMOTION_LOCKED_FIELDS',
      details: { fields: ['discountValue'] },
    });
    expect(
      (await manager.call('patch', `/promotions/${voucher.id}`, { name: `${data.run} Đổi tên` }))
        .status,
    ).toBe(200);
    expect((await manager.call('delete', `/promotions/${voucher.id}`)).body.code).toBe(
      'PROMOTION_IN_USE',
    );

    const detail = await manager.call('get', `/promotions/${voucher.id}`);
    expect(detail.body).toMatchObject({
      status: 'ended',
      usedCount: 1,
      usage: { count: 1, discount: 10_000 },
    });
    await manager.call('patch', `/promotions/${voucher.id}/state`, { state: 'ended' });
    const reopen = await manager.call('patch', `/promotions/${voucher.id}/state`, {
      state: 'active',
    });
    expect(reopen.status).toBe(409);
    expect(reopen.body.code).toBe('PROMOTION_INVALID_STATE');
  });
});

describe('Kiểm tra mã ở POS', () => {
  it('đủ các lỗi theo thứ tự, không phân biệt hoa/thường', async () => {
    expect((await validate(newCode())).body.code).toBe('VOUCHER_NOT_FOUND');
    const draft = await create({ activate: false });
    expect((await validate(draft.code)).body).toMatchObject({
      code: 'VOUCHER_NOT_FOUND',
      message: 'Mã giảm giá không tồn tại',
    });

    const scheduled = await create({ startAt: new Date(Date.now() + 3 * DAY).toISOString() });
    const notStarted = await validate(scheduled.code);
    expect(notStarted.status).toBe(409);
    expect(notStarted.body.code).toBe('VOUCHER_NOT_STARTED');
    expect(notStarted.body.message).toMatch(/^Mã áp dụng từ \d{2}\/\d{2}\/\d{4}$/);

    const paused = await create();
    await manager.call('patch', `/promotions/${paused.id}/state`, { state: 'paused' });
    expect((await validate(paused.code)).body.code).toBe('VOUCHER_PAUSED');

    const usedUp = await create({ usageLimit: 1 });
    await redeem(usedUp.code);
    expect((await validate(usedUp.code)).body.code).toBe('VOUCHER_USED_UP');

    const expired = await create();
    await data.prisma.promotion.update({
      where: { id: expired.id },
      data: { endAt: new Date(Date.now() - HOUR) },
    });
    expect((await validate(expired.code)).body).toMatchObject({
      code: 'VOUCHER_EXPIRED',
      message: 'Mã giảm giá đã hết hạn',
    });

    const member = await create({ perCustomerLimit: 1 });
    expect((await validate(member.code)).body.code).toBe('VOUCHER_MEMBER_ONLY');
    expect((await validate(member.code, blockedId)).body.code).toBe('CUSTOMER_BLOCKED');
    await redeem(member.code, { customerId });
    const limit = await validate(member.code, customerId);
    expect(limit.body).toMatchObject({ code: 'VOUCHER_CUSTOMER_LIMIT', details: { limit: 1 } });

    const ok = await create({
      maxDiscount: 30_000,
      minOrder: 200_000,
      scope: { type: 'categories', categoryIds: [catA] },
    });
    const res = await validate(`  ${ok.code.toLowerCase()} `, undefined, cashier);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ok.id,
      code: ok.code,
      type: 'percent',
      value: 10,
      maxDiscount: 30_000,
      minOrder: 200_000,
      scope: { type: 'categories', categoryIds: [catA], productIds: [] },
      stackable: true,
    });
  });

  it('giới hạn 20 lần/phút/người dùng', async () => {
    const user = (await signIn('cashier')).client;
    for (let i = 0; i < 20; i += 1)
      expect((await validate(newCode(), undefined, user)).status).toBe(404);
    const blocked = await validate(newCode(), undefined, user);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.body.retryAfter).toBeGreaterThan(0);
  });
});

describe('VoucherService.redeem / revoke', () => {
  it('tính tiền giống priceCart', async () => {
    const percent = await create({ discountValue: 10, maxDiscount: 5_000 });
    expect((await redeem(percent.code)).discount).toBe(5_000);

    const rounding = await create({ discountValue: 15 });
    const rounded = await redeem(rounding.code, {
      lines: [line(productA, catA, 33_333)],
      subtotalAfterItems: 33_333,
    });
    expect(rounded.discount).toBe(5_000);

    const amount = await create({ discountType: 'amount', discountValue: 20_000 });
    const small = await redeem(amount.code, {
      lines: [line(productA, catA, 15_000)],
      subtotalAfterItems: 15_000,
    });
    expect(small.discount).toBe(15_000);

    const scoped = await create({ scope: { type: 'categories', categoryIds: [catA] } });
    const mixed = await redeem(scoped.code, {
      lines: [line(productA, catA, 60_000, 1, 10_000), line(productB, catB, 80_000)],
      subtotalAfterItems: 130_000,
    });
    expect(mixed.discount).toBe(5_000);
    await expect(
      redeem(scoped.code, { lines: [line(productB, catB, 80_000)], subtotalAfterItems: 80_000 }),
    ).rejects.toMatchObject({ body: { code: 'VOUCHER_SCOPE_MISMATCH' } });

    const minOrder = await create({ minOrder: 100_000 });
    await expect(
      redeem(minOrder.code, { lines: [line(productA, catA, 80_000)], subtotalAfterItems: 80_000 }),
    ).rejects.toMatchObject({ body: { code: 'VOUCHER_MIN_ORDER', details: { missing: 20_000 } } });

    const solo = await create({ stackable: false });
    await expect(
      redeem(solo.code, { orderPromo: { name: 'Đơn từ 100k', amount: 15_000 } }),
    ).rejects.toMatchObject({
      body: { code: 'VOUCHER_NOT_STACKABLE' },
    });
    const better = await redeem(solo.code, { orderPromo: { name: 'Đơn từ 100k', amount: 5_000 } });
    expect(better).toMatchObject({ discount: 10_000, dropOrderPromo: true, revenue: 90_000 });

    const capped = await create({ discountType: 'amount', discountValue: 50_000 });
    const cap = await redeem(capped.code, {
      lines: [line(productA, catA, 60_000)],
      subtotalAfterItems: 60_000,
      orderPromo: { name: 'KM đơn', amount: 5_000 },
      memberDiscount: 10_000,
    });
    expect(cap).toMatchObject({ discount: 45_000, dropOrderPromo: false, revenue: 0 });
  });

  it('2 đơn đồng thời khi còn 1 lượt chỉ 1 thành công, revoke trả lượt', async () => {
    const voucher = await create({ usageLimit: 1 });
    const results = await Promise.allSettled([redeem(voucher.code), redeem(voucher.code)]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')!;
    expect(rejected.reason).toMatchObject({ body: { code: 'VOUCHER_USED_UP' } });

    const won = results.find((r) => r.status === 'fulfilled')!;
    const redemption = await data.prisma.promotionRedemption.findFirstOrThrow({
      where: { promotionId: voucher.id },
    });
    expect(won.status).toBe('fulfilled');
    const revoked = await data.prisma.$transaction((tx) =>
      app.get(VoucherService).revoke(tx, { orderId: redemption.orderId }),
    );
    expect(revoked.revoked).toBe(true);
    const detail = await manager.call('get', `/promotions/${voucher.id}`);
    expect(detail.body).toMatchObject({ usedCount: 0, status: 'running', usage: { count: 0 } });
    expect((await validate(voucher.code, undefined, admin)).status).toBe(200);
    const history = await manager.call('get', `/promotions/${voucher.id}/redemptions`);
    expect(history.body.total).toBe(1);
    expect(history.body.items[0].revokedAt).not.toBeNull();
  });
});
