import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProductCommandsService } from './product-commands.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { StockLedger } from './stock-ledger.service';

@Module({
  imports: [AuditModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductCommandsService, StockLedger],
  exports: [ProductsService, StockLedger],
})
export class ProductsModule {}
