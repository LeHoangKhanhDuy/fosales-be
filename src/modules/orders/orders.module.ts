import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CustomersModule } from '../customers/customers.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { StockModule } from '../stock/stock.module';
import { OrderCommandsService } from './order-commands.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PricingService } from './pricing.service';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [AuditModule, IdempotencyModule, StockModule, CustomersModule, PromotionsModule],
  controllers: [OrdersController, ReturnsController],
  providers: [OrdersService, OrderCommandsService, ReturnsService, PricingService],
  exports: [OrdersService, PricingService],
})
export class OrdersModule {}
