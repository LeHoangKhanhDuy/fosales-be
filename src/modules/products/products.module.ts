import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProductCommandsService } from './product-commands.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [AuditModule, StockModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductCommandsService],
  exports: [ProductsService],
})
export class ProductsModule {}
