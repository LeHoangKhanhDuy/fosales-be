import { Module } from '@nestjs/common';
import { StockLedger } from './stock-ledger.service';

@Module({
  providers: [StockLedger],
  exports: [StockLedger],
})
export class StockModule {}
