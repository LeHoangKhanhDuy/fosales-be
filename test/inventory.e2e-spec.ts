import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { StockLedger } from '../src/modules/stock/stock-ledger.service';
import { createTestApp, TestClient, TestData } from './support';

let app: NestFastifyApplication;
let data: TestData;
let manager: TestClient;
let cashier: TestClient;
let managerId = '';
let storeId = '';
let categoryId = '';
let unitId = '';
const ids: Record<'water' | 'cookie' | 'candy' | 'noodle', string> = {
  water: '',
  cookie: '',
  candy: '',
  noodle: '',
};

type Item = {
  id: string;
  name: string;
  stock: number;
  level: string;
  slow: boolean;
  soldLast30: number;
  lastMovementAt: string | null;
};

const signIn = async (role: 'manager' | 'cashier') => {
  const user = await data.user(role);
  const client = new TestClient(app);
  await client.login(user.username);
  return { user, client };
};

const createProduct = async (name: string, costPrice: number, initialStock: number) => {
  const res = await manager.call('post', '/products', {
    name: `${data.run} ${name}`,
    categoryId,
    unitId,
    price: costPrice * 2,
    costPrice,
    initialStock,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
};

const sell = (productId: string, quantity: number, refCode: string) =>
  data.prisma.$transaction((tx) =>
    app
      .get(StockLedger)
      .apply(tx, {
        productId,
        storeId,
        userId: managerId,
        delta: -quantity,
        type: 'sale',
        refCode,
      }),
  );

const list = (query = '') =>
  manager.call('get', `/inventory?categoryId=${categoryId}&pageSize=100&${query}`);
const names = (items: Item[]) => items.map((item) => item.name.replace(`${data.run} `, ''));

beforeAll(async () => {
  app = await createTestApp();
  data = TestData.for(app);
  const signedManager = await signIn('manager');
  manager = signedManager.client;
  managerId = signedManager.user.id;
  storeId = signedManager.user.storeId;
  cashier = (await signIn('cashier')).client;
  ({
    category: { id: categoryId },
    unit: { id: unitId },
  } = await data.catalog());
  ids.water = await createProduct('Nước suối', 4000, 50);
  ids.cookie = await createProduct('Bánh quy', 10000, 5);
  ids.candy = await createProduct('Kẹo dẻo', 3000, 0);
  ids.noodle = await createProduct('Mì gói', 3000, 30);
  await sell(ids.noodle, 5, `HD-${data.run}-1`);
});

afterAll(async () => {
  await data?.cleanup();
  await app?.close();
});

describe('Danh sách tồn kho', () => {
  it('tính mức tồn, bán 30 ngày, tồn lâu và levelCounts', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.levelCounts).toEqual({ all: 4, ok: 2, low: 1, out: 1, slow: 2 });
    const byName = Object.fromEntries(
      (res.body.items as Item[]).map((item) => [item.name.replace(`${data.run} `, ''), item]),
    );
    expect(byName['Mì gói']).toMatchObject({ stock: 25, level: 'ok', soldLast30: 5, slow: false });
    expect(byName['Nước suối']).toMatchObject({
      level: 'ok',
      slow: true,
      stockValue: 200000,
      costPrice: 4000,
    });
    expect(byName['Bánh quy']).toMatchObject({ level: 'low', slow: true });
    expect(byName['Kẹo dẻo']).toMatchObject({ level: 'out', slow: false });
    expect(byName['Mì gói'].lastMovementAt).toEqual(expect.any(String));
  });

  it('lọc mức tồn, tìm không dấu, sắp xếp, phân trang', async () => {
    const slow = await list('level=slow');
    expect(names(slow.body.items).sort()).toEqual(['Bánh quy', 'Nước suối']);
    expect(slow.body.levelCounts.all).toBe(4);
    expect(names((await list('level=low')).body.items)).toEqual(['Bánh quy']);
    expect(names((await list('level=out')).body.items)).toEqual(['Kẹo dẻo']);
    expect(names((await list('keyword=MI%20GOI')).body.items)).toEqual(['Mì gói']);
    expect(names((await list('sort=value-desc')).body.items)).toEqual([
      'Nước suối',
      'Mì gói',
      'Bánh quy',
      'Kẹo dẻo',
    ]);
    expect(names((await list('sort=stock-asc')).body.items)[0]).toBe('Kẹo dẻo');
    expect(names((await list('sort=recent')).body.items)[0]).toBe('Mì gói');

    const page = await manager.call(
      'get',
      `/inventory?categoryId=${categoryId}&pageSize=3&page=2&sort=value-desc`,
    );
    expect(page.body).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(names(page.body.items)).toEqual(['Kẹo dẻo']);
  });

  it('thống kê khớp danh sách toàn cửa hàng', async () => {
    const [stats, all] = await Promise.all([
      manager.call('get', '/inventory/stats'),
      manager.call('get', '/inventory?pageSize=1'),
    ]);
    expect(stats.status).toBe(200);
    expect(stats.body).toMatchObject({
      skuCount: all.body.levelCounts.all,
      low: all.body.levelCounts.low,
      out: all.body.levelCounts.out,
      slow: all.body.levelCounts.slow,
    });
    expect(stats.body.stockValue).toBeGreaterThanOrEqual(200000);
  });
});

describe('Chi tiết và lịch sử', () => {
  it('series đủ số ngày, điểm cuối bằng tồn hiện tại, recent ≤ 8', async () => {
    const res = await manager.call('get', `/inventory/${ids.noodle}?days=7`);
    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(7);
    expect(res.body.series.at(-1).stock).toBe(25);
    expect(res.body.series[0].date < res.body.series.at(-1).date).toBe(true);
    expect(res.body.recent.length).toBeLessThanOrEqual(8);
    expect(res.body.recent[0]).toMatchObject({ type: 'sale', quantity: -5, before: 30, after: 25 });
    expect((await manager.call('get', `/inventory/${randomUUID()}`)).body.code).toBe(
      'INVENTORY_PRODUCT_NOT_FOUND',
    );
    expect((await manager.call('get', `/inventory/${ids.noodle}?days=91`)).status).toBe(400);
  });

  it('lọc movement theo loại, thời gian, chứng từ và tính tổng nhập/xuất', async () => {
    const movements = (query: string) =>
      manager.call('get', `/inventory/movements?productId=${ids.noodle}&${query}`);
    const all = await movements('type=all');
    expect(all.body.total).toBe(2);
    expect(all.body.summary).toEqual({ inQty: 30, outQty: 5 });
    expect((await movements('type=in')).body.items.map((m: { type: string }) => m.type)).toEqual([
      'initial',
    ]);
    expect((await movements('type=out')).body.items.map((m: { type: string }) => m.type)).toEqual([
      'sale',
    ]);
    expect((await movements('type=sale')).body.total).toBe(1);
    expect((await movements('type=import')).body.total).toBe(0);

    const ref = await manager.call('get', `/inventory/movements?keyword=hd-${data.run}-1`);
    expect(ref.body.items).toHaveLength(1);
    expect(ref.body.items[0]).toMatchObject({ refCode: `HD-${data.run}-1`, productId: ids.noodle });

    const hour = 60 * 60 * 1000;
    const from = new Date(Date.now() - hour).toISOString();
    const to = new Date(Date.now() + hour).toISOString();
    expect((await movements(`from=${from}&to=${to}`)).body.total).toBe(2);
    expect((await movements(`to=${from}`)).body.total).toBe(0);
  });
});

describe('Điều chỉnh tồn', () => {
  const adjust = (body: Record<string, unknown>, headers?: Record<string, string>) =>
    manager.call('post', '/inventory/adjust', { reason: 'Kiểm kho', ...body }, { headers });

  it('tăng, giảm, đặt số lượng ghi movement đúng before/after', async () => {
    const increase = await adjust({
      productId: ids.water,
      mode: 'increase',
      quantity: 5,
      expectedStock: 50,
    });
    expect(increase.status).toBe(201);
    expect(increase.body.movement).toMatchObject({
      type: 'adjust-in',
      quantity: 5,
      before: 50,
      after: 55,
      reason: 'Kiểm kho',
    });
    expect(increase.body.item.stock).toBe(55);

    const decrease = await adjust({
      productId: ids.water,
      mode: 'decrease',
      quantity: 3,
      note: '  ',
    });
    expect(decrease.body.movement).toMatchObject({
      type: 'adjust-out',
      quantity: -3,
      before: 55,
      after: 52,
      note: null,
    });

    const set = await adjust({ productId: ids.water, mode: 'set', quantity: 40 });
    expect(set.body.movement).toMatchObject({ quantity: -12, before: 52, after: 40 });
  });

  it('từ chối giảm quá tồn, đặt không đổi, tồn đã thay đổi và số lượng 0', async () => {
    const tooMuch = await adjust({ productId: ids.cookie, mode: 'decrease', quantity: 6 });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body).toMatchObject({
      code: 'INVENTORY_INSUFFICIENT_STOCK',
      details: { current: 5 },
    });
    expect((await adjust({ productId: ids.cookie, mode: 'set', quantity: 5 })).body.code).toBe(
      'INVENTORY_NO_CHANGE',
    );
    const stale = await adjust({
      productId: ids.cookie,
      mode: 'increase',
      quantity: 1,
      expectedStock: 9,
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'INVENTORY_STOCK_CHANGED', details: { current: 5 } });
    expect((await adjust({ productId: ids.cookie, mode: 'increase', quantity: 0 })).status).toBe(
      400,
    );
    expect(
      (await adjust({ productId: ids.cookie, mode: 'increase', quantity: 1, reason: ' ' })).status,
    ).toBe(400);
  });

  it('hai lệnh giảm đồng thời không làm sai tồn', async () => {
    await adjust({ productId: ids.noodle, mode: 'set', quantity: 10 });
    const results = await Promise.all([
      adjust({ productId: ids.noodle, mode: 'decrease', quantity: 6 }),
      adjust({ productId: ids.noodle, mode: 'decrease', quantity: 6 }),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect((await manager.call('get', `/inventory/${ids.noodle}`)).body.item.stock).toBe(4);
  });

  it('Idempotency-Key gửi lại không trừ tồn lần hai', async () => {
    const headers = { 'Idempotency-Key': `e2e-${randomUUID()}` };
    const first = await adjust({ productId: ids.water, mode: 'decrease', quantity: 2 }, headers);
    const second = await adjust({ productId: ids.water, mode: 'decrease', quantity: 2 }, headers);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.movement.id).toBe(first.body.movement.id);
    expect(second.body.item.stock).toBe(38);
    expect(
      (
        await adjust(
          { productId: ids.water, mode: 'decrease', quantity: 1 },
          { 'Idempotency-Key': 'x' },
        )
      ).status,
    ).toBe(400);
  });
});

describe('Tồn tối thiểu, phân quyền, xóa mềm', () => {
  it('đổi tồn tối thiểu chuyển mức low ↔ ok', async () => {
    const ok = await manager.call('patch', `/inventory/${ids.cookie}/min-stock`, { minStock: 2 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ minStockValue: 2, level: 'ok' });
    const low = await manager.call('patch', `/inventory/${ids.cookie}/min-stock`, { minStock: 10 });
    expect(low.body.level).toBe('low');
    expect(
      (await manager.call('patch', `/inventory/${ids.cookie}/min-stock`, { minStock: -1 })).status,
    ).toBe(400);
  });

  it('thu ngân bị chặn mọi endpoint tồn kho', async () => {
    for (const path of [
      '/inventory',
      '/inventory/stats',
      '/inventory/movements',
      `/inventory/${ids.water}`,
    ]) {
      expect((await cashier.call('get', path)).status).toBe(403);
    }
    const res = await cashier.call('post', '/inventory/adjust', {
      productId: ids.water,
      mode: 'increase',
      quantity: 1,
      reason: 'x',
    });
    expect(res.status).toBe(403);
  });

  it('sản phẩm xóa mềm biến mất khỏi danh sách nhưng lịch sử vẫn giữ tên', async () => {
    await manager.call('post', '/products/bulk-delete', { ids: [ids.candy] });
    expect(names((await list()).body.items)).not.toContain('Kẹo dẻo');
    const history = await manager.call('get', `/inventory/movements?productId=${ids.candy}`);
    expect(history.body.total).toBe(0);
    const water = await manager.call(
      'get',
      `/inventory/movements?productId=${ids.water}&pageSize=1`,
    );
    await manager.call('post', '/products/bulk-delete', { ids: [ids.water] });
    const after = await manager.call(
      'get',
      `/inventory/movements?productId=${ids.water}&pageSize=1`,
    );
    expect(after.body.items[0].productName).toBe(water.body.items[0].productName);
    expect((await manager.call('get', `/inventory/${ids.water}`)).status).toBe(404);
  });
});
