import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PurchaseOrderListQueryDto, SuggestionQueryDto } from './dto/purchase-query.dto';
import {
  itemProductSelect,
  orderInclude,
  orderListInclude,
  toItemProduct,
  toOrder,
  toOrderListItem,
} from './purchase-order.mapper';
import {
  purchasePageSql,
  purchaseSummarySql,
  purchaseTabCountsSql,
  suggestionsSql,
  type SuggestionRow,
  type TabCountsRow,
} from './purchase-orders.query';
import { PurchaseErrors } from './purchasing.errors';
import { packSizeFor } from './purchasing.utils';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string, query: PurchaseOrderListQueryDto) {
    const filter = {
      storeId,
      keyword: query.keyword,
      supplierId: query.supplierId,
      overdue: query.overdue,
      from: query.from,
      to: query.to,
    };
    const [[counts], rows] = await Promise.all([
      this.prisma.$queryRaw<TabCountsRow[]>(purchaseTabCountsSql(filter, query.tab)),
      this.prisma.$queryRaw<{ id: string }[]>(
        purchasePageSql(filter, query.tab, query.pageSize, (query.page - 1) * query.pageSize),
      ),
    ]);
    const { total, ...tabCounts } = counts;
    const ids = rows.map((row) => row.id);
    const orders = ids.length
      ? await this.prisma.purchaseOrder.findMany({
          where: { id: { in: ids } },
          include: orderListInclude,
        })
      : [];
    const byId = new Map(orders.map((order) => [order.id, order]));
    return {
      items: ids.flatMap((id) => {
        const order = byId.get(id);
        return order ? [toOrderListItem(order)] : [];
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
      tabCounts,
    };
  }

  async summary(storeId: string) {
    const [row] = await this.prisma.$queryRaw<
      { open: number; overdue: number; receiving: number; draft: number }[]
    >(purchaseSummarySql(storeId));
    return row;
  }

  async suggestions(storeId: string, { supplierId, limit }: SuggestionQueryDto) {
    const rows = await this.prisma.$queryRaw<SuggestionRow[]>(
      suggestionsSql(storeId, supplierId, limit),
    );
    if (!rows.length) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      select: { ...itemProductSelect, id: true, price: true, costPrice: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    return rows.flatMap((row) => {
      const product = byId.get(row.id);
      if (!product) return [];
      return [
        {
          ...toItemProduct(product.id, product),
          orderedQty: Math.max(row.minStock * 3 - row.stock, row.minStock, 1),
          unitCost: row.lastCost ?? product.costPrice ?? Math.round(product.price * 0.75),
          packSize: packSizeFor(product.unit?.name),
          receivedQty: 0,
          damagedQty: 0,
          stock: row.stock,
          minStock: row.minStock,
        },
      ];
    });
  }

  async get(storeId: string, id: string) {
    const row = await this.prisma.purchaseOrder.findFirst({
      where: { id, storeId },
      include: orderInclude,
    });
    if (!row) throw PurchaseErrors.notFound();
    return toOrder(row);
  }

  async listItem(storeId: string, id: string) {
    const row = await this.prisma.purchaseOrder.findFirst({
      where: { id, storeId },
      include: orderListInclude,
    });
    if (!row) throw PurchaseErrors.notFound();
    return toOrderListItem(row);
  }
}
