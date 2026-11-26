import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PageDto } from '../suppliers/dto/supplier-query.dto';
import { GenerateCodeQueryDto, PromotionListQueryDto } from './dto/promotion-query.dto';
import { promotionInclude, toPromotion } from './promotion.mapper';
import { PromotionErrors } from './promotions.errors';
import {
  promotionPageSql,
  statusCountsSql,
  usageSql,
  type StatusCountsRow,
  type UsageRow,
} from './promotions.query';
import { randomCode } from './promotions.utils';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PromotionListQueryDto) {
    const filter = { kind: query.kind, keyword: query.keyword };
    const skip = (query.page - 1) * query.pageSize;
    const [[counts], rows] = await Promise.all([
      this.prisma.$queryRaw<StatusCountsRow[]>(statusCountsSql(filter, query.status)),
      this.prisma.$queryRaw<{ id: string }[]>(
        promotionPageSql(filter, query.sort, query.pageSize, skip, query.status),
      ),
    ]);
    const { total, ...statusCounts } = counts;
    return {
      items: await this.items(rows.map((row) => row.id)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      statusCounts,
    };
  }

  async get(id: string) {
    const [item] = await this.items([id]);
    if (!item) throw PromotionErrors.notFound();
    return item;
  }

  async redemptions(id: string, query: PageDto) {
    if (!(await this.prisma.promotion.count({ where: { id } }))) throw PromotionErrors.notFound();
    const where = { promotionId: id };
    const [rows, total] = await Promise.all([
      this.prisma.promotionRedemption.findMany({
        where,
        include: { customer: { select: { id: true, code: true, name: true, phone: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.promotionRedemption.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderCode: row.orderCode,
        customer: row.customer,
        discount: row.discount,
        revenue: row.revenue,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async generateCode({ prefix = '' }: GenerateCodeQueryDto) {
    const length = Math.max(4 - prefix.length, Math.min(6, 20 - prefix.length));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = randomCode(prefix, length);
      if (!(await this.prisma.promotion.count({ where: { code } }))) return { code };
    }
    throw PromotionErrors.codeExhausted();
  }

  private async items(ids: string[]) {
    if (!ids.length) return [];
    const [rows, usage] = await Promise.all([
      this.prisma.promotion.findMany({ where: { id: { in: ids } }, include: promotionInclude }),
      this.prisma.$queryRaw<UsageRow[]>(usageSql(ids)),
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const usageById = new Map(usage.map(({ promotionId, ...row }) => [promotionId, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toPromotion(row, usageById.get(id))] : [];
    });
  }
}
