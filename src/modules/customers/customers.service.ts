import { Injectable } from '@nestjs/common';
import { normalizePhone } from '../../common/utils/mask';
import { PrismaService } from '../../prisma/prisma.service';
import { PageDto } from '../suppliers/dto/supplier-query.dto';
import {
  CustomerListQueryDto,
  CustomerLookupQueryDto,
  CustomerSearchQueryDto,
} from './dto/customer-query.dto';
import { orderListInclude, toOrderListItem } from '../orders/order.mapper';
import { customerSelect, liteSelect, toCustomer } from './customer.mapper';
import { CustomerErrors } from './customers.errors';
import {
  customerPageSql,
  customerSearchSql,
  customerStatsSql,
  orders30Sql,
  tierCountsSql,
  type CustomerStatsRow,
  type TierCountsRow,
} from './customers.query';
import { MembershipService } from './membership.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
  ) {}

  async list(query: CustomerListQueryDto) {
    const filter = { keyword: query.keyword, segment: query.segment };
    const skip = (query.page - 1) * query.pageSize;
    const [[counts], rows, settings] = await Promise.all([
      this.prisma.$queryRaw<TierCountsRow[]>(tierCountsSql(filter, query.tier)),
      this.prisma.$queryRaw<{ id: string }[]>(
        customerPageSql(filter, query.sort, query.pageSize, skip, query.tier),
      ),
      this.membership.settings(),
    ]);
    const { total, ...tierCounts } = counts;
    const ids = rows.map((row) => row.id);
    const customers = ids.length
      ? await this.prisma.customer.findMany({ where: { id: { in: ids } }, select: customerSelect })
      : [];
    const byId = new Map(customers.map((customer) => [customer.id, customer]));
    const recent = await this.orders30(ids);
    return {
      items: ids.flatMap((id) => {
        const customer = byId.get(id);
        return customer ? [toCustomer(customer, settings, recent.get(id) ?? 0)] : [];
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
      tierCounts,
    };
  }

  async stats() {
    const [row] = await this.prisma.$queryRaw<CustomerStatsRow[]>(customerStatsSql());
    return row;
  }

  async search({ q, limit }: CustomerSearchQueryDto) {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(customerSearchSql(q, limit));
    if (!rows.length) return [];
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      select: liteSelect,
    });
    const byId = new Map(customers.map((customer) => [customer.id, customer]));
    return rows.flatMap((row) => byId.get(row.id) ?? []);
  }

  async lookup({ phone, code }: CustomerLookupQueryDto) {
    if (!phone && !code) throw CustomerErrors.lookupRequired();
    const normalized = phone ? normalizePhone(phone.replace(/[^\d+]/g, '')) : null;
    if (phone && !normalized) throw CustomerErrors.notFound();
    const customer = await this.prisma.customer.findFirst({
      where: normalized ? { phone: normalized } : { code: code!.toUpperCase() },
      select: liteSelect,
    });
    if (!customer) throw CustomerErrors.notFound();
    if (customer.status !== 'active') throw CustomerErrors.blocked();
    return customer;
  }

  async get(id: string) {
    const [row, settings] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id }, select: customerSelect }),
      this.membership.settings(),
    ]);
    if (!row) throw CustomerErrors.notFound();
    return toCustomer(row, settings, (await this.orders30([id])).get(id) ?? 0);
  }

  async lite(id: string) {
    const row = await this.prisma.customer.findUnique({ where: { id }, select: liteSelect });
    if (!row) throw CustomerErrors.notFound();
    return row;
  }

  async orders(id: string, query: PageDto) {
    await this.assertExists(id);
    const where = { customerId: id };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderListInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: rows.map(toOrderListItem), total, page: query.page, pageSize: query.pageSize };
  }

  private async orders30(ids: string[]) {
    if (!ids.length) return new Map<string, number>();
    const rows = await this.prisma.$queryRaw<{ customerId: string; count: number }[]>(
      orders30Sql(ids),
    );
    return new Map(rows.map((row) => [row.customerId, row.count]));
  }

  async assertExists(id: string) {
    if (!(await this.prisma.customer.count({ where: { id } }))) throw CustomerErrors.notFound();
  }
}
