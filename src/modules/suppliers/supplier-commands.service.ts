import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/http/client-info';
import { toNameKey } from '../../common/utils/text';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { definedOnly } from '../catalog/catalog.utils';
import {
  CreateSupplierDto,
  SupplierStatusDto,
  type SupplierStatusValue,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { SupplierErrors } from './suppliers.errors';
import { SuppliersService } from './suppliers.service';
import { supplierSearchKey } from './suppliers.utils';

type Tx = Prisma.TransactionClient;

function uniqueErrors(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta?.target ?? '');
    if (/tax/i.test(target)) throw SupplierErrors.taxCodeTaken();
    if (/name/i.test(target)) throw SupplierErrors.nameTaken();
    if (/phone/i.test(target)) throw SupplierErrors.phoneTaken();
    if (/code/i.test(target)) throw SupplierErrors.codeTaken();
  }
  throw error;
}

function suspension(
  status: SupplierStatusValue,
  reason: string | null | undefined,
  until: string | null | undefined,
) {
  if (status !== 'suspended') return { suspendReason: null, suspendedUntil: null };
  if (!reason) throw SupplierErrors.suspendReasonRequired();
  const date = until ? new Date(until) : null;
  if (date && date.getTime() <= Date.now()) throw SupplierErrors.suspendUntilInvalid();
  return { suspendReason: reason, suspendedUntil: date };
}

@Injectable()
export class SupplierCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateSupplierDto, client: ClientInfo) {
    const {
      categoryIds = [],
      code,
      status = 'active',
      suspendReason,
      suspendedUntil,
      ...fields
    } = dto;
    const state = suspension(status, suspendReason, suspendedUntil);
    const created = await this.prisma
      .$transaction(async (tx) => {
        await this.assertCategories(tx, categoryIds);
        const finalCode = code ?? (await this.generateCode(tx));
        return tx.supplier.create({
          data: {
            ...fields,
            ...state,
            status,
            code: finalCode,
            nameKey: toNameKey(fields.name),
            searchKey: supplierSearchKey({ ...fields, code: finalCode }),
            categories: { createMany: { data: categoryIds.map((categoryId) => ({ categoryId })) } },
          },
          select: { id: true, code: true, name: true },
        });
      })
      .catch(uniqueErrors);
    await this.audit.log('SUPPLIER_CREATED', client, { userId: user.id, meta: created });
    return this.suppliers.get(created.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateSupplierDto, client: ClientInfo) {
    const { categoryIds, status, suspendReason, suspendedUntil, ...rest } = dto;
    const fields = definedOnly(rest);
    const touchesStatus =
      status !== undefined || suspendReason !== undefined || suspendedUntil !== undefined;
    if (!Object.keys(fields).length && categoryIds === undefined && !touchesStatus)
      throw Errors.emptyUpdate();

    await this.prisma
      .$transaction(async (tx) => {
        const current = await tx.supplier.findUnique({ where: { id } });
        if (!current) throw SupplierErrors.notFound();
        const next = { ...current, ...fields };
        const state = touchesStatus
          ? {
              status: status ?? current.status,
              ...suspension(
                status ?? current.status,
                suspendReason !== undefined ? suspendReason : current.suspendReason,
                suspendedUntil !== undefined
                  ? suspendedUntil
                  : current.suspendedUntil?.toISOString(),
              ),
            }
          : {};
        if (categoryIds) {
          await this.assertCategories(tx, categoryIds);
          await tx.supplierCategory.deleteMany({ where: { supplierId: id } });
          await tx.supplierCategory.createMany({
            data: categoryIds.map((categoryId) => ({ supplierId: id, categoryId })),
          });
        }
        await tx.supplier.update({
          where: { id },
          data: {
            ...fields,
            ...state,
            nameKey: toNameKey(next.name),
            searchKey: supplierSearchKey(next),
          },
        });
      })
      .catch(uniqueErrors);

    const changed = [
      ...Object.keys(fields),
      ...(categoryIds ? ['categoryIds'] : []),
      ...(touchesStatus ? ['status'] : []),
    ];
    await this.audit.log('SUPPLIER_UPDATED', client, {
      userId: user.id,
      meta: { id, fields: changed },
    });
    return this.suppliers.get(id);
  }

  async setStatus(user: AuthUser, id: string, dto: SupplierStatusDto, client: ClientInfo) {
    const state = suspension(dto.status, dto.reason, dto.until);
    const previous = await this.prisma.supplier.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!previous) throw SupplierErrors.notFound();
    await this.prisma.supplier.update({ where: { id }, data: { status: dto.status, ...state } });
    await this.audit.log('SUPPLIER_STATUS_CHANGED', client, {
      userId: user.id,
      meta: {
        id,
        from: previous.status,
        to: dto.status,
        reason: state.suspendReason,
        until: state.suspendedUntil?.toISOString() ?? null,
      },
    });
    return this.suppliers.get(id);
  }

  async remove(user: AuthUser, id: string, client: ClientInfo) {
    const removed = await this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id },
        select: { code: true, name: true },
      });
      if (!supplier) throw SupplierErrors.notFound();
      const [ledgerCount, paymentCount] = await Promise.all([
        tx.supplierLedgerEntry.count({ where: { supplierId: id } }),
        tx.supplierPayment.count({ where: { supplierId: id } }),
      ]);
      if (ledgerCount || paymentCount) throw SupplierErrors.hasTransactions(ledgerCount);
      await tx.supplier.delete({ where: { id } });
      return supplier;
    });
    await this.audit.log('SUPPLIER_DELETED', client, { userId: user.id, meta: { id, ...removed } });
  }

  private async assertCategories(tx: Tx, categoryIds: string[]) {
    if (!categoryIds.length) return;
    const found = await tx.category.count({ where: { id: { in: categoryIds } } });
    if (found !== categoryIds.length) throw SupplierErrors.categoryInvalid();
  }

  private async generateCode(tx: Tx) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fosales:supplier-code'))`;
    return this.suppliers.nextCode(tx);
  }
}
