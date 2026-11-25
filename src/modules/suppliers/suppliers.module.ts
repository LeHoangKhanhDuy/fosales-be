import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { SupplierCommandsService } from './supplier-commands.service';
import { SupplierLedger } from './supplier-ledger.service';
import { SupplierPaymentsService } from './supplier-payments.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [AuditModule, IdempotencyModule],
  controllers: [SuppliersController],
  providers: [SuppliersService, SupplierCommandsService, SupplierPaymentsService, SupplierLedger],
  exports: [SupplierLedger, SuppliersService],
})
export class SuppliersModule {}
