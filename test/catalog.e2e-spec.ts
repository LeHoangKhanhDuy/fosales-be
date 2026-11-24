import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp, TestClient, TestData } from './support';

let app: NestFastifyApplication;
let data: TestData;
let admin: TestClient;
let cashier: TestClient;

const signIn = async (role: 'admin' | 'cashier') => {
  const user = await data.user(role);
  const client = new TestClient(app);
  await client.login(user.username);
  return client;
};

beforeAll(async () => {
  app = await createTestApp();
  data = TestData.for(app);
  admin = await signIn('admin');
  cashier = await signIn('cashier');
});

afterAll(async () => {
  await data?.cleanup();
  await app?.close();
});

describe('Danh mục', () => {
  it('tạo, sửa trạng thái, lọc theo status và trả productCount', async () => {
    const created = await admin.call('post', '/categories', {
      name: `  ${data.run}   Đồ uống `,
      description: '',
      icon: 'cup-soda',
      color: 'sky',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: `${data.run} Đồ uống`,
      description: null,
      icon: 'cup-soda',
      color: 'sky',
      status: 'active',
      productCount: 0,
    });
    expect(created.body.sortOrder).toBeGreaterThan(0);

    const patched = await admin.call('patch', `/categories/${created.body.id}`, { status: 'inactive' });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('inactive');

    const active = await cashier.call('get', '/categories?status=active');
    expect(active.body.some((c: { id: string }) => c.id === created.body.id)).toBe(false);
    const all = await cashier.call('get', '/categories');
    expect(all.status).toBe(200);
    expect(all.body.find((c: { id: string }) => c.id === created.body.id)).toHaveProperty('productCount', 0);
  });

  it('chống trùng tên không phân biệt dấu, hoa thường', async () => {
    expect((await admin.call('post', '/categories', { name: `${data.run} Bánh Kẹo` })).status).toBe(201);
    const duplicate = await admin.call('post', '/categories', { name: `${data.run} banh   KEO` });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CATEGORY_NAME_TAKEN');
  });

  it('validate icon, màu, tên và id', async () => {
    expect((await admin.call('post', '/categories', { name: `${data.run} X`, icon: 'rocket' })).body.code).toBe(
      'VALIDATION_ERROR',
    );
    expect((await admin.call('post', '/categories', { name: `${data.run} X`, color: 'black' })).status).toBe(400);
    expect((await admin.call('post', '/categories', { name: '   ' })).status).toBe(400);
    expect((await admin.call('patch', `/categories/${randomUUID()}`, { status: 'active' })).body.code).toBe(
      'CATEGORY_NOT_FOUND',
    );
    expect((await admin.call('patch', '/categories/not-a-uuid', { status: 'active' })).status).toBe(404);
  });

  it('cashier được xem nhưng không được sửa', async () => {
    expect((await cashier.call('get', '/categories')).status).toBe(200);
    const res = await cashier.call('post', '/categories', { name: `${data.run} Cấm` });
    expect(res.status).toBe(403);
  });

  it('sắp xếp lại bằng hoán vị đầy đủ', async () => {
    const ids: string[] = (await admin.call('get', '/categories?withCount=false')).body.map((c: { id: string }) => c.id);
    const reversed = [...ids].reverse();
    expect((await admin.call('put', '/categories/order', { ids: reversed })).status).toBe(204);
    const after = await admin.call('get', '/categories');
    expect(after.body.map((c: { id: string }) => c.id)).toEqual(reversed);
    expect(after.body.map((c: { sortOrder: number }) => c.sortOrder)).toEqual(reversed.map((_, i) => i + 1));

    const missing = await admin.call('put', '/categories/order', { ids: reversed.slice(1) });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('CATEGORY_ORDER_INVALID');
    const duplicated = await admin.call('put', '/categories/order', { ids: [...reversed.slice(1), reversed[1]] });
    expect(duplicated.body.code).toBe('CATEGORY_ORDER_INVALID');
  });

  it('xóa danh mục còn sản phẩm phải chuyển sang danh mục khác', async () => {
    const { category: source, unit } = await data.catalog();
    const { category: target } = await data.catalog();
    const product = await data.product(source.id, unit.id);

    const blocked = await admin.call('delete', `/categories/${source.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: 'CATEGORY_IN_USE', details: { productCount: 1 } });
    expect((await admin.call('delete', `/categories/${source.id}?moveTo=${source.id}`)).body.code).toBe(
      'CATEGORY_MOVE_TARGET_INVALID',
    );
    expect((await admin.call('delete', `/categories/${source.id}?moveTo=${randomUUID()}`)).status).toBe(400);

    expect((await admin.call('delete', `/categories/${source.id}?moveTo=${target.id}`)).status).toBe(204);
    const moved = await data.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(moved.categoryId).toBe(target.id);
    const list = await admin.call('get', '/categories');
    expect(list.body.find((c: { id: string }) => c.id === target.id).productCount).toBe(1);
    expect(list.body.some((c: { id: string }) => c.id === source.id)).toBe(false);
  });
});

describe('Đơn vị tính', () => {
  it('CRUD, chống trùng tên và mô tả rỗng lưu null', async () => {
    const created = await admin.call('post', '/units', { name: `${data.run} Lốc`, description: '  ' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: `${data.run} Lốc`, description: null, productCount: 0 });

    const duplicate = await admin.call('post', '/units', { name: `${data.run} LOC` });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('UNIT_NAME_TAKEN');

    const renamed = await admin.call('patch', `/units/${created.body.id}`, { name: `${data.run} Lố` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe(`${data.run} Lố`);

    expect((await admin.call('patch', `/units/${created.body.id}`, {})).body.code).toBe('VALIDATION_ERROR');
    expect((await cashier.call('post', '/units', { name: `${data.run} Cấm` })).status).toBe(403);
    expect((await cashier.call('get', '/units')).status).toBe(200);
    expect((await admin.call('delete', `/units/${created.body.id}`)).status).toBe(204);
    expect((await admin.call('delete', `/units/${created.body.id}`)).body.code).toBe('UNIT_NOT_FOUND');
  });

  it('xóa đơn vị đang dùng phải chọn đơn vị thay thế', async () => {
    const { category, unit: source } = await data.catalog();
    const { unit: target } = await data.catalog();
    const product = await data.product(category.id, source.id);

    const blocked = await admin.call('delete', `/units/${source.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: 'UNIT_IN_USE', details: { productCount: 1 } });
    expect((await admin.call('delete', `/units/${source.id}?replaceWith=${source.id}`)).body.code).toBe(
      'UNIT_REPLACE_TARGET_INVALID',
    );

    expect((await admin.call('delete', `/units/${source.id}?replaceWith=${target.id}`)).status).toBe(204);
    const moved = await data.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(moved.unitId).toBe(target.id);
  });
});
