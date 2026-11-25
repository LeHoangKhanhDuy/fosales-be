import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { CustomerCommandsService } from './customer-commands.service';
import { CustomerPointsService } from './customer-points.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';
import { PointLedger } from './point-ledger.service';

@Module({
  imports: [AuditModule, IdempotencyModule],
  controllers: [CustomersController, MembershipController],
  providers: [
    CustomersService,
    CustomerCommandsService,
    CustomerPointsService,
    MembershipService,
    PointLedger,
  ],
  exports: [PointLedger, MembershipService, CustomersService],
})
export class CustomersModule {}
