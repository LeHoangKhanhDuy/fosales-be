import { Injectable } from '@nestjs/common';
import { normalizePhone } from '../../common/utils/mask';
import { PrismaService } from '../../prisma/prisma.service';
import { PageDto } from '../suppliers/dto/supplier-query.dto';
import {
  CustomerListQueryDto,
  CustomerLookupQueryDto,
  CustomerSearchQueryDto,
} from './dto/customer-query.dto';
import { customerSelect, liteSelect, toCustomer } from './customer.mapper';
import { CustomerErrors } from './customers.errors';
import {
  customerPageSql,
  customerSearchSql,
  customerStatsSql,
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
    return {
      items: ids.flatMap((id) => {
        const customer = byId.get(id);
        return customer ? [toCustomer(customer, settings)] : [];
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
      tierCounts,
    };
  }

  async stats() {
    const [row] = await this.prisma.$queryRaw<CustomerStatsRow[]>(customerStatsSql());
    return { ...row, returning: 0 };
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
    return toCustomer(row, settings);
  }

  async lite(id: string) {
    const row = await this.prisma.customer.findUnique({ where: { id }, select: liteSelect });
    if (!row) throw CustomerErrors.notFound();
    return row;
  }

  async orders(id: string, query: PageDto) {
    await this.assertExists(id);
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  }

  async assertExists(id: string) {
    if (!(await this.prisma.customer.count({ where: { id } }))) throw CustomerErrors.notFound();
  }
}
