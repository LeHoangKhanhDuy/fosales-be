import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GoodsReceiptListQueryDto } from './dto/purchase-query.dto';
import { receiptInclude, toReceipt } from './purchase-order.mapper';
import { PurchaseErrors } from './purchasing.errors';

const listSelect = {
  id: true,
  code: true,
  poId: true,
  receivedAt: true,
  supplierId: true,
  supplierDocNo: true,
  packageCount: true,
  packagingOk: true,
  deliveredBy: true,
  note: true,
  approvedBy: true,
  grossValue: true,
  discount: true,
  value: true,
  receivedBy: { select: { name: true } },
  po: { select: { code: true } },
  supplier: { select: { name: true } },
} satisfies Prisma.GoodsReceiptSelect;

@Injectable()
export class GoodsReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string, query: GoodsReceiptListQueryDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.GoodsReceiptWhereInput = {
      storeId,
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.poId ? { poId: query.poId } : {}),
      ...(query.from || query.to
        ? {
            receivedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(keyword
        ? {
            OR: [
              { code: { contains: keyword, mode: 'insensitive' } },
              { supplierDocNo: { contains: keyword, mode: 'insensitive' } },
              { po: { code: { contains: keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where,
        select: listSelect,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);
    return {
      items: rows.map(({ receivedBy, po, supplier, ...row }) => ({
        ...row,
        receivedBy: receivedBy.name,
        poCode: po.code,
        supplierName: supplier.name,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(storeId: string, id: string) {
    const row = await this.prisma.goodsReceipt.findFirst({
      where: { id, storeId },
      include: {
        ...receiptInclude,
        po: { select: { code: true } },
        supplier: { select: { name: true, code: true, address: true, taxCode: true, phone: true } },
      },
    });
    if (!row) throw PurchaseErrors.receiptNotFound();
    const { name, ...supplier } = row.supplier;
    return {
      ...toReceipt(row),
      poId: row.poId,
      poCode: row.po.code,
      supplierId: row.supplierId,
      supplierName: name,
      supplier,
    };
  }
}
