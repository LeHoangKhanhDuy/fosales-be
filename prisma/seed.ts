import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/common/security/password';
import { toNameKey } from '../src/common/utils/text';
import { formatSku, productSearchKey } from '../src/modules/products/products.utils';
import { CATEGORIES, PRODUCTS, UNITS } from './seed-data';
import { seedHistory } from './seed-history';

const DEV_PASSWORD = '123456';

const USERS: { username: string; name: string; role: Role; phone: string }[] = [
  { username: 'admin', name: 'Khánh Duy', role: 'admin', phone: '0909000111' },
  { username: 'quanly', name: 'Quốc Huy', role: 'manager', phone: '0909000222' },
  { username: 'thungan', name: 'Minh Thư', role: 'cashier', phone: '0909000333' },
];

const prisma = new PrismaClient();

async function seedCatalog() {
  const units = new Map<string, string>();
  for (const name of UNITS) {
    const nameKey = toNameKey(name);
    const unit = await prisma.unit.upsert({
      where: { nameKey },
      update: {},
      create: { name, nameKey },
    });
    units.set(name, unit.id);
  }
  const categories = new Map<string, string>();
  for (const [index, { key, ...category }] of CATEGORIES.entries()) {
    const nameKey = toNameKey(category.name);
    const data = { ...category, nameKey, sortOrder: index + 1 };
    const row = await prisma.category.upsert({ where: { nameKey }, update: data, create: data });
    categories.set(key, row.id);
  }
  return { units, categories };
}

async function seedProducts(
  storeId: string,
  { units, categories }: Awaited<ReturnType<typeof seedCatalog>>,
) {
  let created = 0;
  for (const [index, item] of PRODUCTS.entries()) {
    const seq = index + 1;
    const sku = formatSku(seq);
    if (await prisma.product.findUnique({ where: { skuKey: sku }, select: { id: true } })) continue;
    const { stock, category, unit, ...rest } = item;
    await prisma.product.create({
      data: {
        ...rest,
        sku,
        skuKey: sku,
        barcodeKey: item.barcode,
        searchKey: productSearchKey(item.name, sku, item.barcode),
        categoryId: categories.get(category),
        unitId: units.get(unit),
        costPrice: Math.round((item.price * (0.68 + ((seq * 7) % 13) / 100)) / 100) * 100,
        createdAt: new Date(Date.UTC(2026, 8, 1 + seq * 2, 3)),
        stocks: { create: { storeId, quantity: stock } },
      },
    });
    created += 1;
  }
  return created;
}

async function main() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Seed chỉ được chạy khi NODE_ENV=development');
  }
  const store = await prisma.store.upsert({
    where: { code: 'hcm-01' },
    update: { name: 'FoTech Mart Quận 1', status: 'active' },
    create: { code: 'hcm-01', name: 'FoTech Mart Quận 1' },
  });
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const users = new Map<string, string>();
  for (const user of USERS) {
    const data = { ...user, storeId: store.id, passwordHash };
    const row = await prisma.user.upsert({
      where: { username: user.username },
      update: { ...data, status: 'active', failedLoginCount: 0, lockedUntil: null },
      create: data,
    });
    users.set(user.username, row.id);
  }
  const catalog = await seedCatalog();
  const products = await seedProducts(store.id, catalog);
  const skus = PRODUCTS.map((_, index) => formatSku(index + 1));
  const history = await seedHistory(prisma, store.id, skus, {
    admin: users.get('admin') ?? '',
    manager: users.get('quanly') ?? '',
    cashier: users.get('thungan') ?? '',
  });
  console.log(
    `Seed xong: store ${store.code}, ${USERS.length} tài khoản (mật khẩu ${DEV_PASSWORD}), ` +
      `${UNITS.length} đơn vị, ${CATEGORIES.length} danh mục, thêm ${products}/${PRODUCTS.length} sản phẩm, lịch sử kho cho ${history} sản phẩm`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
