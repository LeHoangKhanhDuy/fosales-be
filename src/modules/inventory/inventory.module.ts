import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { StockModule } from '../stock/stock.module';
import { InventoryCommandsService } from './inventory-commands.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { MovementsService } from './movements.service';

@Module({
  imports: [AuditModule, StockModule, IdempotencyModule],
  controllers: [InventoryController],
  providers: [InventoryService, MovementsService, InventoryCommandsService],
})
export class InventoryModule {}
