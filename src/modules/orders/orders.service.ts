import { Injectable } from '@nestjs/common';
import type { OrderStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { toNameKey } from '../../common/utils/text';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderListQueryDto, RangeDto, ReturnListQueryDto } from './dto/order-query.dto';
import { storeScope } from './order-access';
import {
  orderInclude,
  orderListInclude,
  receiptStore,
  toOrder,
  toOrderListItem,
  toReceipt,
} from './order.mapper';
import { OrderErrors } from './orders.errors';
import {
  methodStatsSql,
  orderStatsSql,
  todaySql,
  type MethodRow,
  type StatsRow,
  type TodayRow,
} from './orders.query';
import { DAY_MS, growth, PAYMENT_LABEL, VN_OFFSET_MS } from './orders.utils';

const ORDER_SORT: Record<OrderListQueryDto['sort'], Prisma.OrderOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  'total-desc': [{ total: 'desc' }, { createdAt: 'desc' }],
  'total-asc': [{ total: 'asc' }, { createdAt: 'desc' }],
};

const STATUSES: OrderStatus[] = [
  'pending',
  'completed',
  'cancelled',
  'partially_refunded',
  'refunded',
];

const storeSelect = {
  name: true,
  code: true,
  address: true,
  phone: true,
  taxCode: true,
  receiptFooter: true,
  branchName: true,
  returnDays: true,
} as const;

const returnInclude = {
  order: {
    select: {
      id: true,
      code: true,
      createdAt: true,
      customer: { select: { id: true, code: true, name: true, phone: true } },
    },
  },
  createdBy: { select: { name: true } },
  store: { select: storeSelect },
  lines: {
    include: {
      orderLine: { select: { name: true, sku: true, unit: true, price: true, lineNo: true } },
    },
  },
} satisfies Prisma.ReturnReceiptInclude;

type ReturnRow = Prisma.ReturnReceiptGetPayload<{ include: typeof returnInclude }>;

function keywordWhere(keyword: string | undefined): Prisma.OrderWhereInput {
  const raw = keyword?.trim();
  if (!raw) return {};
  const key = toNameKey(raw);
  const digits = raw.replace(/\D/g, '');
  return {
    OR: [
      { code: { contains: raw, mode: 'insensitive' } },
      { customer: { searchKey: { contains: key } } },
      ...(digits.length >= 3 ? [{ customer: { phone: { contains: digits } } }] : []),
      { lines: { some: { product: { searchKey: { contains: key } } } } },
      ...(digits.length >= 3 ? [{ lines: { some: { barcode: { contains: digits } } } }] : []),
    ],
  };
}

const range = (from?: string, to?: string) =>
  from || to
    ? {
        createdAt: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lt: new Date(to) } : {}),
        },
      }
    : {};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: OrderListQueryDto) {
    const base: Prisma.OrderWhereInput = {
      ...storeScope(user),
      ...range(query.from, query.to),
      ...(query.cashierId ? { cashierId: query.cashierId } : {}),
      ...(query.payment
        ? { payments: { some: { method: query.payment, status: { not: 'voided' } } } }
        : {}),
      ...keywordWhere(query.keyword),
    };
    const where = { ...base, ...(query.status ? { status: query.status } : {}) };
    const [rows, total, groups] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderListInclude,
        orderBy: ORDER_SORT[query.sort],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
    for (const group of groups) counts[group.status] = group._count._all;
    return {
      items: rows.map(toOrderListItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      statusCounts: { all: Object.values(counts).reduce((a, b) => a + b, 0), ...counts },
    };
  }

  async stats(user: AuthUser, query: RangeDto) {
    const storeId = user.role === 'admin' ? null : user.storeId;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const [[row], methods] = await Promise.all([
      this.prisma.$queryRaw<StatsRow[]>(orderStatsSql(storeId, from, to)),
      this.prisma.$queryRaw<MethodRow[]>(methodStatsSql(storeId, from, to)),
    ]);
    const revenue = Number(row.revenue);
    const byMethod = Object.fromEntries(Object.keys(PAYMENT_LABEL).map((m) => [m, 0])) as Record<
      string,
      number
    >;
    for (const m of methods) byMethod[m.method] = Number(m.amount);
    return {
      revenue,
      orders: row.orders,
      avgOrderValue: row.completed ? Math.round(revenue / row.completed) : 0,
      pending: row.pending,
      pendingAmount: Number(row.pendingAmount),
      cancelled: row.cancelled,
      cancelledAmount: Number(row.cancelledAmount),
      refunded: row.refunded,
      refundedAmount: Number(row.refundedAmount),
      byMethod,
    };
  }

  async today(user: AuthUser) {
    const storeId = user.role === 'admin' ? null : user.storeId;
    const now = Date.now();
    const startToday = new Date(Math.floor((now + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS);
    const startYesterday = new Date(startToday.getTime() - DAY_MS);
    const [[today], [yesterday]] = await Promise.all([
      this.prisma.$queryRaw<TodayRow[]>(todaySql(storeId, startToday, new Date(now + 1))),
      this.prisma.$queryRaw<TodayRow[]>(
        todaySql(storeId, startYesterday, new Date(now - DAY_MS + 1)),
      ),
    ]);
    const revenue = Number(today.revenue);
    const prevRevenue = Number(yesterday.revenue);
    return {
      revenue,
      orders: today.orders,
      itemsSold: today.itemsSold,
      customers: today.customers,
      revenueGrowth: growth(revenue, prevRevenue),
      ordersGrowth: growth(today.orders, yesterday.orders),
      itemsSoldGrowth: growth(today.itemsSold, yesterday.itemsSold),
      customersGrowth: growth(today.customers, yesterday.customers),
    };
  }

  async get(user: AuthUser, id: string) {
    return toOrder(await this.row(user, { id }));
  }

  async lookup(user: AuthUser, code: string) {
    return toOrder(await this.row(user, { code: code.trim().toUpperCase() }));
  }

  async receipt(user: AuthUser, id: string) {
    const row = await this.row(user, { id });
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: row.storeId },
      select: storeSelect,
    });
    return toReceipt(row, store, row.customer?.points ?? null);
  }

  async listReturns(user: AuthUser, query: ReturnListQueryDto) {
    const raw = query.keyword?.trim();
    const where: Prisma.ReturnReceiptWhereInput = {
      ...storeScope(user),
      ...range(query.from, query.to),
      ...(raw
        ? {
            OR: [
              { code: { contains: raw, mode: 'insensitive' } },
              { order: { code: { contains: raw, mode: 'insensitive' } } },
              { order: { customer: { searchKey: { contains: toNameKey(raw) } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.returnReceipt.findMany({
        where,
        include: returnInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.returnReceipt.count({ where }),
    ]);
    return {
      items: rows.map((row) => {
        const { lines, store: _store, ...rest } = this.toReturn(row);
        return { ...rest, itemCount: lines.reduce((sum, l) => sum + l.quantity, 0) };
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getReturn(user: AuthUser, id: string) {
    const row = await this.prisma.returnReceipt.findFirst({
      where: { id, ...storeScope(user) },
      include: returnInclude,
    });
    if (!row) throw OrderErrors.returnNotFound();
    return this.toReturn(row);
  }

  private toReturn(row: ReturnRow) {
    return {
      id: row.id,
      code: row.code,
      orderId: row.order.id,
      orderCode: row.order.code,
      orderCreatedAt: row.order.createdAt,
      customer: row.order.customer,
      createdAt: row.createdAt,
      createdBy: row.createdBy.name,
      approvedBy: row.approvedBy,
      reason: row.reason,
      note: row.note,
      refundTotal: row.refundTotal,
      cashRefund: row.cashRefund,
      pointsRefunded: row.pointsRefunded,
      pointsRevoked: row.pointsRevoked,
      refundMethod: row.refundMethod,
      refundMethodLabel: PAYMENT_LABEL[row.refundMethod],
      refundReference: row.refundReference,
      lines: [...row.lines]
        .sort((a, b) => a.orderLine.lineNo - b.orderLine.lineNo)
        .map((line) => ({
          orderLineId: line.orderLineId,
          productId: line.productId,
          name: line.orderLine.name,
          sku: line.orderLine.sku,
          unit: line.orderLine.unit,
          price: line.orderLine.price,
          quantity: line.quantity,
          refundAmount: line.refundAmount,
          restock: line.restock,
        })),
      store: receiptStore(row.store),
    };
  }

  private async row(user: AuthUser, where: { id: string } | { code: string }) {
    const row = await this.prisma.order.findFirst({
      where: { ...where, ...storeScope(user) },
      include: orderInclude,
    });
    if (!row) throw OrderErrors.notFound();
    return row;
  }
}
