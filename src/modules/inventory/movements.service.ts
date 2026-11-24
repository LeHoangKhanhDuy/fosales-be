import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { toNameKey } from '../../common/utils/text';
import { PrismaService } from '../../prisma/prisma.service';
import { MovementFilter, MovementListQueryDto } from './dto/inventory-query.dto';
import { movementInclude, toDbMovementType, toMovement } from './inventory.mapper';

const ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.StockMovementOrderByWithRelationInput[];

function typeWhere(type: MovementFilter): Prisma.StockMovementWhereInput {
  if (type === 'all') return {};
  if (type === 'in') return { quantity: { gt: 0 } };
  if (type === 'out') return { quantity: { lt: 0 } };
  return { type: toDbMovementType(type) };
}

@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string, query: MovementListQueryDto) {
    const where = this.where(storeId, query);
    const [rows, total, incoming, outgoing] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy: ORDER,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.aggregate({
        where: { AND: [where, { quantity: { gt: 0 } }] },
        _sum: { quantity: true },
      }),
      this.prisma.stockMovement.aggregate({
        where: { AND: [where, { quantity: { lt: 0 } }] },
        _sum: { quantity: true },
      }),
    ]);
    return {
      items: rows.map(toMovement),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary: { inQty: incoming._sum.quantity ?? 0, outQty: -(outgoing._sum.quantity ?? 0) },
    };
  }

  async recent(storeId: string, productId: string, take = 8) {
    const rows = await this.prisma.stockMovement.findMany({
      where: { storeId, productId },
      include: movementInclude,
      orderBy: ORDER,
      take,
    });
    return rows.map(toMovement);
  }

  async byId(id: string) {
    const row = await this.prisma.stockMovement.findUniqueOrThrow({
      where: { id },
      include: movementInclude,
    });
    return toMovement(row);
  }

  private where(storeId: string, query: MovementListQueryDto): Prisma.StockMovementWhereInput {
    const keyword = query.keyword?.trim();
    const key = keyword ? toNameKey(keyword) : '';
    return {
      storeId,
      ...typeWhere(query.type),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(key
        ? {
            OR: [
              { product: { searchKey: { contains: key } } },
              { refCode: { contains: keyword, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }
}
