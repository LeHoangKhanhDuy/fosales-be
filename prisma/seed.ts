import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/common/security/password';
import { toNameKey } from '../src/common/utils/text';

const DEV_PASSWORD = '123456';

const USERS: { username: string; name: string; role: Role; phone: string }[] = [
  { username: 'admin', name: 'Khánh Duy', role: 'admin', phone: '0909000111' },
  { username: 'quanly', name: 'Quốc Huy', role: 'manager', phone: '0909000222' },
  { username: 'thungan', name: 'Minh Thư', role: 'cashier', phone: '0909000333' },
];

const UNITS = ['Cái', 'Chai', 'Lon', 'Hộp', 'Gói', 'Lốc', 'Túi', 'Hũ', 'Tuýp', 'Kg', 'Thùng'];

const CATEGORIES = [
  { name: 'Đồ uống', icon: 'cup-soda', color: 'sky', description: 'Nước ngọt, nước suối, trà đóng chai' },
  { name: 'Cà phê & Trà', icon: 'coffee', color: 'amber', description: null },
  { name: 'Sữa', icon: 'milk', color: 'indigo', description: 'Sữa tươi, sữa chua, sữa hộp' },
  { name: 'Bánh kẹo', icon: 'cookie', color: 'orange', description: null },
  { name: 'Mì & Đồ khô', icon: 'wheat', color: 'lime', description: null },
  { name: 'Hóa mỹ phẩm', icon: 'sparkles', color: 'pink', description: null },
];

const prisma = new PrismaClient();

async function seedCatalog() {
  for (const name of UNITS) {
    const nameKey = toNameKey(name);
    await prisma.unit.upsert({ where: { nameKey }, update: {}, create: { name, nameKey } });
  }
  for (const [index, category] of CATEGORIES.entries()) {
    const nameKey = toNameKey(category.name);
    await prisma.category.upsert({
      where: { nameKey },
      update: {},
      create: { ...category, nameKey, sortOrder: index + 1 },
    });
  }
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
  for (const user of USERS) {
    const data = { ...user, storeId: store.id, passwordHash };
    await prisma.user.upsert({
      where: { username: user.username },
      update: { ...data, status: 'active', failedLoginCount: 0, lockedUntil: null },
      create: data,
    });
  }
  await seedCatalog();
  console.log(
    `Seed xong: store ${store.code}, ${USERS.length} tài khoản (mật khẩu ${DEV_PASSWORD}), ${UNITS.length} đơn vị, ${CATEGORIES.length} danh mục`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
