import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { toNameKey } from '../../common/utils/text';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ProductListQueryDto,
  ProductOptionsQueryDto,
  ProductStatsQueryDto,
} from './dto/product-query.dto';
import { canSeeCost, productInclude, toOption, toProduct } from './product.mapper';
import { ProductErrors } from './products.errors';
import { countSql, pageIdsSql, statsSql, type StatsRow } from './products.query';
import { normalizeSku } from './products.utils';

const ALIVE = { deletedAt: null } satisfies Prisma.ProductWhereInput;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: ProductListQueryDto) {
    const filter = { ...query, storeId: user.storeId };
    const skip = (query.page - 1) * query.pageSize;
    const [[{ total }], page] = await Promise.all([
      this.prisma.$queryRaw<{ total: number }[]>(countSql(filter)),
      this.prisma.$queryRaw<{ id: string }[]>(pageIdsSql(filter, query.sort, query.pageSize, skip)),
    ]);
    const ids = page.map((row) => row.id);
    return {
      items: await this.byIds(user, ids),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async stats(user: AuthUser, query: ProductStatsQueryDto) {
    const [row] = await this.prisma.$queryRaw<StatsRow[]>(
      statsSql({ ...query, storeId: user.storeId }),
    );
    return {
      total: row.total,
      active: row.active,
      inventoryValue: Number(row.inventoryValue),
      inventoryUnits: Number(row.inventoryUnits),
      low: row.low,
      out: row.out,
    };
  }

  async sellable(user: AuthUser) {
    const rows = await this.prisma.product.findMany({
      where: { ...ALIVE, status: 'active', category: { status: 'active' } },
      include: productInclude(user.storeId),
      orderBy: [{ searchKey: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => toProduct(row, canSeeCost(user.role)));
  }

  async options(user: AuthUser, { keyword, limit, ids }: ProductOptionsQueryDto) {
    const key = keyword ? toNameKey(keyword) : '';
    const rows = await this.prisma.product.findMany({
      where: {
        ...ALIVE,
        ...(ids ? { id: { in: ids } } : {}),
        ...(key ? { searchKey: { contains: key } } : {}),
      },
      include: productInclude(user.storeId),
      orderBy: [{ searchKey: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => toOption(row, canSeeCost(user.role)));
  }

  async lookup(user: AuthUser, code: string) {
    const row = await this.prisma.product.findFirst({
      where: { ...ALIVE, OR: [{ barcodeKey: code }, { skuKey: normalizeSku(code) }] },
      include: productInclude(user.storeId),
    });
    if (!row) throw ProductErrors.notFound();
    return toProduct(row, canSeeCost(user.role));
  }

  async get(user: AuthUser, id: string) {
    const [product] = await this.byIds(user, [id]);
    if (!product) throw ProductErrors.notFound();
    return product;
  }

  private async byIds(user: AuthUser, ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.product.findMany({
      where: { ...ALIVE, id: { in: ids } },
      include: productInclude(user.storeId),
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toProduct(row, canSeeCost(user.role))] : [];
    });
  }
}
