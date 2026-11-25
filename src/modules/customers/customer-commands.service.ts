import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { definedOnly } from '../catalog/catalog.utils';
import { CreateCustomerDto, CustomerStatusDto, UpdateCustomerDto } from './dto/customer.dto';
import { CustomerErrors } from './customers.errors';
import { nextCustomerCodeSql } from './customers.query';
import { CustomersService } from './customers.service';
import {
  customerSearchKey,
  formatCustomerCode,
  givenNameKey,
  isValidBirthday,
  toDateOnly,
} from './customers.utils';
import { resolveTier } from './membership.rules';
import { MembershipService } from './membership.service';
import { PointLedger } from './point-ledger.service';

type Tx = Prisma.TransactionClient;

const CASHIER_FIELDS = ['name', 'phone', 'email', 'gender', 'birthday'] as const;

const birthdayOf = (value: string | null | undefined) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isValidBirthday(value)) throw CustomerErrors.birthdayInvalid();
  return toDateOnly(value);
};

@Injectable()
export class CustomerCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly membership: MembershipService,
    private readonly ledger: PointLedger,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateCustomerDto, client: ClientInfo) {
    const input: CreateCustomerDto =
      user.role === 'cashier'
        ? (Object.fromEntries(
            CASHIER_FIELDS.map((key) => [key, dto[key]]),
          ) as unknown as CreateCustomerDto)
        : dto;
    if (user.role !== 'admin') {
      if (input.legacySpent !== undefined) throw CustomerErrors.fieldForbidden('chi tiêu cũ');
      if (input.openingPoints !== undefined) throw CustomerErrors.fieldForbidden('điểm đầu kỳ');
    }
    const { openingPoints = 0, legacySpent = 0, birthday, status = 'active', ...fields } = input;
    const settings = await this.membership.settings();
    const created = await this.prisma
      .$transaction(async (tx) => {
        await this.assertPhoneFree(tx, fields.phone);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fosales:customer-code'))`;
        const [{ max }] = await tx.$queryRaw<{ max: number }[]>(nextCustomerCodeSql());
        const code = formatCustomerCode(max + 1);
        const customer = await tx.customer.create({
          data: {
            ...fields,
            email: fields.email ?? null,
            gender: fields.gender ?? null,
            birthday: birthdayOf(birthday) ?? null,
            status,
            code,
            legacySpent: BigInt(legacySpent),
            tier: resolveTier(settings, legacySpent),
            searchKey: customerSearchKey({ name: fields.name, code, email: fields.email }),
            givenNameKey: givenNameKey(fields.name),
            createdById: user.id,
          },
          select: { id: true, code: true, name: true },
        });
        if (openingPoints > 0) {
          await this.ledger.apply(tx, {
            customerId: customer.id,
            type: 'opening',
            points: openingPoints,
            reason: 'Số dư đầu kỳ',
            userId: user.id,
          });
        }
        return customer;
      })
      .catch((error: unknown) => this.uniquePhone(error, fields.phone));
    await this.audit.log('CUSTOMER_CREATED', client, {
      userId: user.id,
      meta: { ...created, legacySpent, openingPoints },
    });
    return user.role === 'cashier'
      ? this.customers.lite(created.id)
      : this.customers.get(created.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateCustomerDto, client: ClientInfo) {
    if (dto.legacySpent !== undefined && user.role !== 'admin') {
      throw CustomerErrors.fieldForbidden('chi tiêu cũ');
    }
    const { birthday, legacySpent, ...fields } = dto;
    const changes = await this.prisma
      .$transaction(async (tx) => {
        const current = await tx.customer.findUnique({
          where: { id },
          select: { code: true, name: true, phone: true, email: true, legacySpent: true },
        });
        if (!current) throw CustomerErrors.notFound();
        if (fields.phone && fields.phone !== current.phone)
          await this.assertPhoneFree(tx, fields.phone);
        const name = fields.name ?? current.name;
        const email = fields.email !== undefined ? fields.email : current.email;
        await tx.customer.update({
          where: { id },
          data: {
            ...definedOnly(fields),
            ...(birthday !== undefined ? { birthday: birthdayOf(birthday) } : {}),
            ...(legacySpent !== undefined ? { legacySpent: BigInt(legacySpent) } : {}),
            searchKey: customerSearchKey({ name, code: current.code, email }),
            givenNameKey: givenNameKey(name),
          },
        });
        const tier = await this.membership.refreshTier(tx, id, await this.membership.settings());
        return { code: current.code, fields: Object.keys(dto), tier };
      })
      .catch((error: unknown) => this.uniquePhone(error, fields.phone));
    await this.audit.log('CUSTOMER_UPDATED', client, { userId: user.id, meta: { id, ...changes } });
    return this.customers.get(id);
  }

  async setStatus(user: AuthUser, id: string, dto: CustomerStatusDto, client: ClientInfo) {
    const current = await this.prisma.customer.findUnique({
      where: { id },
      select: { code: true, status: true },
    });
    if (!current) throw CustomerErrors.notFound();
    if (current.status !== dto.status) {
      await this.prisma.customer.update({ where: { id }, data: { status: dto.status } });
      await this.audit.log('CUSTOMER_STATUS_CHANGED', client, {
        userId: user.id,
        meta: {
          id,
          code: current.code,
          from: current.status,
          to: dto.status,
          reason: dto.reason ?? null,
        },
      });
    }
    return this.customers.get(id);
  }

  async remove(user: AuthUser, id: string, client: ClientInfo) {
    const removed = await this.prisma.$transaction(async (tx) => {
      const [customer] = await tx.$queryRaw<{ code: string; name: string; orderCount: number }[]>`
        SELECT code, name, order_count AS "orderCount" FROM customers WHERE id = ${id}::uuid FOR UPDATE`;
      if (!customer) throw CustomerErrors.notFound();
      const pointLogs = await tx.pointLog.count({
        where: { customerId: id, type: { not: 'opening' } },
      });
      if (customer.orderCount || pointLogs)
        throw CustomerErrors.hasTransactions(customer.orderCount, pointLogs);
      await tx.pointLog.deleteMany({ where: { customerId: id } });
      await tx.customer.delete({ where: { id } });
      return { code: customer.code, name: customer.name };
    });
    await this.audit.log('CUSTOMER_DELETED', client, { userId: user.id, meta: { id, ...removed } });
  }

  private async assertPhoneFree(tx: Tx, phone: string) {
    const existing = await tx.customer.findUnique({
      where: { phone },
      select: { id: true, name: true },
    });
    if (existing) throw CustomerErrors.phoneTaken(existing.id, existing.name);
  }

  private async uniquePhone(error: unknown, phone: string | undefined): Promise<never> {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && phone) {
      const existing = await this.prisma.customer.findUnique({
        where: { phone },
        select: { id: true, name: true },
      });
      if (existing) throw CustomerErrors.phoneTaken(existing.id, existing.name);
    }
    throw error;
  }
}
