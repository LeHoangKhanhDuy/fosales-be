import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { productInclude } from '../products/product.mapper';
import { InventoryListQueryDto } from './dto/inventory-query.dto';
import { InventoryErrors } from './inventory.errors';
import { buildStockSeries, seriesStart, toInventoryItem } from './inventory.mapper';
import {
  inventoryCountsSql,
  inventoryPageSql,
  inventoryStatsSql,
  type InventoryRow,
  type InventoryStatsRow,
  type LevelCountsRow,
} from './inventory.query';
import { MovementsService } from './movements.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movements: MovementsService,
  ) {}

  async list(storeId: string, query: InventoryListQueryDto) {
    const filter = { storeId, keyword: query.keyword, categoryId: query.categoryId };
    const skip = (query.page - 1) * query.pageSize;
    const [[counts], rows] = await Promise.all([
      this.prisma.$queryRaw<LevelCountsRow[]>(inventoryCountsSql(filter, query.level)),
      this.prisma.$queryRaw<InventoryRow[]>(
        inventoryPageSql(filter, query.sort, query.pageSize, skip, query.level),
      ),
    ]);
    const { total, ...levelCounts } = counts;
    return {
      items: await this.items(storeId, rows),
      total,
      page: query.page,
      pageSize: query.pageSize,
      levelCounts,
    };
  }

  async stats(storeId: string) {
    const [row] = await this.prisma.$queryRaw<InventoryStatsRow[]>(inventoryStatsSql(storeId));
    return { ...row, stockValue: Number(row.stockValue), units: Number(row.units) };
  }

  async item(storeId: string, productId: string) {
    const rows = await this.prisma.$queryRaw<InventoryRow[]>(
      inventoryPageSql({ storeId, productId }, 'value-desc', 1, 0),
    );
    const [item] = await this.items(storeId, rows);
    if (!item) throw InventoryErrors.productNotFound();
    return item;
  }

  async detail(storeId: string, productId: string, days: number) {
    const item = await this.item(storeId, productId);
    const [history, recent] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: { storeId, productId, createdAt: { gte: seriesStart(days) } },
        select: { quantity: true, createdAt: true },
      }),
      this.movements.recent(storeId, productId),
    ]);
    return { item, series: buildStockSeries(item.stock, history, days), recent };
  }

  private async items(storeId: string, rows: InventoryRow[]) {
    if (!rows.length) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      include: productInclude(storeId),
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    return rows.flatMap(({ id, ...extra }) => {
      const product = byId.get(id);
      return product ? [toInventoryItem(product, extra)] : [];
    });
  }
}
