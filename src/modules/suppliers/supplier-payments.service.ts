import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CreateSupplierPaymentDto } from './dto/supplier.dto';
import { paymentInclude, toPayment } from './supplier.mapper';
import { SupplierLedger } from './supplier-ledger.service';
import { SupplierErrors } from './suppliers.errors';
import { SuppliersService } from './suppliers.service';
import { vnDateCode } from './suppliers.utils';

const SCOPE = 'supplier.payment';

@Injectable()
export class SupplierPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: SupplierLedger,
    private readonly idempotency: IdempotencyService,
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
  ) {}

  async create(
    user: AuthUser,
    supplierId: string,
    dto: CreateSupplierPaymentDto,
    key: string | undefined,
    client: ClientInfo,
  ) {
    const reference = dto.method === 'transfer' ? (dto.reference ?? null) : null;
    const outcome = await this.prisma.$transaction(async (tx) => {
      if (key) {
        const paymentId = await this.idempotency.claim(tx, user.id, key, SCOPE);
        if (paymentId) return { paymentId, replayed: true as const };
      }
      if (!(await tx.supplier.count({ where: { id: supplierId } })))
        throw SupplierErrors.notFound();
      const code = await this.nextCode(tx);
      const payment = await tx.supplierPayment.create({
        data: {
          code,
          supplierId,
          amount: BigInt(dto.amount),
          method: dto.method,
          reference,
          note: dto.note ?? null,
          paidById: user.id,
        },
        select: { id: true },
      });
      const { debtBefore, debtAfter } = await this.ledger.apply(tx, {
        supplierId,
        kind: 'payment',
        amount: -dto.amount,
        code,
        label:
          dto.method === 'cash'
            ? 'Trả tiền mặt'
            : `Chuyển khoản${reference ? ` · ${reference}` : ''}`,
        refType: 'SupplierPayment',
        refId: payment.id,
        userId: user.id,
      });
      if (key) await this.idempotency.save(tx, user.id, key, SCOPE, payment.id);
      return { paymentId: payment.id, code, debtBefore, debtAfter, replayed: false as const };
    });

    if (!outcome.replayed) {
      await this.audit.log('SUPPLIER_PAYMENT_CREATED', client, {
        userId: user.id,
        meta: {
          supplierId,
          paymentId: outcome.paymentId,
          code: outcome.code,
          amount: dto.amount,
          method: dto.method,
          debtBefore: outcome.debtBefore,
          debtAfter: outcome.debtAfter,
        },
      });
    }
    const [payment, supplier] = await Promise.all([
      this.prisma.supplierPayment.findUniqueOrThrow({
        where: { id: outcome.paymentId },
        include: paymentInclude,
      }),
      this.suppliers.get(supplierId),
    ]);
    return { payment: toPayment(payment), supplier };
  }

  private async nextCode(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fosales:supplier-payment-code'))`;
    const prefix = `PC${vnDateCode()}-`;
    const [{ max }] = await tx.$queryRaw<{ max: number }[]>`
      SELECT COALESCE(max(substring(code FROM ${prefix.length + 1}::int)::int), 0)::int AS max
      FROM supplier_payments WHERE code LIKE ${`${prefix}%`}`;
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }
}
