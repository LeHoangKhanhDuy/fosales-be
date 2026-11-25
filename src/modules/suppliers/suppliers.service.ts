import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LedgerQueryDto,
  PageDto,
  SupplierListQueryDto,
  SupplierOptionsQueryDto,
} from './dto/supplier-query.dto';
import { paymentInclude, supplierSelect, toPayment, toSupplierItem } from './supplier.mapper';
import { ledgerEntrySelect, toLedgerEntry } from './supplier-ledger.service';
import { SupplierErrors } from './suppliers.errors';
import {
  reactivateExpiredSql,
  supplierPageSql,
  supplierStatsSql,
  supplierSummarySql,
  tabCountsSql,
  topProductsSql,
  type SummaryRow,
  type TopProductRow,
  type SupplierStatsRow,
  type TabCountsRow,
} from './suppliers.query';
import { formatSupplierCode, money } from './suppliers.utils';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SupplierListQueryDto) {
    await this.reactivateExpired();
    const filter = { keyword: query.keyword, categoryId: query.categoryId };
    const skip = (query.page - 1) * query.pageSize;
    const [[counts], rows] = await Promise.all([
      this.prisma.$queryRaw<TabCountsRow[]>(tabCountsSql(filter, query.tab)),
      this.prisma.$queryRaw<SummaryRow[]>(
        supplierPageSql(filter, query.sort, query.pageSize, skip, query.tab),
      ),
    ]);
    const { total, ...tabCounts } = counts;
    return {
      items: await this.items(rows),
      total,
      page: query.page,
      pageSize: query.pageSize,
      tabCounts,
    };
  }

  async stats() {
    await this.reactivateExpired();
    const [row] = await this.prisma.$queryRaw<SupplierStatsRow[]>(supplierStatsSql());
    return {
      total: row.total,
      active: row.active,
      suspended: row.suspended,
      purchased30: money(row.purchased30),
      openOrders: row.openOrders,
      debt: money(row.debt),
      debtors: row.debtors,
      overdue: money(row.overdue),
      overdueCount: row.overdueCount,
    };
  }

  async options({ status, categoryId }: SupplierOptionsQueryDto) {
    await this.reactivateExpired();
    const rows = await this.prisma.supplier.findMany({
      where: { status, ...(categoryId ? { categories: { some: { categoryId } } } : {}) },
      select: {
        id: true,
        code: true,
        name: true,
        paymentTermDays: true,
        status: true,
        categories: { select: { categoryId: true } },
      },
      orderBy: [{ nameKey: 'asc' }, { id: 'asc' }],
    });
    return rows.map(({ categories, ...row }) => ({
      ...row,
      categoryIds: categories.map((c) => c.categoryId),
    }));
  }

  async nextCode(client: Prisma.TransactionClient = this.prisma) {
    const [{ max }] = await client.$queryRaw<{ max: number }[]>`
      SELECT COALESCE(max(substring(code FROM 4)::int), 0)::int AS max
      FROM suppliers WHERE code ~ '^NCC[0-9]{1,9}$'`;
    return formatSupplierCode(max + 1);
  }

  async get(id: string) {
    await this.reactivateExpired();
    const [item] = await this.items(
      await this.prisma.$queryRaw<SummaryRow[]>(supplierSummarySql([id])),
    );
    if (!item) throw SupplierErrors.notFound();
    return item;
  }

  async ledger(id: string, query: LedgerQueryDto) {
    await this.assertExists(id);
    const where: Prisma.SupplierLedgerEntryWhereInput = {
      supplierId: id,
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supplierLedgerEntry.findMany({
        where,
        select: ledgerEntrySelect,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierLedgerEntry.count({ where }),
    ]);
    return { items: rows.map(toLedgerEntry), total, page: query.page, pageSize: query.pageSize };
  }

  async payments(id: string, query: PageDto) {
    await this.assertExists(id);
    const where = { supplierId: id };
    const [rows, total] = await Promise.all([
      this.prisma.supplierPayment.findMany({
        where,
        include: paymentInclude,
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);
    return { items: rows.map(toPayment), total, page: query.page, pageSize: query.pageSize };
  }

  async topProducts(id: string, limit: number) {
    await this.assertExists(id);
    const rows = await this.prisma.$queryRaw<TopProductRow[]>(topProductsSql(id, limit));
    if (!rows.length) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((row) => row.productId) } },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        categoryId: true,
        image: true,
        imageFit: true,
        unit: { select: { name: true } },
      },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    return rows.flatMap((row) => {
      const product = byId.get(row.productId);
      if (!product) return [];
      return [
        {
          productId: row.productId,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          unit: product.unit?.name ?? '',
          categoryId: product.categoryId ?? '',
          image: product.image,
          imageFit: product.imageFit,
          qty: row.qty,
          value: money(row.value),
          lastCost: row.lastCost,
          lastReceivedAt: row.lastAt,
        },
      ];
    });
  }

  private async assertExists(id: string) {
    if (!(await this.prisma.supplier.count({ where: { id } }))) throw SupplierErrors.notFound();
  }

  reactivateExpired() {
    return this.prisma.$executeRaw(reactivateExpiredSql());
  }

  private async items(rows: SummaryRow[]) {
    if (!rows.length) return [];
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      select: supplierSelect,
    });
    const byId = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
    return rows.flatMap(({ id, ...summary }) => {
      const supplier = byId.get(id);
      return supplier ? [toSupplierItem(supplier, summary)] : [];
    });
  }
}
