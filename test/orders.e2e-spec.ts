import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DEFAULT_MEMBERSHIP } from '../src/modules/customers/membership.rules';
import { createTestApp, TestClient, TestData } from './support';

interface Line {
  id: string;
  productId: string;
  quantity: number;
  allocatedDiscount: number;
  netAmount: number;
}

interface Order {
  id: string;
  code: string;
  status: string;
  items: Line[];
  totals: {
    subtotal: number;
    memberDiscount: number;
    voucherDiscount: number;
    pointsDiscount: number;
    total: number;
    due: number;
  };
  payments: {
    id: string;
    method: string;
    amount: number;
    tendered: number | null;
    status: string;
  }[];
  changeAmount: number;
  pointsEarned: number;
  refundedTotal: number;
}

let app: NestFastifyApplication;
let data: TestData;
let other: TestData;
let admin: TestClient;
let manager: TestClient;
let cashier: TestClient;
let outsider: TestClient;
let pA = '';
let pB = '';
let customerId = '';

const key = () => `e2e-${randomUUID()}`;

const signIn = async (source: TestData, role: 'admin' | 'manager' | 'cashier') => {
  const user = await source.user(role);
  const client = new TestClient(app);
  await client.login(user.username);
  return client;
};

const makeProduct = async (price: number, stock: number, costPrice = Math.round(price * 0.6)) => {
  const { category, unit } = await data.catalog();
  const product = await data.product(category.id, unit.id);
  await data.prisma.product.update({ where: { id: product.id }, data: { price, costPrice } });
  await data.prisma.productStock.create({
    data: { productId: product.id, storeId: await data.store(), quantity: stock },
  });
  return product.id;
};

const stockOf = async (productId: string) =>
  (
    await data.prisma.productStock.findFirstOrThrow({
      where: { productId, storeId: await data.store() },
    })
  ).quantity;

const pointsOf = async (id: string) =>
  (await data.prisma.customer.findUniqueOrThrow({ where: { id } })).points;

const createVoucher = async (fields: Record<string, unknown> = {}) => {
  const res = await manager.call('post', '/promotions', {
    code: `O${randomUUID().replace(/-/g, '').slice(0, 11).toUpperCase()}`,
    name: `${data.run} Voucher đơn`,
    discountType: 'amount',
    discountValue: 10_000,
    startAt: new Date(Date.now() - 3_600_000).toISOString(),
    endAt: new Date(Date.now() + 86_400_000).toISOString(),
    activate: true,
    ...fields,
  });
  expect(res.status).toBe(201);
  return res.body as { id: string; code: string };
};

const quote = (body: Record<string, unknown>, client = cashier) =>
  client.call('post', '/orders/quote', body);

const place = async (body: Record<string, unknown>, client = cashier, idem = key()) => {
  const priced = await quote(body, client);
  expect(priced.status).toBe(200);
  const res = await client.call(
    'post',
    '/orders',
    {
      payments: [{ method: 'cash', tendered: priced.body.totals.due }],
      expectedTotal: priced.body.totals.total,
      ...body,
    },
    { headers: { 'Idempotency-Key': idem } },
  );
  return res;
};

const act = (client: TestClient, path: string, body: Record<string, unknown> = {}) =>
  client.call('post', path, body, { headers: { 'Idempotency-Key': key() } });

beforeAll(async () => {
  app = await createTestApp();
  data = TestData.for(app);
  other = TestData.for(app);
  admin = await signIn(data, 'admin');
  manager = await signIn(data, 'manager');
  cashier = await signIn(data, 'cashier');
  outsider = await signIn(other, 'cashier');
  await admin.call('put', '/membership', DEFAULT_MEMBERSHIP);
  pA = await makeProduct(50_000, 20, 30_000);
  pB = await makeProduct(20_000, 100);
  const customer = await admin.call('post', '/customers', {
    name: `${data.run} Khách Bạc`,
    phone: data.phone(9001),
    legacySpent: 1_500_000,
    openingPoints: 200,
  });
  expect(customer.body.tier).toBe('silver');
  customerId = customer.body.id;
});

afterAll(async () => {
  await data?.cleanup();
  await other?.cleanup();
  await app?.close();
});

describe('Báo giá & tạo đơn', () => {
  it('giá server khớp priceCart (hạng + voucher), phân bổ giảm giá theo dòng', async () => {
    const voucher = await createVoucher();
    const body = {
      items: [
        { productId: pA, quantity: 2 },
        { productId: pB, quantity: 1 },
      ],
      customerId,
      voucherCode: voucher.code.toLowerCase(),
    };
    const priced = await quote(body);
    expect(priced.body.totals).toMatchObject({
      subtotal: 120_000,
      memberDiscount: 2_400,
      voucherDiscount: 10_000,
      total: 107_600,
      due: 107_600,
    });
    expect(priced.body).toMatchObject({
      voucherIssue: null,
      pointsToEarn: 12,
      member: { tier: 'silver', discountPercent: 2 },
    });
    expect(priced.body.promotions.map((p: { kind: string }) => p.kind)).toEqual([
      'member',
      'voucher',
    ]);

    const stockBefore = await stockOf(pA);
    const res = await cashier.call(
      'post',
      '/orders',
      { ...body, payments: [{ method: 'cash', tendered: 200_000 }], expectedTotal: 107_600 },
      { headers: { 'Idempotency-Key': key() } },
    );
    expect(res.status).toBe(201);
    const order = res.body as Order;
    expect(order.code).toMatch(/^HD\d{6}-\d{4}$/);
    expect(order).toMatchObject({ status: 'completed', changeAmount: 92_400, pointsEarned: 12 });
    expect(order.items.map((l) => [l.allocatedDiscount, l.netAmount])).toEqual([
      [10_333, 89_667],
      [2_067, 17_933],
    ]);
    expect(order.payments).toMatchObject([
      { method: 'cash', amount: 107_600, tendered: 200_000, status: 'confirmed' },
    ]);
    expect(await stockOf(pA)).toBe(stockBefore - 2);
    expect(await pointsOf(customerId)).toBe(212);
    const movement = await data.prisma.stockMovement.findFirstOrThrow({
      where: { productId: pA, refCode: order.code },
    });
    expect(movement).toMatchObject({ type: 'sale', quantity: -2 });
    const line = await data.prisma.orderLine.findFirstOrThrow({
      where: { orderId: order.id, productId: pA },
    });
    expect(line.costPrice).toBe(30_000);
    expect((await manager.call('get', `/promotions/${voucher.id}`)).body.usedCount).toBe(1);
  });

  it('voucher lỗi chỉ báo voucherIssue ở quote; expectedTotal lệch → 409 kèm báo giá', async () => {
    const issue = await quote({
      items: [{ productId: pB, quantity: 1 }],
      voucherCode: 'KHONGCO123',
    });
    expect(issue.body).toMatchObject({
      voucherIssue: 'Mã giảm giá không tồn tại',
      voucher: null,
      totals: { total: 20_000 },
    });
    const res = await cashier.call(
      'post',
      '/orders',
      {
        items: [{ productId: pB, quantity: 1 }],
        payments: [{ method: 'cash', tendered: 20_000 }],
        expectedTotal: 19_000,
      },
      { headers: { 'Idempotency-Key': key() } },
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: 'ORDER_TOTAL_CHANGED',
      details: { totals: { total: 20_000 } },
    });
    const missingKey = await cashier.call('post', '/orders', {
      items: [{ productId: pB, quantity: 1 }],
      payments: [{ method: 'cash', tendered: 20_000 }],
      expectedTotal: 20_000,
    });
    expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('Idempotency-Key trùng không tạo 2 đơn; hết hàng → 409; 2 đơn tranh món cuối', async () => {
    const before = await stockOf(pB);
    const idem = key();
    const first = await place({ items: [{ productId: pB, quantity: 1 }] }, cashier, idem);
    const second = await place({ items: [{ productId: pB, quantity: 1 }] }, cashier, idem);
    expect(second.body.id).toBe(first.body.id);
    expect(await stockOf(pB)).toBe(before - 1);

    const tooMany = await place({ items: [{ productId: pA, quantity: 999 }] });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.code).toBe('ORDER_OUT_OF_STOCK');
    expect(tooMany.body.details.items[0]).toMatchObject({ productId: pA });

    const last = await makeProduct(15_000, 1);
    const results = await Promise.all([
      place({ items: [{ productId: last, quantity: 1 }] }, cashier),
      place({ items: [{ productId: last, quantity: 1 }] }, manager),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(last)).toBe(0);
  });
});

describe('Thanh toán', () => {
  const base = { items: [{ productId: pA, quantity: 2 }], expectedTotal: 100_000 };
  const pay = (payments: object[], extra: Record<string, unknown> = {}) =>
    cashier.call(
      'post',
      '/orders',
      { ...base, items: [{ productId: pA, quantity: 2 }], payments, ...extra },
      { headers: { 'Idempotency-Key': key() } },
    );

  it('tiền mặt + chuyển khoản, trả dư bằng thẻ, tiền mặt thiếu', async () => {
    const mixed = await pay([
      { method: 'cash', tendered: 60_000 },
      { method: 'transfer', amount: 40_000, reference: 'FT1', confirmed: true },
    ]);
    expect(mixed.status).toBe(201);
    expect(mixed.body).toMatchObject({ status: 'completed', changeAmount: 0 });
    expect(
      mixed.body.payments.map((p: { method: string; amount: number }) => [p.method, p.amount]),
    ).toEqual([
      ['cash', 60_000],
      ['transfer', 40_000],
    ]);

    const change = await pay([
      { method: 'cash', tendered: 100_000 },
      { method: 'card', amount: 40_000 },
    ]);
    expect(change.body.changeAmount).toBe(40_000);

    const over = await pay([{ method: 'card', amount: 150_000 }]);
    expect(over.status).toBe(400);
    expect(over.body.code).toBe('PAYMENT_OVERPAID');
    const short = await pay([{ method: 'cash', tendered: 50_000 }]);
    expect(short.body).toMatchObject({
      code: 'PAYMENT_INSUFFICIENT',
      details: { missing: 50_000 },
    });
  });

  it('chuyển khoản chờ xác nhận → pending (đã trừ kho, chưa cộng điểm) → confirm → completed', async () => {
    const points = await pointsOf(customerId);
    const priced = await quote({ items: [{ productId: pB, quantity: 5 }], customerId });
    const res = await cashier.call(
      'post',
      '/orders',
      {
        items: [{ productId: pB, quantity: 5 }],
        customerId,
        payments: [{ method: 'transfer', amount: priced.body.totals.due }],
        expectedTotal: priced.body.totals.total,
      },
      { headers: { 'Idempotency-Key': key() } },
    );
    expect(res.body).toMatchObject({
      status: 'pending',
      pointsEarned: 0,
      pendingAmount: priced.body.totals.due,
    });
    expect(await pointsOf(customerId)).toBe(points);

    const confirmed = await act(cashier, `/orders/${res.body.id}/confirm-payment`, {
      reference: 'FT999',
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({
      status: 'completed',
      pointsEarned: priced.body.pointsToEarn,
    });
    expect(confirmed.body.payments[0]).toMatchObject({ status: 'confirmed', reference: 'FT999' });
    expect(await pointsOf(customerId)).toBe(points + priced.body.pointsToEarn);
    expect((await act(cashier, `/orders/${res.body.id}/confirm-payment`)).status).toBe(409);
  });

  it('trả bằng điểm', async () => {
    const points = await pointsOf(customerId);
    const res = await place({
      items: [{ productId: pA, quantity: 1 }],
      customerId,
      redeemPoints: 50,
    });
    expect(res.status).toBe(201);
    const order = res.body as Order;
    expect(order.totals).toMatchObject({ pointsDiscount: 5_000, due: order.totals.total - 5_000 });
    expect(order.payments.find((p) => p.method === 'points')).toMatchObject({
      amount: 5_000,
      status: 'confirmed',
    });
    expect(await pointsOf(customerId)).toBe(points - 50 + order.pointsEarned);
    const tooMany = await quote({
      items: [{ productId: pB, quantity: 1 }],
      customerId,
      redeemPoints: 100_000,
    });
    expect(tooMany.body.code).toBe('CUSTOMER_POINTS_INSUFFICIENT');
  });
});

describe('Hủy đơn', () => {
  it('hủy pending: hoàn kho, trả lượt voucher, hoàn điểm; quyền thu ngân', async () => {
    const voucher = await createVoucher();
    const stock = await stockOf(pA);
    const points = await pointsOf(customerId);
    const priced = await quote({
      items: [{ productId: pA, quantity: 3 }],
      customerId,
      voucherCode: voucher.code,
      redeemPoints: 20,
    });
    const res = await cashier.call(
      'post',
      '/orders',
      {
        items: [{ productId: pA, quantity: 3 }],
        customerId,
        voucherCode: voucher.code,
        redeemPoints: 20,
        payments: [{ method: 'transfer', amount: priced.body.totals.due }],
        expectedTotal: priced.body.totals.total,
      },
      { headers: { 'Idempotency-Key': key() } },
    );
    expect(res.body.status).toBe('pending');
    expect(await stockOf(pA)).toBe(stock - 3);
    expect(await pointsOf(customerId)).toBe(points - 20);

    expect((await act(outsider, `/orders/${res.body.id}/cancel`, { reason: 'x' })).status).toBe(
      404,
    );
    const cancelled = await act(cashier, `/orders/${res.body.id}/cancel`, {
      reason: 'Khách không chuyển khoản',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(await stockOf(pA)).toBe(stock);
    expect(await pointsOf(customerId)).toBe(points);
    expect((await manager.call('get', `/promotions/${voucher.id}`)).body.usedCount).toBe(0);

    const done = await place({ items: [{ productId: pB, quantity: 1 }] });
    expect((await act(cashier, `/orders/${done.body.id}/cancel`, { reason: 'x' })).status).toBe(
      403,
    );
    expect(
      (await act(manager, `/orders/${done.body.id}/cancel`, { reason: 'Nhập sai' })).body.status,
    ).toBe('cancelled');
  });
});

describe('Trả hàng', () => {
  it('trả một phần rồi trả nốt: tiền hoàn theo phân bổ, kho, điểm, voucher', async () => {
    const voucher = await createVoucher();
    const res = await place({
      items: [
        { productId: pA, quantity: 2 },
        { productId: pB, quantity: 1 },
      ],
      customerId,
      voucherCode: voucher.code,
    });
    const order = res.body as Order;
    const [lineA, lineB] = order.items;
    const stockA = await stockOf(pA);
    const stockB = await stockOf(pB);

    expect((await act(cashier, `/orders/${order.id}/returns`, {})).status).toBe(403);
    const over = await act(manager, `/orders/${order.id}/returns`, {
      lines: [{ orderLineId: lineA.id, quantity: 3, restock: true }],
      reason: 'Thử',
      refundMethod: 'cash',
    });
    expect(over.body.code).toBe('RETURN_LINE_INVALID');

    const partial = await act(manager, `/orders/${order.id}/returns`, {
      lines: [{ orderLineId: lineA.id, quantity: 1, restock: true }],
      reason: 'Sản phẩm lỗi',
      refundMethod: 'cash',
    });
    expect(partial.status).toBe(201);
    expect(partial.body.code).toMatch(/^TH\d{6}-\d{4}$/);
    expect(partial.body.refundTotal).toBe(Math.round(lineA.netAmount / 2));
    expect(partial.body.pointsRevoked).toBe(
      Math.floor((order.pointsEarned * partial.body.refundTotal) / order.totals.total),
    );
    expect(await stockOf(pA)).toBe(stockA + 1);
    const afterPartial = (await manager.call('get', `/orders/${order.id}`)).body;
    expect(afterPartial).toMatchObject({
      status: 'partially_refunded',
      refundedTotal: partial.body.refundTotal,
    });
    expect((await manager.call('get', `/promotions/${voucher.id}`)).body.usedCount).toBe(1);

    const rest = await act(manager, `/orders/${order.id}/returns`, {
      lines: [
        { orderLineId: lineA.id, quantity: 1, restock: false },
        { orderLineId: lineB.id, quantity: 1, restock: true },
      ],
      reason: 'Khách trả hết',
      refundMethod: 'transfer',
    });
    expect(rest.status).toBe(201);
    expect(partial.body.refundTotal + rest.body.refundTotal).toBe(order.totals.total);
    expect(await stockOf(pA)).toBe(stockA + 1);
    expect(await stockOf(pB)).toBe(stockB + 1);
    const refunded = (await manager.call('get', `/orders/${order.id}`)).body;
    expect(refunded).toMatchObject({
      status: 'refunded',
      refundedTotal: order.totals.total,
      pointsRevoked: order.pointsEarned,
    });
    expect((await manager.call('get', `/promotions/${voucher.id}`)).body.usedCount).toBe(0);
    expect((await act(manager, `/orders/${order.id}/refund`, { reason: 'x' })).body.code).toBe(
      'ORDER_INVALID_STATUS',
    );

    const list = await manager.call('get', `/returns?keyword=${order.code}`);
    expect(list.body.total).toBe(2);
    const detail = await manager.call('get', `/returns/${rest.body.id}`);
    expect(detail.body).toMatchObject({
      orderCode: order.code,
      refundMethod: 'transfer',
      lines: [{}, {}],
    });
  });

  it('quá hạn trả hàng → 409, admin override được; refund shortcut', async () => {
    const res = await place({ items: [{ productId: pB, quantity: 2 }] });
    await data.prisma.order.update({
      where: { id: res.body.id },
      data: { createdAt: new Date(Date.now() - 10 * 86_400_000) },
    });
    const expired = await act(manager, `/orders/${res.body.id}/refund`, { reason: 'Hết hạn' });
    expect(expired.status).toBe(409);
    expect(expired.body.code).toBe('RETURN_EXPIRED');
    const overridden = await act(admin, `/orders/${res.body.id}/refund`, {
      reason: 'Ngoại lệ',
      override: true,
    });
    expect(overridden.status).toBe(201);
    expect(overridden.body.refundTotal).toBe(40_000);
  });
});

describe('Đọc dữ liệu', () => {
  it('receipt, lookup, list, stats, today, phạm vi cửa hàng, đơn của khách', async () => {
    const res = await place({ items: [{ productId: pA, quantity: 1 }], customerId });
    const id = res.body.id;
    const receipt = await cashier.call('get', `/orders/${id}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({
      store: { name: 'E2E Store', returnPolicy: expect.any(String) },
      order: { code: res.body.code, printCount: 0 },
      customer: { maskedPhone: expect.stringMatching(/^\d{4}\*\*\*\d{3}$/), tierLabel: 'Bạc' },
      barcode: res.body.code,
    });
    expect(receipt.body.summary.vatIncluded).toBe(Math.round((res.body.totals.total * 8) / 108));
    expect(receipt.body.payments[0]).toMatchObject({ method: 'cash', label: 'Tiền mặt' });
    expect((await cashier.call('post', `/orders/${id}/print`)).body.printCount).toBe(1);

    expect(
      (await cashier.call('get', `/orders/lookup?code=${res.body.code.toLowerCase()}`)).body.id,
    ).toBe(id);
    expect((await outsider.call('get', `/orders/${id}`)).status).toBe(404);
    expect((await outsider.call('get', '/orders')).body.total).toBe(0);

    const list = await cashier.call('get', `/orders?keyword=${res.body.code}`);
    expect(list.body).toMatchObject({ total: 1, statusCounts: { all: 1, completed: 1 } });
    const byCustomer = await cashier.call(
      'get',
      `/orders?keyword=${encodeURIComponent(`${data.run} khach bac`)}&status=completed`,
    );
    expect(byCustomer.body.items.length).toBeGreaterThan(0);

    expect((await cashier.call('get', '/orders/stats')).status).toBe(403);
    const stats = await manager.call('get', '/orders/stats');
    expect(stats.body.revenue).toBeGreaterThan(0);
    expect(stats.body.byMethod.cash).toBeGreaterThan(0);
    const today = await cashier.call('get', '/orders/today');
    expect(today.body.orders).toBeGreaterThan(0);

    const orders = await manager.call('get', `/customers/${customerId}/orders`);
    expect(orders.body.total).toBeGreaterThan(0);
    expect(
      (await manager.call('get', `/customers/${customerId}`)).body.stats.orders30,
    ).toBeGreaterThan(0);
  });
});
