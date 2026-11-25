import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/auth-user';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PointLogQueryDto } from './dto/customer-query.dto';
import { AdjustPointsDto } from './dto/customer.dto';
import { CustomerErrors } from './customers.errors';
import { CustomersService } from './customers.service';
import { PointLedger, pointLogInclude, toPointLog } from './point-ledger.service';

const SCOPE = 'customer.points';

@Injectable()
export class CustomerPointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: PointLedger,
    private readonly idempotency: IdempotencyService,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
  ) {}

  async list(id: string, query: PointLogQueryDto) {
    await this.customers.assertExists(id);
    const where = { customerId: id, ...(query.type ? { type: query.type } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.pointLog.findMany({
        where,
        include: pointLogInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.pointLog.count({ where }),
    ]);
    return { items: rows.map(toPointLog), total, page: query.page, pageSize: query.pageSize };
  }

  async adjust(
    user: AuthUser,
    id: string,
    dto: AdjustPointsDto,
    key: string | undefined,
    client: ClientInfo,
  ) {
    if (dto.points === 0) throw CustomerErrors.pointsZero();
    const points = dto.type === 'redeem' ? -Math.abs(dto.points) : dto.points;
    const outcome = await this.prisma.$transaction(async (tx) => {
      if (key) {
        const logId = await this.idempotency.claim(tx, user.id, key, SCOPE);
        if (logId) return { logId, replayed: true as const };
      }
      const [customer] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM customers WHERE id = ${id}::uuid FOR UPDATE`;
      if (!customer) throw CustomerErrors.notFound();
      if (customer.status !== 'active') throw CustomerErrors.blocked();
      const result = await this.ledger.apply(tx, {
        customerId: id,
        type: dto.type,
        points,
        reason: dto.reason,
        userId: user.id,
      });
      if (key) await this.idempotency.save(tx, user.id, key, SCOPE, result.log.id);
      return { logId: result.log.id, ...result, replayed: false as const };
    });
    if (!outcome.replayed) {
      await this.audit.log('POINTS_ADJUSTED', client, {
        userId: user.id,
        meta: {
          customerId: id,
          type: dto.type,
          points,
          reason: dto.reason,
          before: outcome.balanceBefore,
          after: outcome.balanceAfter,
        },
      });
    }
    const [customer, log] = await Promise.all([
      this.customers.get(id),
      this.prisma.pointLog.findUniqueOrThrow({
        where: { id: outcome.logId },
        include: pointLogInclude,
      }),
    ]);
    return { customer, log: toPointLog(log) };
  }
}
