import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DEFAULT_MEMBERSHIP } from '../src/modules/customers/membership.rules';
import { MembershipService } from '../src/modules/customers/membership.service';
import { PointLedger } from '../src/modules/customers/point-ledger.service';
import { createTestApp, TestClient, TestData } from './support';

interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  tier: string;
  points: number;
  status: string;
  legacySpent: number;
  totalSpent: number;
  nextTier: { tier: string; remaining: number; progress: number } | null;
}

let app: NestFastifyApplication;
let data: TestData;
let admin: TestClient;
let manager: TestClient;
let cashier: TestClient;
let adminId = '';
let phoneSeq = 5000;

const phone = () => data.phone((phoneSeq += 1));
const name = (label: string) => `${data.run} ${label}`;
const vnMonth = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(5, 7);

const signIn = async (role: 'admin' | 'manager' | 'cashier') => {
  const user = await data.user(role);
  const client = new TestClient(app);
  await client.login(user.username);
  return { user, client };
};

const create = async (client: TestClient, fields: Record<string, unknown> = {}) => {
  const res = await client.call('post', '/customers', {
    name: name('Khách'),
    phone: phone(),
    ...fields,
  });
  expect(res.status).toBe(201);
  return res.body as Customer;
};

const adjust = (id: string, body: Record<string, unknown>, headers?: Record<string, string>) =>
  manager.call(
    'post',
    `/customers/${id}/points`,
    { type: 'adjust', reason: 'Tặng điểm', ...body },
    { headers },
  );

const putMembership = (
  client: TestClient,
  patch: (tiers: typeof DEFAULT_MEMBERSHIP.tiers) => void = () => {},
) => {
  const body = structuredClone(DEFAULT_MEMBERSHIP);
  patch(body.tiers);
  return client.call('put', '/membership', body);
};

beforeAll(async () => {
  app = await createTestApp();
  data = TestData.for(app);
  const signed = await signIn('admin');
  admin = signed.client;
  adminId = signed.user.id;
  manager = (await signIn('manager')).client;
  cashier = (await signIn('cashier')).client;
  await putMembership(admin);
});

afterAll(async () => {
  if (admin) await putMembership(admin);
  await data?.cleanup();
  await app?.close();
});

describe('Quyền', () => {
  it('cashier chỉ dùng được search/lookup/tạo nhanh/membership', async () => {
    expect((await cashier.call('get', '/customers')).status).toBe(403);
    expect((await cashier.call('get', '/customers/stats')).status).toBe(403);
    expect((await cashier.call('get', '/customers/search?q=a')).status).toBe(200);
    expect((await cashier.call('get', '/membership')).status).toBe(200);
    expect((await putMembership(cashier)).status).toBe(403);
    expect((await putMembership(manager)).status).toBe(403);
  });
});

describe('Tạo / sửa / khóa / xóa', () => {
  it('chuẩn hóa SĐT, sinh mã, trùng SĐT trả customerId', async () => {
    const digits = phone();
    const customer = await create(manager, {
      phone: `+84 ${digits.slice(1, 4)} ${digits.slice(4)}`,
      email: ' A@Mail.VN ',
      gender: '',
    });
    expect(customer).toMatchObject({ phone: digits, tier: 'retail', points: 0, status: 'active' });
    expect(customer.code).toMatch(/^KH\d{6}$/);
    expect(customer.nextTier).toMatchObject({ tier: 'silver', remaining: 1_000_000, progress: 0 });
    const detail = await manager.call('get', `/customers/${customer.id}`);
    expect(detail.body).toMatchObject({ email: 'a@mail.vn', gender: null });

    const dup = await manager.call('post', '/customers', {
      name: name('Trùng'),
      phone: `84${digits.slice(1)}`,
    });
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({
      code: 'CUSTOMER_PHONE_TAKEN',
      details: { customerId: customer.id },
    });

    expect((await manager.call('post', '/customers', { name: 'A', phone: phone() })).status).toBe(
      400,
    );
    expect(
      (await manager.call('post', '/customers', { name: name('X'), phone: '12345' })).status,
    ).toBe(400);
    expect(
      (
        await manager.call('post', '/customers', {
          name: name('X'),
          phone: phone(),
          birthday: '2999-01-01',
        })
      ).status,
    ).toBe(400);
  });

  it('chỉ admin set legacySpent / openingPoints; cashier tạo nhanh', async () => {
    expect(
      (
        await manager.call('post', '/customers', {
          name: name('M'),
          phone: phone(),
          legacySpent: 1,
        })
      ).status,
    ).toBe(403);
    const vip = await create(admin, { legacySpent: 3_500_000, openingPoints: 50 });
    expect(vip).toMatchObject({
      tier: 'gold',
      points: 50,
      legacySpent: 3_500_000,
      totalSpent: 3_500_000,
    });
    const logs = await manager.call('get', `/customers/${vip.id}/points`);
    expect(logs.body.items).toMatchObject([{ type: 'opening', points: 50, balance: 50 }]);

    const quick = await cashier.call('post', '/customers', {
      name: name('Tạo nhanh'),
      phone: phone(),
      status: 'blocked',
      legacySpent: 9_000_000,
      note: 'bỏ qua',
    });
    expect(quick.status).toBe(201);
    expect(Object.keys(quick.body).sort()).toEqual([
      'code',
      'id',
      'name',
      'phone',
      'points',
      'status',
      'tier',
    ]);
    expect(quick.body).toMatchObject({ status: 'active', tier: 'retail' });
    const stored = await data.prisma.customer.findUniqueOrThrow({ where: { id: quick.body.id } });
    expect(Number(stored.legacySpent)).toBe(0);
    expect(stored.note).toBeNull();
  });

  it('sửa, đổi legacySpent tính lại hạng, khóa, xóa', async () => {
    const customer = await create(admin);
    const updated = await manager.call('patch', `/customers/${customer.id}`, {
      name: name('Đã Sửa'),
      birthday: '1990-05-01',
      address: '',
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      name: name('Đã Sửa'),
      birthday: '1990-05-01',
      address: null,
    });
    expect(
      (await manager.call('patch', `/customers/${customer.id}`, { legacySpent: 1 })).status,
    ).toBe(403);
    const vip = await admin.call('patch', `/customers/${customer.id}`, { legacySpent: 8_000_000 });
    expect(vip.body).toMatchObject({ tier: 'diamond', nextTier: null });

    const blocked = await manager.call('patch', `/customers/${customer.id}/status`, {
      status: 'blocked',
      reason: 'Test',
    });
    expect(blocked.body.status).toBe('blocked');

    const removable = await create(admin, { openingPoints: 10 });
    expect((await manager.call('delete', `/customers/${removable.id}`)).status).toBe(204);
    expect((await manager.call('get', `/customers/${removable.id}`)).status).toBe(404);
  });
});

describe('Danh sách', () => {
  it('keyword không dấu, SĐT ≥ 3 số, hạng, phân khúc, sắp theo tên gọi, tierCounts', async () => {
    const tag = `${data.run}grp`;
    const tuyet = await create(admin, {
      name: `${tag} Lê Thị Ánh Tuyết`,
      birthday: `1990-${vnMonth()}-01`,
      legacySpent: 1_500_000,
    });
    const an = await create(admin, { name: `${tag} Trần Văn An` });
    const chau = await create(admin, { name: `${tag} Phạm Bảo Châu` });
    await manager.call('patch', `/customers/${chau.id}/status`, { status: 'blocked' });
    const list = (query: string) =>
      manager.call('get', `/customers?keyword=${encodeURIComponent(tag)}&${query}`);

    const byName = await list('sort=name');
    expect(byName.status).toBe(200);
    expect(byName.body.items.map((c: Customer) => c.id)).toEqual([an.id, chau.id, tuyet.id]);
    expect(byName.body.tierCounts).toMatchObject({
      all: 3,
      retail: 2,
      silver: 1,
      gold: 0,
      diamond: 0,
    });

    const silver = await list('tier=silver');
    expect(silver.body).toMatchObject({ total: 1, tierCounts: { all: 3 } });

    expect((await list('segment=birthday')).body.total).toBe(1);
    expect((await list('segment=new30')).body.total).toBe(3);
    expect((await list('segment=blocked')).body.items.map((c: Customer) => c.id)).toEqual([
      chau.id,
    ]);
    expect((await list('sort=spent')).body.items[0].id).toBe(tuyet.id);

    const accentless = await manager.call(
      'get',
      `/customers?keyword=${encodeURIComponent(`${tag} le thi anh`)}`,
    );
    expect(accentless.body.items.map((c: Customer) => c.id)).toEqual([tuyet.id]);
    const byPhone = await manager.call('get', `/customers?keyword=${an.phone.slice(-7)}`);
    expect(byPhone.body.items.map((c: Customer) => c.id)).toEqual([an.id]);
    const byCode = await manager.call('get', `/customers?keyword=${an.code.toLowerCase()}`);
    expect(byCode.body.items.map((c: Customer) => c.id)).toEqual([an.id]);

    const stats = await manager.call('get', '/customers/stats');
    expect(stats.body).toMatchObject({ returning: 0 });
    expect(stats.body.new30).toBeGreaterThanOrEqual(3);
  });

  it('search / lookup chỉ trả khách active', async () => {
    const active = await create(manager, { name: name('Tìm Kiếm') });
    const blocked = await create(manager, { name: name('Tìm Kiếm Khóa') });
    await manager.call('patch', `/customers/${blocked.id}/status`, { status: 'blocked' });

    const found = await cashier.call(
      'get',
      `/customers/search?q=${encodeURIComponent(name('tim kiem'))}`,
    );
    expect(found.body.map((c: Customer) => c.id)).toEqual([active.id]);
    const exact = await cashier.call('get', `/customers/search?q=${active.phone}`);
    expect(exact.body[0].id).toBe(active.id);

    expect((await cashier.call('get', `/customers/lookup?phone=${active.phone}`)).body.id).toBe(
      active.id,
    );
    expect(
      (await cashier.call('get', `/customers/lookup?code=${active.code.toLowerCase()}`)).body.id,
    ).toBe(active.id);
    expect((await cashier.call('get', `/customers/lookup?phone=${blocked.phone}`)).body.code).toBe(
      'CUSTOMER_BLOCKED',
    );
    expect((await cashier.call('get', `/customers/lookup?phone=${phone()}`)).status).toBe(404);
  });
});

describe('Điểm', () => {
  it('cộng / trừ / đổi điểm, idempotency, đồng thời, khóa', async () => {
    const customer = await create(admin, { openingPoints: 100 });
    const added = await adjust(customer.id, { points: 50 });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      customer: { points: 150 },
      log: { type: 'adjust', points: 50, balance: 150 },
    });

    const redeemed = await adjust(customer.id, {
      points: 30,
      type: 'redeem',
      reason: 'Đổi quà tại quầy',
    });
    expect(redeemed.body.log).toMatchObject({ type: 'redeem', points: -30, balance: 120 });

    const tooMuch = await adjust(customer.id, { points: -500 });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body).toMatchObject({
      code: 'CUSTOMER_POINTS_INSUFFICIENT',
      details: { points: 120 },
    });
    expect((await adjust(customer.id, { points: 0 })).status).toBe(400);

    const key = `e2e-${randomUUID()}`;
    const first = await adjust(customer.id, { points: 10 }, { 'Idempotency-Key': key });
    const replay = await adjust(customer.id, { points: 10 }, { 'Idempotency-Key': key });
    expect(replay.body.log.id).toBe(first.body.log.id);
    expect(replay.body.customer.points).toBe(130);

    const results = await Promise.all([
      adjust(customer.id, { points: -70 }),
      manager
        .clone()
        .call('post', `/customers/${customer.id}/points`, {
          type: 'redeem',
          points: 70,
          reason: 'Đổi quà',
        }),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect((await manager.call('get', `/customers/${customer.id}`)).body.points).toBe(60);

    const logs = await manager.call('get', `/customers/${customer.id}/points?pageSize=2`);
    expect(logs.body).toMatchObject({ total: 5, pageSize: 2 });
    expect(logs.body.items[0].balance).toBe(60);
    expect(
      (await manager.call('get', `/customers/${customer.id}/points?type=redeem`)).body.total,
    ).toBeGreaterThanOrEqual(1);

    const del = await manager.call('delete', `/customers/${customer.id}`);
    expect(del.status).toBe(409);
    expect(del.body).toMatchObject({ code: 'CUSTOMER_HAS_TRANSACTIONS', details: { orders: 0 } });

    await manager.call('patch', `/customers/${customer.id}/status`, { status: 'blocked' });
    expect((await adjust(customer.id, { points: 5 })).body.code).toBe('CUSTOMER_BLOCKED');
  });
});

describe('Cấu hình thành viên', () => {
  it('validate và tính lại hạng toàn bộ khách', async () => {
    const invalid = await putMembership(admin, (tiers) => {
      tiers[1].minSpent = 0;
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      code: 'MEMBERSHIP_INVALID',
      details: { field: 'minSpent', tier: 'silver' },
    });
    expect(
      (
        await putMembership(admin, (tiers) => {
          tiers[2].discountPercent = 3.333;
        })
      ).body.details,
    ).toMatchObject({ field: 'discountPercent', tier: 'gold' });

    const customer = await create(admin, { legacySpent: 600_000 });
    expect(customer.tier).toBe('retail');
    const changed = await putMembership(admin, (tiers) => {
      tiers[1].minSpent = 500_000;
    });
    expect(changed.status).toBe(200);
    expect(changed.body.settings.tiers[1]).toMatchObject({
      minSpent: 500_000,
      pointMultiplier: 1.2,
    });
    expect(changed.body.changedTiers).toBeGreaterThanOrEqual(1);
    expect((await manager.call('get', `/customers/${customer.id}`)).body.tier).toBe('silver');
    expect((await cashier.call('get', '/membership')).body.tiers[1].minSpent).toBe(500_000);

    const restored = await putMembership(admin);
    expect(restored.body.changedTiers).toBeGreaterThanOrEqual(1);
    expect((await manager.call('get', `/customers/${customer.id}`)).body.tier).toBe('retail');
  });
});

describe('MembershipService (cho module Đơn hàng)', () => {
  it('applyOrder tính theo hạng trước, revokeOrder không làm âm điểm', async () => {
    const membership = app.get(MembershipService);
    const customer = await create(admin, { legacySpent: 900_000 });
    const order = (code: string, total: number) =>
      data.prisma.$transaction((tx) =>
        membership.applyOrder(tx, {
          customerId: customer.id,
          orderTotal: total,
          orderCode: code,
          userId: adminId,
        }),
      );

    const first = await order('HD-1', 200_000);
    expect(first).toEqual({ earned: 20, tierBefore: 'retail', tierAfter: 'silver' });
    const second = await order('HD-2', 100_000);
    expect(second).toMatchObject({ earned: 12, tierBefore: 'silver' });

    const detail = (await manager.call('get', `/customers/${customer.id}`)).body;
    expect(detail).toMatchObject({
      points: 32,
      totalSpent: 1_200_000,
      stats: { spent: 300_000, orders: 2, avgOrder: 150_000 },
    });
    expect(detail.stats.lastOrderAt).not.toBeNull();

    await data.prisma.$transaction((tx) =>
      app
        .get(PointLedger)
        .apply(tx, { customerId: customer.id, type: 'adjust', points: -30, userId: adminId }),
    );
    const revoked = await data.prisma.$transaction((tx) =>
      membership.revokeOrder(tx, {
        customerId: customer.id,
        orderTotal: 200_000,
        earnedPoints: 20,
        orderCode: 'HD-1',
        userId: adminId,
      }),
    );
    expect(revoked).toEqual({ revoked: 2, tierBefore: 'silver', tierAfter: 'silver' });
    const after = (await manager.call('get', `/customers/${customer.id}`)).body;
    expect(after).toMatchObject({
      points: 0,
      stats: { spent: 100_000, orders: 1 },
      tier: 'silver',
    });

    expect(await membership.discountFor({ tier: 'silver', status: 'active' })).toBe(2);
    expect(await membership.discountFor({ tier: 'silver', status: 'blocked' })).toBe(0);
  });
});
