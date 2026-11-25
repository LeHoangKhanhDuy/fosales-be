import { randomInt, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { productSearchKey } from '../src/modules/products/products.utils';
import { vnToday } from '../src/modules/purchasing/purchasing.utils';
import { createTestApp, TestClient, TestData } from './support';

const DAY = 86_400_000;

interface Item {
  productId: string;
  orderedQty: number;
  unitCost: number;
  receivedQty: number;
  damagedQty: number;
  packSize: number;
}

interface Order {
  id: string;
  code: string;
  status: string;
  items: Item[];
  history: { label: string }[];
  totals: { subtotal: number; total: number; receivedValue: number };
  cancelReason: string | null;
  draftVersion: number | null;
}

let app: NestFastifyApplication;
let data: TestData;
let manager: TestClient;
let manager2: TestClient;
let cashier: TestClient;
let categoryId = '';
let unitId = '';
let supplierId = '';
let products: { id: string }[] = [];

const tomorrow = () => vnToday(Date.now() + DAY);
const key = () => `e2e-${randomUUID()}`;

const signIn = async (role: 'admin' | 'manager' | 'cashier') => {
  const user = await data.user(role);
  const client = new TestClient(app);
  await client.login(user.username);
  return client;
};

const createSupplier = async (name: string) => {
  const res = await manager.call('post', '/suppliers', {
    name: `${data.run} ${name}`,
    contact: 'Anh Tuấn',
    phone: `03${String(randomInt(10 ** 8)).padStart(8, '0')}`,
    address: '128 Cộng Hòa, Q. Tân Bình',
    categoryIds: [categoryId],
    paymentTermDays: 15,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
};

const createProduct = async (name?: string, costPrice: number | null = null, stock = 0) => {
  const product = await data.product(categoryId, unitId);
  const fullName = name ? `${data.run} ${name}` : product.name;
  await data.prisma.product.update({
    where: { id: product.id },
    data: { name: fullName, costPrice, searchKey: productSearchKey(fullName, product.sku) },
  });
  await data.prisma.productStock.create({
    data: { productId: product.id, storeId: await data.store(), quantity: stock },
  });
  return product;
};

const stockOf = async (productId: string) =>
  (await data.prisma.productStock.findFirstOrThrow({ where: { productId } })).quantity;

const createOrder = async (
  items: { productId: string; orderedQty: number; unitCost: number }[],
  fields: Record<string, unknown> = {},
  supplier = supplierId,
) => {
  const res = await manager.call('post', '/purchase-orders', {
    supplierId: supplier,
    expectedDate: tomorrow(),
    items,
    ...fields,
  });
  expect(res.status).toBe(201);
  return res.body as Order;
};

const line = (productId: string, scannedQty: number, fields: Record<string, unknown> = {}) => ({
  productId,
  scannedQty,
  damagedQty: 0,
  unitCost: 5000,
  extra: false,
  shortageAction: 'backorder',
  excessAction: 'accept',
  ...fields,
});

const receive = (
  id: string,
  lines: object[],
  fields: Record<string, unknown> = {},
  idempotencyKey: string | null = key(),
  client = manager,
) =>
  client.call(
    'post',
    `/purchase-orders/${id}/receive`,
    { checkIn: { supplierDocNo: 'HD-0001', packageCount: 2, packagingOk: true }, lines, ...fields },
    { headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} },
  );

const draft = (productId: string, scannedQty = 0) => ({
  step: 'count',
  checkIn: { supplierDocNo: 'HD-0001', packageCount: 1, packagingOk: true, deliveredBy: '' },
  lines: [{ productId, scannedQty, damagedQty: 0, expectedQty: 10 }],
  scans: [],
  note: '',
  approvedBy: '',
  startedAt: new Date().toISOString(),
});

beforeAll(async () => {
  app = await createTestApp();
  data = TestData.for(app);
  manager = await signIn('manager');
  manager2 = await signIn('manager');
  cashier = await signIn('cashier');
  const catalog = await data.catalog();
  categoryId = catalog.category.id;
  unitId = catalog.unit.id;
  supplierId = await createSupplier('Minh Phát');
  products = [
    await createProduct('Sữa đậu nành Fami', 5000, 10),
    await createProduct(undefined, null, 0),
    await createProduct(undefined, 4000, 0),
  ];
});

afterAll(async () => {
  await data?.cleanup();
  await app?.close();
});

describe('Quyền', () => {
  it('cashier → 403', async () => {
    expect((await cashier.call('get', '/purchase-orders')).status).toBe(403);
    expect((await cashier.call('get', '/goods-receipts')).status).toBe(403);
  });
});

describe('Tạo / sửa / đặt / hủy đơn', () => {
  it('vòng đời đơn nháp', async () => {
    const order = await createOrder([
      { productId: products[0].id, orderedQty: 10, unitCost: 5000 },
    ]);
    expect(order).toMatchObject({ status: 'draft', totals: { subtotal: 50000, total: 50000 } });
    expect(order.code).toMatch(/^DH\d{6}-\d{4}$/);
    expect(order.items[0].packSize).toBe(1);

    const updated = await manager.call('patch', `/purchase-orders/${order.id}`, {
      items: [
        { productId: products[0].id, orderedQty: 12, unitCost: 5000, packSize: 6 },
        { productId: products[1].id, orderedQty: 5, unitCost: 2000 },
      ],
      discount: 10000,
      note: '  ',
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      discount: 10000,
      note: null,
      totals: { subtotal: 70000, total: 60000 },
    });
    expect(updated.body.items.map((item: Item) => item.packSize)).toEqual([6, 1]);

    const placed = await manager.call('post', `/purchase-orders/${order.id}/place`);
    expect(placed.status).toBe(200);
    expect(placed.body.status).toBe('ordered');
    expect(placed.body.history.map((event: { label: string }) => event.label)).toEqual([
      'Tạo đơn đặt hàng',
      'Cập nhật đơn nháp',
      'Gửi đơn cho nhà cung cấp',
    ]);

    const edit = await manager.call('patch', `/purchase-orders/${order.id}`, { discount: 0 });
    expect(edit.status).toBe(409);
    expect(edit.body).toMatchObject({
      code: 'PURCHASE_INVALID_STATUS',
      details: { status: 'ordered' },
    });

    const cancelled = await manager.call('post', `/purchase-orders/${order.id}/cancel`, {
      reason: 'NCC hết hàng',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'cancelled', cancelReason: 'NCC hết hàng' });
    expect(
      (await manager.call('post', `/purchase-orders/${order.id}/cancel`, { reason: 'x' })).status,
    ).toBe(409);
  });

  it('place=true gửi đơn ngay', async () => {
    const order = await createOrder(
      [{ productId: products[0].id, orderedQty: 1, unitCost: 1000 }],
      { place: true },
    );
    expect(order.status).toBe('ordered');
  });

  it('validate dữ liệu đơn', async () => {
    const item = { productId: products[0].id, orderedQty: 1, unitCost: 1000 };
    const post = (body: Record<string, unknown>) =>
      manager.call('post', '/purchase-orders', {
        supplierId,
        expectedDate: tomorrow(),
        items: [item],
        ...body,
      });

    expect((await post({ items: [] })).body.code).toBe('PURCHASE_ITEMS_REQUIRED');
    const missing = randomUUID();
    const invalid = await post({ items: [{ ...item, productId: missing }] });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      code: 'PURCHASE_PRODUCT_INVALID',
      details: { productIds: [missing] },
    });
    expect((await post({ items: [item, item] })).status).toBe(400);
    expect((await post({ discount: 2000 })).body.code).toBe('PURCHASE_DISCOUNT_INVALID');
    expect((await post({ expectedDate: vnToday(Date.now() - DAY) })).status).toBe(400);
    expect((await post({ supplierId: randomUUID() })).status).toBe(404);

    const suspended = await createSupplier('Tạm ngưng');
    await data.prisma.supplier.update({
      where: { id: suspended },
      data: { status: 'suspended', suspendedUntil: new Date(Date.now() + 10 * DAY) },
    });
    const res = await post({ supplierId: suspended });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SUPPLIER_NOT_ACTIVE');
  });
});

describe('Danh sách', () => {
  it('tab counts, keyword không dấu, quá hạn, summary', async () => {
    const supplier = await createSupplier('Danh sách');
    const milk = { productId: products[0].id, orderedQty: 2, unitCost: 1000 };
    const other = { productId: products[1].id, orderedQty: 2, unitCost: 1000 };
    await createOrder([milk], {}, supplier);
    const late = await createOrder([other], { place: true }, supplier);
    await createOrder([other], { place: true }, supplier);
    await data.prisma.purchaseOrder.update({
      where: { id: late.id },
      data: { expectedDate: new Date(`${vnToday(Date.now() - 2 * DAY)}T00:00:00.000Z`) },
    });

    const all = await manager.call('get', `/purchase-orders?supplierId=${supplier}&tab=all`);
    expect(all.status).toBe(200);
    expect(all.body.tabCounts).toMatchObject({ all: 3, draft: 1, ordered: 2, open: 2, partial: 0 });

    const open = await manager.call('get', `/purchase-orders?supplierId=${supplier}`);
    expect(open.body.total).toBe(2);
    expect(open.body.items[0].id).toBe(late.id);
    expect(open.body.items[0].overdue).toBe(true);

    const search = await manager.call(
      'get',
      `/purchase-orders?supplierId=${supplier}&tab=all&keyword=${encodeURIComponent('sua dau nanh')}`,
    );
    expect(search.body.total).toBe(1);

    const overdue = await manager.call(
      'get',
      `/purchase-orders?supplierId=${supplier}&overdue=true&tab=all`,
    );
    expect(overdue.body.items.map((item: { id: string }) => item.id)).toEqual([late.id]);

    const summary = await manager.call('get', '/purchase-orders/summary');
    expect(summary.body.overdue).toBeGreaterThanOrEqual(1);
    expect(summary.body.draft).toBeGreaterThanOrEqual(1);
  });

  it('gợi ý hàng sắp hết theo NCC', async () => {
    const res = await manager.call('get', `/purchase-orders/suggestions?supplierId=${supplierId}`);
    expect(res.status).toBe(200);
    const suggestion = res.body.find(
      (item: { productId: string }) => item.productId === products[1].id,
    );
    expect(suggestion).toMatchObject({ orderedQty: 30, unitCost: 7500, packSize: 1 });
  });
});

describe('Phiên kiểm đếm', () => {
  it('khóa phiên, If-Match, tiếp quản, bỏ nháp', async () => {
    const order = await createOrder(
      [{ productId: products[0].id, orderedQty: 10, unitCost: 5000 }],
      { place: true },
    );
    const path = `/purchase-orders/${order.id}/receiving`;

    const first = await manager.call('put', path, draft(products[0].id));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ version: 1, order: { status: 'receiving' } });

    const second = await manager.call('put', path, draft(products[0].id, 3), {
      headers: { 'If-Match': '1' },
    });
    expect(second.body.version).toBe(2);
    const stale = await manager.call('put', path, draft(products[0].id, 4), {
      headers: { 'If-Match': '1' },
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      code: 'PURCHASE_RECEIVING_CONFLICT',
      details: { version: 2 },
    });

    const locked = await manager2.call('put', path, draft(products[0].id));
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('PURCHASE_RECEIVING_LOCKED');
    expect(
      (await receive(order.id, [line(products[0].id, 10)], {}, key(), manager2)).body.code,
    ).toBe('PURCHASE_RECEIVING_LOCKED');

    const takeover = await manager2.call('put', `${path}?takeover=true`, draft(products[0].id, 5));
    expect(takeover.status).toBe(200);
    expect(takeover.body.version).toBe(3);

    const detail = await manager2.call('get', `/purchase-orders/${order.id}`);
    expect(detail.body.draftReceipt.lines[0].scannedQty).toBe(5);
    expect(detail.body.draftVersion).toBe(3);
    expect(detail.body.history.at(-1).label).toMatch(/^Tiếp quản phiên kiểm đếm/);

    const invalid = await manager2.call('put', path, { step: 'count' });
    expect(invalid.status).toBe(400);

    const discarded = await manager2.call('delete', path);
    expect(discarded.status).toBe(200);
    expect(discarded.body).toMatchObject({ status: 'ordered', draftReceipt: null });
  });
});

describe('Nhận hàng', () => {
  it('nhận đủ: tồn kho, giá vốn bình quân, công nợ, idempotency', async () => {
    const [milk, , soap] = products;
    const stockBefore = await stockOf(milk.id);
    const debtBefore = Number(
      (await data.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } })).debt,
    );
    const order = await createOrder(
      [
        { productId: milk.id, orderedQty: 10, unitCost: 6000 },
        { productId: soap.id, orderedQty: 5, unitCost: 4000 },
      ],
      { place: true },
    );
    const idem = key();
    expect((await receive(order.id, [line(milk.id, 10)], {}, null)).body.code).toBe(
      'IDEMPOTENCY_KEY_REQUIRED',
    );
    const res = await receive(
      order.id,
      [
        line(milk.id, 10, {
          unitCost: 6000,
          lotNo: 'L1',
          expiryDate: vnToday(Date.now() + 90 * DAY),
        }),
        line(soap.id, 5, { unitCost: 4000 }),
      ],
      {},
      idem,
    );
    expect(res.status).toBe(201);
    const { order: done, receipt } = res.body;
    expect(done.status).toBe('completed');
    expect(receipt).toMatchObject({
      grossValue: 80000,
      discount: 0,
      value: 80000,
      supplierDocNo: 'HD-0001',
    });
    expect(receipt.code).toMatch(/^PN\d{6}-\d{4}$/);
    expect(done.totals.receivedValue).toBe(80000);

    expect(await stockOf(milk.id)).toBe(stockBefore + 10);
    const movement = await data.prisma.stockMovement.findFirstOrThrow({
      where: { productId: milk.id, refCode: receipt.code },
    });
    expect(movement).toMatchObject({
      type: 'import',
      quantity: 10,
      before: stockBefore,
      after: stockBefore + 10,
    });
    expect(movement.note).toMatch(/^Lô L1 · HSD /);

    const milkRow = await data.prisma.product.findUniqueOrThrow({ where: { id: milk.id } });
    expect(milkRow.costPrice).toBe(
      Math.round((stockBefore * 5000 + 10 * 6000) / (stockBefore + 10) / 100) * 100,
    );
    expect(
      (await data.prisma.product.findUniqueOrThrow({ where: { id: soap.id } })).costPrice,
    ).toBe(4000);

    const supplier = await data.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    expect(Number(supplier.debt)).toBe(debtBefore + 80000);
    const entry = await data.prisma.supplierLedgerEntry.findFirstOrThrow({
      where: { refId: receipt.id },
    });
    expect(entry.dueAt!.getTime() - entry.occurredAt.getTime()).toBe(15 * DAY);

    const replay = await receive(order.id, [line(milk.id, 10)], {}, idem);
    expect(replay.status).toBe(201);
    expect(replay.body.receipt.id).toBe(receipt.id);
    expect(await stockOf(milk.id)).toBe(stockBefore + 10);

    const again = await receive(order.id, [line(milk.id, 1)]);
    expect(again.status).toBe(409);

    const detail = await manager.call('get', `/goods-receipts/${receipt.id}`);
    expect(detail.body).toMatchObject({
      poCode: order.code,
      supplier: { address: '128 Cộng Hòa, Q. Tân Bình' },
    });
    expect(detail.body.lines).toHaveLength(2);
    const list = await manager.call('get', `/goods-receipts?poId=${order.id}`);
    expect(list.body).toMatchObject({ total: 1, items: [{ id: receipt.id, poCode: order.code }] });

    const summary = await manager.call('get', `/suppliers/${supplierId}`);
    expect(summary.body.summary.orderCount).toBeGreaterThanOrEqual(1);
    const top = await manager.call('get', `/suppliers/${supplierId}/top-products`);
    expect(top.body.find((row: { productId: string }) => row.productId === soap.id)).toMatchObject({
      qty: 5,
      value: 20000,
      lastCost: 4000,
    });
    expect((await manager.call('delete', `/suppliers/${supplierId}`)).status).toBe(409);
  });

  it('thiếu + giao bù → partial rồi completed, chiết khấu phân bổ đủ', async () => {
    const [milk] = products;
    const order = await createOrder([{ productId: milk.id, orderedQty: 10, unitCost: 5000 }], {
      place: true,
      discount: 10000,
    });
    const needApproval = await receive(order.id, [line(milk.id, 6)]);
    expect(needApproval.status).toBe(400);
    expect(needApproval.body).toMatchObject({
      code: 'PURCHASE_APPROVAL_REQUIRED',
      details: { expectedValue: 50000, acceptedValue: 30000 },
    });

    const first = await receive(order.id, [line(milk.id, 6)], { approvedBy: 'Quốc Huy' });
    expect(first.status).toBe(201);
    expect(first.body.order.status).toBe('partial');
    expect(first.body.receipt).toMatchObject({ grossValue: 30000, discount: 6000, value: 24000 });

    const second = await receive(order.id, [line(milk.id, 4)]);
    expect(second.status).toBe(201);
    expect(second.body.order.status).toBe('completed');
    expect(second.body.receipt).toMatchObject({ grossValue: 20000, discount: 4000, value: 16000 });
    expect(second.body.order.receipts).toHaveLength(2);
  });

  it('thiếu + hủy phần thiếu → completed, orderedQty giảm', async () => {
    const [milk] = products;
    const order = await createOrder([{ productId: milk.id, orderedQty: 10, unitCost: 5000 }], {
      place: true,
    });
    const res = await receive(order.id, [line(milk.id, 8, { shortageAction: 'cancel' })], {
      approvedBy: 'Quốc Huy',
    });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('completed');
    expect(res.body.order.items[0]).toMatchObject({ orderedQty: 8, receivedQty: 8 });
  });

  it('thừa nhận / trả, hàng hỏng không vào kho, dòng ngoài đơn', async () => {
    const [milk, extra] = products;
    const accept = await createOrder([{ productId: milk.id, orderedQty: 10, unitCost: 5000 }], {
      place: true,
    });
    const accepted = await receive(accept.id, [line(milk.id, 12)], { approvedBy: 'Quốc Huy' });
    expect(accepted.body.receipt.lines[0]).toMatchObject({ acceptedQty: 12, returnedQty: 0 });
    expect(accepted.body.order.status).toBe('completed');

    const order = await createOrder([{ productId: milk.id, orderedQty: 10, unitCost: 5000 }], {
      place: true,
    });
    const [milkBefore, extraBefore] = [await stockOf(milk.id), await stockOf(extra.id)];
    const res = await receive(
      order.id,
      [
        line(milk.id, 12, { damagedQty: 2, excessAction: 'return' }),
        line(extra.id, 3, { extra: true, unitCost: 7000 }),
      ],
      { approvedBy: 'Quốc Huy' },
    );
    expect(res.status).toBe(201);
    expect(res.body.receipt.lines[0]).toMatchObject({
      expectedQty: 10,
      acceptedQty: 8,
      damagedQty: 2,
      returnedQty: 2,
    });
    expect(res.body.receipt.grossValue).toBe(8 * 5000 + 3 * 7000);
    expect(await stockOf(milk.id)).toBe(milkBefore + 8);
    expect(await stockOf(extra.id)).toBe(extraBefore + 3);
    expect(res.body.order.status).toBe('partial');
    expect(res.body.order.items[1]).toMatchObject({
      productId: extra.id,
      orderedQty: 3,
      receivedQty: 3,
    });

    const outside = await receive(order.id, [line(randomUUID(), 1)]);
    expect(outside.body.code).toBe('PURCHASE_LINE_INVALID');
    expect((await receive(order.id, [line(milk.id, 0)])).body.code).toBe('PURCHASE_RECEIVE_EMPTY');
    expect((await receive(order.id, [line(milk.id, 1, { damagedQty: 2 })])).status).toBe(400);
  });

  it('2 request nhận đồng thời chỉ 1 thành công', async () => {
    const [milk] = products;
    const order = await createOrder([{ productId: milk.id, orderedQty: 5, unitCost: 5000 }], {
      place: true,
    });
    const before = await stockOf(milk.id);
    const results = await Promise.all([
      receive(order.id, [line(milk.id, 5)]),
      receive(order.id, [line(milk.id, 5)], {}, key(), manager.clone()),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await stockOf(milk.id)).toBe(before + 5);
  });
});
