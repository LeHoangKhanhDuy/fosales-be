import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { CustomerCommandsService } from '../src/modules/customers/customer-commands.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { MembershipService } from '../src/modules/customers/membership.service';
import { PointLedger } from '../src/modules/customers/point-ledger.service';

type Gender = 'male' | 'female' | 'other';

interface SeedCustomer {
  name: string;
  phone: string;
  gender: Gender;
  birthday: string;
  email?: string;
  address?: string;
  note?: string;
  blocked?: boolean;
  legacySpent: number;
  createdDaysAgo: number;
}

const CUSTOMERS: SeedCustomer[] = [
  {
    name: 'Nguyễn Minh Anh',
    phone: '0901234567',
    gender: 'female',
    birthday: '1979-11-11',
    email: 'minhanh@gmail.com',
    address: 'Q.1, TP.HCM',
    legacySpent: 3200000,
    createdDaysAgo: 301,
  },
  {
    name: 'Trần Quốc Bảo',
    phone: '0912345678',
    gender: 'male',
    birthday: '1976-02-27',
    address: 'Q.1, TP.HCM',
    legacySpent: 900000,
    createdDaysAgo: 293,
  },
  {
    name: 'Lê Thu Hà',
    phone: '0987654321',
    gender: 'female',
    birthday: '1972-09-07',
    email: 'thuha@gmail.com',
    address: 'Q. Tân Bình, TP.HCM',
    legacySpent: 9500000,
    createdDaysAgo: 222,
  },
  {
    name: 'Phạm Gia Huy',
    phone: '0934567890',
    gender: 'male',
    birthday: '1985-07-03',
    email: 'giahuy@gmail.com',
    address: 'Q. Tân Bình, TP.HCM',
    legacySpent: 0,
    createdDaysAgo: 223,
  },
  {
    name: 'Võ Ngọc Trâm',
    phone: '0978123456',
    gender: 'female',
    birthday: '1977-01-27',
    address: 'Q.1, TP.HCM',
    legacySpent: 4100000,
    createdDaysAgo: 257,
  },
  {
    name: 'Đặng Hoàng Long',
    phone: '0868987654',
    gender: 'male',
    birthday: '1995-11-19',
    email: 'hoanglong@gmail.com',
    address: 'Q. Bình Thạnh, TP.HCM',
    legacySpent: 1600000,
    createdDaysAgo: 212,
  },
  {
    name: 'Bùi Thanh Tâm',
    phone: '0908246281',
    gender: 'female',
    birthday: '1981-10-10',
    email: 'thanhtam@gmail.com',
    address: 'Q. Bình Thạnh, TP.HCM',
    legacySpent: 250000,
    createdDaysAgo: 62,
  },
  {
    name: 'Hoàng Đức Thịnh',
    phone: '0951819093',
    gender: 'male',
    birthday: '1997-08-22',
    note: 'Khách sỉ, hay mua theo thùng',
    legacySpent: 7200000,
    createdDaysAgo: 170,
  },
  {
    name: 'Ngô Phương Linh',
    phone: '0997543231',
    gender: 'female',
    birthday: '2001-10-10',
    email: 'phuonglinh@gmail.com',
    legacySpent: 1100000,
    createdDaysAgo: 185,
  },
  {
    name: 'Đỗ Văn Khánh',
    phone: '0949118625',
    gender: 'male',
    birthday: '1996-03-16',
    email: 'vankhanh@gmail.com',
    address: 'Q.3, TP.HCM',
    legacySpent: 0,
    createdDaysAgo: 30,
  },
  {
    name: 'Huỳnh Mỹ Duyên',
    phone: '0989555979',
    gender: 'female',
    birthday: '1999-11-26',
    address: 'Q.3, TP.HCM',
    legacySpent: 2900000,
    createdDaysAgo: 45,
  },
  {
    name: 'Phan Tuấn Kiệt',
    phone: '0947104974',
    gender: 'male',
    birthday: '1992-12-13',
    email: 'tuankiet@gmail.com',
    legacySpent: 500000,
    createdDaysAgo: 21,
  },
  {
    name: 'Vũ Hải Yến',
    phone: '0952917034',
    gender: 'female',
    birthday: '1985-03-24',
    email: 'haiyen@gmail.com',
    address: 'Q. Tân Bình, TP.HCM',
    note: 'Thường giao hàng tận nhà',
    legacySpent: 12800000,
    createdDaysAgo: 213,
  },
  {
    name: 'Trương Minh Quân',
    phone: '0971276842',
    gender: 'male',
    birthday: '1987-07-28',
    address: 'Q. Tân Bình, TP.HCM',
    legacySpent: 180000,
    createdDaysAgo: 371,
  },
  {
    name: 'Lý Bảo Ngọc',
    phone: '0956321223',
    gender: 'female',
    birthday: '1970-11-08',
    email: 'baongoc@gmail.com',
    address: 'Q.7, TP.HCM',
    legacySpent: 0,
    createdDaysAgo: 258,
  },
  {
    name: 'Mai Xuân Trường',
    phone: '0944026859',
    gender: 'male',
    birthday: '1990-11-19',
    email: 'xuantruong@gmail.com',
    address: 'Q.1, TP.HCM',
    legacySpent: 3600000,
    createdDaysAgo: 74,
  },
  {
    name: 'Đinh Khánh Vy',
    phone: '0978666617',
    gender: 'female',
    birthday: '1973-11-13',
    address: 'Q.3, TP.HCM',
    legacySpent: 700000,
    createdDaysAgo: 107,
  },
  {
    name: 'Tạ Công Danh',
    phone: '0937215901',
    gender: 'male',
    birthday: '1979-01-19',
    email: 'congdanh@gmail.com',
    address: 'Q.3, TP.HCM',
    blocked: true,
    legacySpent: 0,
    createdDaysAgo: 284,
  },
  {
    name: 'Lâm Gia Hân',
    phone: '0959013962',
    gender: 'female',
    birthday: '1992-11-09',
    email: 'giahan@gmail.com',
    address: 'TP. Thủ Đức',
    legacySpent: 5400000,
    createdDaysAgo: 318,
  },
  {
    name: 'Châu Nhật Nam',
    phone: '0971177774',
    gender: 'male',
    birthday: '1976-02-05',
    address: 'TP. Thủ Đức',
    legacySpent: 90000,
    createdDaysAgo: 393,
  },
  {
    name: 'Kiều Thảo My',
    phone: '0947280385',
    gender: 'female',
    birthday: '1971-11-05',
    email: 'thaomy@gmail.com',
    address: 'Q. Phú Nhuận, TP.HCM',
    legacySpent: 1500000,
    createdDaysAgo: 398,
  },
  {
    name: 'Hồ Quang Vinh',
    phone: '0914852538',
    gender: 'male',
    birthday: '2002-09-25',
    email: 'quangvinh@gmail.com',
    address: 'Q. Bình Thạnh, TP.HCM',
    legacySpent: 0,
    createdDaysAgo: 9,
  },
  {
    name: 'Dương Tú Anh',
    phone: '0936338750',
    gender: 'female',
    birthday: '1987-01-26',
    address: 'Q. Phú Nhuận, TP.HCM',
    legacySpent: 2200000,
    createdDaysAgo: 251,
  },
  {
    name: 'Cao Thành Đạt',
    phone: '0939575513',
    gender: 'male',
    birthday: '2000-02-08',
    email: 'thanhdat@gmail.com',
    address: 'Q. Bình Thạnh, TP.HCM',
    legacySpent: 0,
    createdDaysAgo: 12,
  },
];

const CLIENT = { ip: '127.0.0.1', userAgent: 'seed' };
const DAY_MS = 86_400_000;

export async function seedCustomers(prisma: PrismaClient, storeId: string, adminId: string) {
  const db = prisma as unknown as PrismaService;
  const ledger = new PointLedger();
  const membership = new MembershipService(db, ledger);
  const settings = await membership.settings();
  if (await prisma.customer.count()) return 0;
  const customers = new CustomersService(db, membership);
  const commands = new CustomerCommandsService(
    db,
    customers,
    membership,
    ledger,
    new AuditService(db),
  );
  const admin = { id: adminId, role: 'admin' as const, storeId, sid: 'seed' };
  const ordered = [...CUSTOMERS].sort((a, b) => b.createdDaysAgo - a.createdDaysAgo);
  for (const { blocked, createdDaysAgo, ...item } of ordered) {
    const created = await commands.create(
      admin,
      {
        ...item,
        status: blocked ? 'blocked' : 'active',
        openingPoints: blocked ? 0 : Math.floor(item.legacySpent / settings.amountPerPoint),
      },
      CLIENT,
    );
    const at = new Date(Date.now() - createdDaysAgo * DAY_MS);
    await prisma.$executeRaw`UPDATE customers SET created_at = ${at} WHERE id = ${created.id}::uuid`;
    await prisma.$executeRaw`UPDATE point_logs SET created_at = ${at} WHERE customer_id = ${created.id}::uuid`;
  }
  return CUSTOMERS.length;
}
