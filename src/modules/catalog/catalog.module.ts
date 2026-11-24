import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [AuditModule],
  controllers: [CategoriesController, UnitsController],
  providers: [CategoriesService, UnitsService],
})
export class CatalogModule {}
