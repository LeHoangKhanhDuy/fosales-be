import { randomInt, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SupplierLedger } from '../src/modules/suppliers/supplier-ledger.service';
import { createTestApp, TestClient, TestData } from './support';

const DAY = 86_400_000;

let app: NestFastifyApplication;
let data: TestData;
let manager: TestClient;
let cashier: TestClient;
let admin: TestClient;
let managerId = '';
let categoryId = '';

const phone = () => `03${String(randomInt(10 ** 8)).padStart(8, '0')}`;
const taxCode = () => String(randomInt(10 ** 9, 10 ** 10));

const signIn = async (role: 'admin' | 'manager' | 'cashier') => {
  const user = await data.user(role);
  const client = new TestClient(app);
  await client.login(user.username);
  return { user, client };
};

const input = (name: string, fields: Record<string, unknown> = {}) => ({
  name: `${data.run} ${name}`,
  contact: 'Anh Tuấn',
  phone: phone(),
  address: '128 Cộng Hòa, Q. Tân Bình',
  categoryIds: [categoryId],
  paymentTermDays: 15,
  ...fields,
});

const createSupplier = async (name: string, fields: Record<string, unknown> = {}) => {
  const res = await manager.call('post', '/suppliers', input(name, fields));
  expect(res.status).toBe(201);
  return res.body as { id: string; code: string; summary: Record<string, unknown> };
};

const receipt = (supplierId: string, amount: number, daysAgo: number) =>
  data.prisma.$transaction((tx) =>
    app.get(SupplierLedger).apply(tx, {
      supplierId,
      kind: 'receipt',
      amount,
      code: `PN-${randomInt(10 ** 6)}`,
      label: 'Phiếu nhập hàng',
      refType: 'GoodsReceipt',
      occurredAt: new Date(Date.now() - daysAgo * DAY),
      userId: managerId,
    }),
  );

const pay = (id: string, amount: number, headers?: Record<string, string>) =>
  manager.call(
    'post',
    `/suppliers/${id}/payments`,
    { amount, method: 'transfer', reference: 'FT123' },
    { headers },
  );

beforeAll(async () => {
  app = await createTestApp();
  data = TestData.for(app);
  const signed = await signIn('manager');
  manager = signed.client;
  managerId = signed.user.id;
  cashier = (await signIn('cashier')).client;
  admin = (await signIn('admin')).client;
  categoryId = (await data.catalog()).category.id;
});

afterAll(async () => {
  await data?.cleanup();
  await app?.close();
});

describe('Tạo và sửa nhà cung cấp', () => {
  it('tự sinh mã NCC, chuẩn hóa dữ liệu', async () => {
    const next = (await manager.call('get', '/suppliers/next-code')).body.code;
    expect(next).toMatch(/^NCC\d{3,}$/);
    const supplier = await createSupplier('Minh Phát', {
      phone: `+84 ${phone().slice(1)}`,
      email: ' Order@MinhPhat.VN ',
      bankHolder: 'cong ty minh phat',
      taxCode: '',
    });
    expect(supplier.code).toMatch(/^NCC\d{3,}$/);
    expect(supplier).toMatchObject({
      email: 'order@minhphat.vn',
      bankHolder: 'CONG TY MINH PHAT',
      taxCode: null,
      categoryIds: [categoryId],
      status: 'active',
      summary: { purchased: 0, paid: 0, debt: 0, overdue: 0, orderCount: 0, nextDueAt: null },
    });
    expect((supplier as unknown as { phone: string }).phone).toMatch(/^0\d{9}$/);
  });

  it('báo trùng mã, tên không dấu, SĐT, MST và danh mục sai', async () => {
    const tax = taxCode();
    const code = `T${randomInt(10 ** 6)}-a`;
    const first = await createSupplier('Công ty Hòa Bình', { code, taxCode: tax });
    expect(first.code).toBe(code.toUpperCase());
    const post = (fields: Record<string, unknown>) =>
      manager.call('post', '/suppliers', input(`X${randomInt(10 ** 6)}`, fields));

    expect((await post({ code: code.toUpperCase() })).body.code).toBe('SUPPLIER_CODE_TAKEN');
    expect((await manager.call('post', '/suppliers', input('cong ty  HOA binh'))).body.code).toBe(
      'SUPPLIER_NAME_TAKEN',
    );
    const firstPhone = (await manager.call('get', `/suppliers/${first.id}`)).body.phone;
    expect((await post({ phone: firstPhone })).body.code).toBe('SUPPLIER_PHONE_TAKEN');
    expect((await post({ taxCode: tax })).body.code).toBe('SUPPLIER_TAX_CODE_TAKEN');
    expect((await post({ categoryIds: [randomUUID()] })).body.code).toBe(
      'SUPPLIER_CATEGORY_INVALID',
    );
    expect((await post({ phone: '12345' })).body.code).toBe('VALIDATION_ERROR');
    expect((await post({ taxCode: '12345' })).status).toBe(400);
  });

  it('sửa một phần và thay danh mục', async () => {
    const supplier = await createSupplier('Sửa thông tin');
    const other = (await data.catalog()).category.id;
    const res = await manager.call('patch', `/suppliers/${supplier.id}`, {
      contact: 'Chị Hạnh',
      categoryIds: [other, other],
      paymentTermDays: 30,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      contact: 'Chị Hạnh',
      categoryIds: [other],
      paymentTermDays: 30,
    });
    expect((await manager.call('patch', `/suppliers/${supplier.id}`, {})).body.code).toBe(
      'VALIDATION_ERROR',
    );
    expect((await manager.call('get', `/suppliers/${randomUUID()}`)).body.code).toBe(
      'SUPPLIER_NOT_FOUND',
    );
  });
});

describe('Trạng thái', () => {
  it('tạm ngưng cần lý do, hạn phải ở tương lai, hết hạn tự hoạt động lại', async () => {
    const supplier = await createSupplier('Tạm ngưng');
    const status = (body: Record<string, unknown>) =>
      manager.call('patch', `/suppliers/${supplier.id}/status`, body);

    expect((await status({ status: 'suspended' })).status).toBe(400);
    expect(
      (
        await status({
          status: 'suspended',
          reason: 'Trễ hàng',
          until: new Date(Date.now() - DAY).toISOString(),
        })
      ).status,
    ).toBe(400);
    const suspended = await status({
      status: 'suspended',
      reason: 'Trễ hàng',
      until: new Date(Date.now() + DAY).toISOString(),
    });
    expect(suspended.body).toMatchObject({ status: 'suspended', suspendReason: 'Trễ hàng' });

    const options = await manager.call('get', `/suppliers/options?categoryId=${categoryId}`);
    expect(options.body.map((o: { id: string }) => o.id)).not.toContain(supplier.id);

    await data.prisma.supplier.update({
      where: { id: supplier.id },
      data: { suspendedUntil: new Date(Date.now() - 1000) },
    });
    const reread = await manager.call('get', `/suppliers/${supplier.id}`);
    expect(reread.body).toMatchObject({
      status: 'active',
      suspendReason: null,
      suspendedUntil: null,
    });

    const inactive = await status({ status: 'inactive', reason: 'bỏ qua' });
    expect(inactive.body).toMatchObject({ status: 'inactive', suspendReason: null });
  });
});

describe('Công nợ và thanh toán', () => {
  let supplierId = '';
  let recentDue = '';
  let recentAt = '';

  beforeAll(async () => {
    supplierId = (await createSupplier('Công nợ FIFO')).id;
    await receipt(supplierId, 1_000_000, 40);
    const recent = await receipt(supplierId, 2_000_000, 5);
    recentAt = recent.entry.at.toISOString();
    recentDue = recent.entry.dueAt?.toISOString() ?? '';
  });

  it('thanh toán phân bổ FIFO, tính quá hạn và hạn kế tiếp', async () => {
    const res = await pay(supplierId, 600_000);
    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({
      amount: 600_000,
      method: 'transfer',
      reference: 'FT123',
    });
    expect(res.body.payment.code).toMatch(/^PC\d{6}-\d{4}$/);
    expect(res.body.supplier.summary).toEqual({
      orderCount: 0,
      openOrders: 0,
      purchased: 3_000_000,
      paid: 600_000,
      debt: 2_400_000,
      overdue: 400_000,
      lastReceiptAt: recentAt,
      nextDueAt: recentDue,
    });

    const ledger = await manager.call('get', `/suppliers/${supplierId}/ledger`);
    expect(ledger.body.total).toBe(3);
    expect(ledger.body.items[0]).toMatchObject({
      kind: 'payment',
      amount: -600_000,
      balance: 2_400_000,
      label: 'Chuyển khoản · FT123',
    });
    const payments = await manager.call('get', `/suppliers/${supplierId}/payments`);
    expect(payments.body.items[0].paidBy).toEqual(expect.any(String));
  });

  it('chặn trả vượt nợ, hai lệnh đồng thời và Idempotency-Key', async () => {
    const over = await pay(supplierId, 3_000_000);
    expect(over.status).toBe(409);
    expect(over.body).toMatchObject({
      code: 'SUPPLIER_PAYMENT_EXCEEDS_DEBT',
      details: { debt: 2_400_000 },
    });

    const results = await Promise.all([pay(supplierId, 1_500_000), pay(supplierId, 1_500_000)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);

    const headers = { 'Idempotency-Key': `e2e-${randomUUID()}` };
    const first = await pay(supplierId, 100_000, headers);
    const second = await pay(supplierId, 100_000, headers);
    expect(second.body.payment.id).toBe(first.body.payment.id);
    expect(second.body.supplier.summary.debt).toBe(800_000);

    const fresh = await createSupplier('Không nợ');
    expect((await pay(fresh.id, 1000)).body).toMatchObject({
      code: 'SUPPLIER_PAYMENT_EXCEEDS_DEBT',
      details: { debt: 0 },
    });
  });

  it('danh sách: tìm không dấu, tab, sắp xếp, tabCounts', async () => {
    const list = (query: string) =>
      manager.call('get', `/suppliers?categoryId=${categoryId}&pageSize=100&${query}`);
    const all = await list('');
    expect(all.status).toBe(200);
    expect(all.body.tabCounts.all).toBe(all.body.total);
    expect(all.body.tabCounts.debt).toBe(1);

    const debt = await list('tab=debt');
    expect(debt.body.items.map((s: { id: string }) => s.id)).toEqual([supplierId]);
    expect(debt.body.tabCounts).toEqual(all.body.tabCounts);
    expect((await list('sort=debt')).body.items[0].id).toBe(supplierId);
    expect((await list('sort=purchased')).body.items[0].id).toBe(supplierId);
    expect(
      (await list('keyword=CONG%20NO%20fifo')).body.items.map((s: { id: string }) => s.id),
    ).toEqual([supplierId]);
    expect(
      (await list('tab=inactive')).body.items.every(
        (s: { status: string }) => s.status === 'inactive',
      ),
    ).toBe(true);

    const stats = await manager.call('get', '/suppliers/stats');
    expect(stats.body.debt).toBeGreaterThanOrEqual(800_000);
    expect(stats.body.overdue).toBeGreaterThanOrEqual(0);
    const detail = await manager.call('get', `/suppliers/${supplierId}`);
    expect(detail.body.summary).toMatchObject({ debt: 800_000, overdue: 0, paid: 2_200_000 });
    expect(stats.body.openOrders).toBe(0);
  });

  it('không xóa được NCC đã có giao dịch, xóa được NCC mới', async () => {
    const blocked = await manager.call('delete', `/suppliers/${supplierId}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('SUPPLIER_HAS_TRANSACTIONS');
    const fresh = await createSupplier('Xóa được');
    expect((await manager.call('delete', `/suppliers/${fresh.id}`)).status).toBe(204);
    expect((await manager.call('get', `/suppliers/${fresh.id}`)).status).toBe(404);
  });
});

describe('Phân quyền và cửa hàng', () => {
  it('thu ngân không truy cập được nhà cung cấp', async () => {
    expect((await cashier.call('get', '/suppliers')).status).toBe(403);
    expect((await cashier.call('post', '/suppliers', input('Cấm'))).status).toBe(403);
  });

  it('mọi vai trò xem được cửa hàng hiện tại, chỉ admin được sửa', async () => {
    const current = await cashier.call('get', '/stores/current');
    expect(current.status).toBe(200);
    expect(current.body).toMatchObject({
      code: data.run,
      name: 'E2E Store',
      address: null,
      receiptFooter: null,
    });
    expect((await manager.call('patch', '/stores/current', { address: 'X' })).status).toBe(403);
    const updated = await admin.call('patch', '/stores/current', {
      address: '12 Nguyễn Huệ, Q. 1',
      phone: '028 3812 3456',
      receiptFooter: 'Cảm ơn quý khách',
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      address: '12 Nguyễn Huệ, Q. 1',
      phone: '02838123456',
      receiptFooter: 'Cảm ơn quý khách',
    });
  });
});
