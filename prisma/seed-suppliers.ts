import type { PrismaClient, SupplierStatus } from '@prisma/client';
import { toNameKey } from '../src/common/utils/text';
import { supplierSearchKey } from '../src/modules/suppliers/suppliers.utils';

const DAY = 86_400_000;

interface SeedSupplier {
  code: string;
  name: string;
  contact: string;
  phone: string;
  email?: string;
  address: string;
  taxCode?: string;
  categories: string[];
  paymentTermDays: number;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
  note?: string;
  status: SupplierStatus;
  suspendReason?: string;
  suspendedInDays?: number;
  createdDaysAgo: number;
}

const SUPPLIERS: SeedSupplier[] = [
  {
    code: 'NCC001',
    name: 'Công ty TNHH Phân phối Minh Phát',
    contact: 'Anh Tuấn',
    phone: '0903112233',
    email: 'order@minhphat.vn',
    address: '128 Cộng Hòa, P.4, Q. Tân Bình, TP.HCM',
    taxCode: '0312456789',
    categories: ['drinks', 'snacks'],
    paymentTermDays: 15,
    bankName: 'Vietcombank',
    bankAccount: '0071000123456',
    bankHolder: 'CONG TY TNHH PHAN PHOI MINH PHAT',
    status: 'active',
    createdDaysAgo: 240,
  },
  {
    code: 'NCC002',
    name: 'Nhà phân phối Sữa Việt',
    contact: 'Chị Hạnh',
    phone: '0918445566',
    email: 'hanh.nguyen@suaviet.com.vn',
    address: '45 Nguyễn Thị Thập, Q. 7, TP.HCM',
    taxCode: '0309876543',
    categories: ['dairy'],
    paymentTermDays: 7,
    bankName: 'Techcombank',
    bankAccount: '19033445566011',
    bankHolder: 'NPP SUA VIET',
    status: 'active',
    createdDaysAgo: 200,
  },
  {
    code: 'NCC003',
    name: 'Tổng kho Bánh kẹo Hòa Bình',
    contact: 'Anh Khoa',
    phone: '0938778899',
    address: 'Lô B2 KCN Tân Tạo, Q. Bình Tân, TP.HCM',
    taxCode: '0314567890',
    categories: ['snacks', 'instant'],
    paymentTermDays: 30,
    bankName: 'ACB',
    bankAccount: '2468013579',
    bankHolder: 'TONG KHO BANH KEO HOA BINH',
    status: 'active',
    createdDaysAgo: 180,
  },
  {
    code: 'NCC004',
    name: 'Vựa trái cây Xanh Tươi',
    contact: 'Cô Lan',
    phone: '0977223344',
    address: 'Chợ đầu mối Thủ Đức, TP. Thủ Đức',
    categories: ['fruit'],
    paymentTermDays: 0,
    note: 'Thanh toán tiền mặt khi nhận hàng',
    status: 'suspended',
    suspendReason: 'Giao hàng trễ nhiều lần',
    suspendedInDays: 10,
    createdDaysAgo: 120,
  },
  {
    code: 'NCC005',
    name: 'Công ty CP Hóa mỹ phẩm Sạch',
    contact: 'Anh Long',
    phone: '0909556677',
    email: 'sales@hoamyphamsach.vn',
    address: 'KCN Tân Tạo, Q. Bình Tân, TP.HCM',
    taxCode: '0315678901',
    categories: ['household', 'personal'],
    paymentTermDays: 7,
    bankName: 'BIDV',
    bankAccount: '31410000998877',
    bankHolder: 'CTCP HOA MY PHAM SACH',
    status: 'active',
    createdDaysAgo: 90,
  },
  {
    code: 'NCC006',
    name: 'Công ty TNHH Gạo Ngọc Mekong',
    contact: 'Chị Thảo',
    phone: '0934667788',
    address: 'QL1A, H. Châu Thành, Long An',
    taxCode: '1101234567',
    categories: ['instant'],
    paymentTermDays: 30,
    status: 'active',
    createdDaysAgo: 12,
  },
  {
    code: 'NCC007',
    name: 'Đại lý Nước đá Phương Nam',
    contact: 'Anh Bình',
    phone: '0961334455',
    address: 'Q. 8, TP.HCM',
    categories: ['frozen'],
    paymentTermDays: 0,
    note: 'Ngừng do chất lượng đá không đảm bảo vệ sinh',
    status: 'inactive',
    createdDaysAgo: 300,
  },
];

export const STORE_INFO = {
  address: '12 Nguyễn Huệ, P. Bến Nghé, Q. 1, TP.HCM',
  phone: '02838123456',
  taxCode: '0316789012',
  receiptFooter: 'Đổi/trả trong 7 ngày, kèm hóa đơn và sản phẩm còn nguyên tem',
};

export async function seedSuppliers(prisma: PrismaClient, categories: Map<string, string>) {
  let created = 0;
  for (const item of SUPPLIERS) {
    if (await prisma.supplier.findUnique({ where: { code: item.code }, select: { id: true } }))
      continue;
    const { categories: keys, suspendedInDays, createdDaysAgo, ...fields } = item;
    await prisma.supplier.create({
      data: {
        ...fields,
        nameKey: toNameKey(item.name),
        searchKey: supplierSearchKey(item),
        suspendedUntil: suspendedInDays ? new Date(Date.now() + suspendedInDays * DAY) : null,
        createdAt: new Date(Date.now() - createdDaysAgo * DAY),
        categories: {
          createMany: {
            data: keys.flatMap((key) => {
              const categoryId = categories.get(key);
              return categoryId ? [{ categoryId }] : [];
            }),
          },
        },
      },
    });
    created += 1;
  }
  return { created, total: SUPPLIERS.length };
}
