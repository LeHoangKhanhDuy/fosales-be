import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PromotionCommandsService } from './promotion-commands.service';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { VoucherRateLimit } from './voucher-rate-limit';
import { VoucherService } from './voucher.service';

@Module({
  imports: [AuditModule],
  controllers: [PromotionsController],
  providers: [PromotionsService, PromotionCommandsService, VoucherService, VoucherRateLimit],
  exports: [VoucherService, PromotionsService],
})
export class PromotionsModule {}
