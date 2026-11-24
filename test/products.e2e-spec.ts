import { randomInt, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ean13CheckDigit } from '../src/modules/products/products.utils';
import { createTestApp, TestClient, TestData } from './support';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let app: NestFastifyApplication;
let data: TestData;
let manager: TestClient;
let cashier: TestClient;
let categoryId = '';
let unitId = '';

const ean13 = () => {
  const body = `20${String(randomInt(0, 10 ** 10)).padStart(10, '0')}`;
  return body + ean13CheckDigit(body);
};

const signIn = async (role: 'manager' | 'cashier') => {
  const user = await data.user(role);
  const client = new TestClient(app);
  await client.login(user.username);
  return client;
};

const createProduct = async (fields: Record<string, unknown> = {}) => {
  const res = await manager.call('post', '/products', {
    name: `${data.run} Sản phẩm ${randomInt(1000)}`,
    categoryId,
    unitId,
    price: 10000,
    costPrice: 7000,
    ...fields,
  });
  expect(res.status).toBe(201);
  return res.body as { id: string; sku: string; stock: number; [key: string]: unknown };
};

beforeAll(async () => {
  app = await createTestApp();
  data = TestData.for(app);
  manager = await signIn('manager');
  cashier = await signIn('cashier');
  ({
    category: { id: categoryId },
    unit: { id: unitId },
  } = await data.catalog());
});

afterAll(async () => {
  await data?.cleanup();
  await app?.close();
});

describe('Tạo sản phẩm', () => {
  it('tự sinh SKU, ghi tồn đầu kỳ và movement initial', async () => {
    const product = await createProduct({ initialStock: 48 });
    expect(product.sku).toMatch(/^SP\d{4,}$/);
    expect(product).toMatchObject({
      stock: 48,
      unitId,
      categoryId,
      costPrice: 7000,
      imageFit: 'auto',
      status: 'active',
    });
    const movement = await data.prisma.stockMovement.findFirst({
      where: { productId: product.id },
    });
    expect(movement).toMatchObject({
      type: 'initial',
      quantity: 48,
      before: 0,
      after: 48,
      reason: 'Tồn đầu kỳ',
    });
  });

  it('SKU viết hoa, trùng không phân biệt hoa thường; dùng lại được sau khi xóa', async () => {
    const sku = `T${randomInt(10 ** 8)}-a`;
    const first = await createProduct({ sku });
    expect(first.sku).toBe(sku.toUpperCase());
    const duplicate = await manager.call('post', '/products', {
      name: `${data.run} X`,
      sku: sku.toUpperCase(),
      categoryId,
      unitId,
      price: 1000,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('PRODUCT_SKU_TAKEN');

    expect((await manager.call('post', '/products/bulk-delete', { ids: [first.id] })).body).toEqual(
      { deleted: 1, withStock: 0 },
    );
    expect((await manager.call('get', `/products/${first.id}`)).status).toBe(404);
    expect((await createProduct({ sku })).sku).toBe(sku.toUpperCase());
  });

  it('kiểm tra mã vạch, giá gốc, danh mục và đơn vị', async () => {
    const barcode = ean13();
    const wrongDigit = barcode.slice(0, 12) + ((Number(barcode[12]) + 1) % 10);
    const post = (fields: Record<string, unknown>) =>
      manager.call('post', '/products', {
        name: `${data.run} Y`,
        categoryId,
        unitId,
        price: 10000,
        ...fields,
      });

    expect((await post({ barcode: wrongDigit })).body.code).toBe('PRODUCT_BARCODE_INVALID');
    expect((await post({ barcode: '123' })).body.code).toBe('PRODUCT_BARCODE_INVALID');
    await createProduct({ barcode });
    expect((await post({ barcode })).body.code).toBe('PRODUCT_BARCODE_TAKEN');
    expect((await post({ originalPrice: 10000 })).body.code).toBe('PRODUCT_ORIGINAL_PRICE_INVALID');
    expect((await post({ categoryId: randomUUID() })).body.code).toBe('PRODUCT_CATEGORY_INVALID');
    expect((await post({ unitId: randomUUID() })).body.code).toBe('PRODUCT_UNIT_INVALID');
    expect((await post({ price: 0 })).body.code).toBe('VALIDATION_ERROR');
  });
});

describe('Danh sách, thống kê, tra cứu', () => {
  let listCategory = '';

  beforeAll(async () => {
    listCategory = (await data.catalog()).category.id;
    await createProduct({
      name: `${data.run} Nước suối`,
      categoryId: listCategory,
      price: 6000,
      initialStock: 50,
    });
    await createProduct({
      name: `${data.run} Bánh quy`,
      categoryId: listCategory,
      price: 18000,
      initialStock: 5,
    });
    await createProduct({ name: `${data.run} Kẹo dẻo`, categoryId: listCategory, price: 12000 });
  });

  const list = (query: string) =>
    manager.call('get', `/products?categoryId=${listCategory}&${query}`);

  it('tìm không dấu, lọc tồn, sắp xếp và phân trang', async () => {
    const search = await list('keyword=NUOC%20suoi');
    expect(search.body.items.map((p: { name: string }) => p.name)).toEqual([
      `${data.run} Nước suối`,
    ]);
    expect((await list('stock=low')).body.items[0].name).toBe(`${data.run} Bánh quy`);
    expect((await list('stock=out')).body.items[0].name).toBe(`${data.run} Kẹo dẻo`);
    expect((await list('stock=in-stock')).body.total).toBe(2);
    expect(
      (await list('sort=price-asc')).body.items.map((p: { price: number }) => p.price),
    ).toEqual([6000, 12000, 18000]);
    expect((await list('sort=stock-asc')).body.items[0].stock).toBe(0);

    const page2 = await list('sort=name&page=2&pageSize=2');
    expect(page2.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page2.body.items).toHaveLength(1);
    expect((await list('pageSize=101')).status).toBe(400);
  });

  it('thống kê theo danh mục', async () => {
    const stats = await manager.call('get', `/products/stats?categoryId=${listCategory}`);
    expect(stats.body).toEqual({
      total: 3,
      active: 3,
      inventoryValue: 55 * 7000,
      inventoryUnits: 55,
      low: 1,
      out: 1,
    });
  });

  it('tra cứu theo mã vạch hoặc SKU', async () => {
    const barcode = ean13();
    const product = await createProduct({ barcode });
    expect((await cashier.call('get', `/products/lookup?code=${barcode}`)).body.id).toBe(
      product.id,
    );
    expect(
      (await cashier.call('get', `/products/lookup?code=${product.sku.toLowerCase()}`)).body.id,
    ).toBe(product.id);
    expect((await cashier.call('get', '/products/lookup?code=00000000')).body.code).toBe(
      'PRODUCT_NOT_FOUND',
    );
  });
});

describe('Cập nhật', () => {
  it('sửa tồn ghi movement điều chỉnh đúng before/after', async () => {
    const product = await createProduct({ initialStock: 50 });
    const res = await manager.call('patch', `/products/${product.id}`, { stock: 30, price: 12000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stock: 30, price: 12000 });
    expect((await manager.call('patch', `/products/${product.id}`, { stock: 30 })).status).toBe(
      200,
    );
    const movements = await data.prisma.stockMovement.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(
      movements.map(({ type, quantity, before, after }) => ({ type, quantity, before, after })),
    ).toEqual([
      { type: 'initial', quantity: 50, before: 0, after: 50 },
      { type: 'adjust_out', quantity: -20, before: 50, after: 30 },
    ]);
    expect(
      (await manager.call('patch', `/products/${product.id}`, { originalPrice: 11000 })).body.code,
    ).toBe('PRODUCT_ORIGINAL_PRICE_INVALID');
  });

  it('đổi trạng thái và xóa hàng loạt, bỏ qua id không tồn tại', async () => {
    const a = await createProduct({ initialStock: 3 });
    const b = await createProduct();
    const status = await manager.call('patch', '/products/status', {
      ids: [a.id, b.id, randomUUID()],
      status: 'inactive',
    });
    expect(status.body).toEqual({ updated: 2 });
    const removed = await manager.call('post', '/products/bulk-delete', {
      ids: [a.id, b.id, randomUUID()],
    });
    expect(removed.body).toEqual({ deleted: 2, withStock: 1 });
    expect((await manager.call('post', '/products/bulk-delete', { ids: [] })).status).toBe(400);
  });
});

describe('Phân quyền và POS', () => {
  it('thu ngân không thấy giá vốn và không được ghi', async () => {
    const product = await createProduct();
    const res = await cashier.call('get', `/products/${product.id}`);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('costPrice');
    const options = await cashier.call('get', `/products/options?ids=${product.id}`);
    expect(options.body).toHaveLength(1);
    expect(options.body[0]).not.toHaveProperty('costPrice');
    expect(
      (await manager.call('get', `/products/options?ids=${product.id}`)).body[0].costPrice,
    ).toBe(7000);
    expect(
      (await cashier.call('post', '/products', { name: 'x', categoryId, unitId, price: 1 })).status,
    ).toBe(403);
  });

  it('/sellable ẩn sản phẩm ngừng bán và sản phẩm thuộc danh mục ngừng hoạt động', async () => {
    const { category } = await data.catalog();
    const visible = await createProduct({ categoryId: category.id });
    const inactive = await createProduct({ status: 'inactive' });
    const ids = async () =>
      (await cashier.call('get', '/products/sellable')).body.map((p: { id: string }) => p.id);

    expect(await ids()).toEqual(expect.arrayContaining([visible.id]));
    expect(await ids()).not.toContain(inactive.id);
    await data.prisma.category.update({ where: { id: category.id }, data: { status: 'inactive' } });
    expect(await ids()).not.toContain(visible.id);
  });
});

describe('Upload ảnh', () => {
  it('từ chối file không phải ảnh, nhận PNG và trả WebP', async () => {
    const bad = await manager.upload(
      '/uploads/images',
      Buffer.from('not an image at all'),
      'image.png',
    );
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('IMAGE_INVALID');
    expect((await cashier.upload('/uploads/images', PNG_1X1, 'a.png')).status).toBe(403);

    const ok = await manager.upload('/uploads/images', PNG_1X1, 'pixel.png');
    expect(ok.status).toBe(201);
    expect(ok.body.url).toMatch(/^\/api\/uploads\/files\/[0-9a-f-]{36}\.webp$/);
    const file = await manager.call('get', ok.body.url.replace(/^\/api/, ''));
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/webp');
    expect(file.headers['cache-control']).toContain('immutable');
  });
});
