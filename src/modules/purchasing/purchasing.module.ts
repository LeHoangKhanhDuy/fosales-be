import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { StockModule } from '../stock/stock.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';
import { PurchaseOrderCommandsService } from './purchase-order-commands.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { ReceivingService } from './receiving.service';

@Module({
  imports: [AuditModule, IdempotencyModule, StockModule, SuppliersModule],
  controllers: [PurchaseOrdersController, GoodsReceiptsController],
  providers: [
    PurchaseOrdersService,
    PurchaseOrderCommandsService,
    ReceivingService,
    GoodsReceiptsService,
  ],
  exports: [PurchaseOrdersService, PurchaseOrderCommandsService, ReceivingService],
})
export class PurchasingModule {}
