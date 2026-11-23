import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/common/security/password';

const DEV_PASSWORD = '123456';

const USERS: { username: string; name: string; role: Role; phone: string }[] = [
  { username: 'admin', name: 'Khánh Duy', role: 'admin', phone: '0909000111' },
  { username: 'quanly', name: 'Quốc Huy', role: 'manager', phone: '0909000222' },
  { username: 'thungan', name: 'Minh Thư', role: 'cashier', phone: '0909000333' },
];

const prisma = new PrismaClient();

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
  console.log(
    `Seed xong: store ${store.code}, ${USERS.length} tài khoản (mật khẩu ${DEV_PASSWORD})`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
