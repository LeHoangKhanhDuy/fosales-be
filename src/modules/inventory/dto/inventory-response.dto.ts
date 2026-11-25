import { ApiProperty } from '@nestjs/swagger';
import { ProductDto } from '../../products/dto/product-response.dto';
import { MOVEMENT_FILTERS } from './inventory-query.dto';

export class InventoryItemDto extends ProductDto {
  @ApiProperty({ example: 10 }) minStockValue!: number;
  @ApiProperty({ example: 1008000 }) stockValue!: number;
  @ApiProperty({ enum: ['ok', 'low', 'out'] }) level!: string;
  @ApiProperty({ example: 42 }) soldLast30!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastMovementAt!: Date | null;
  @ApiProperty() slow!: boolean;
}

class LevelCountsDto {
  @ApiProperty() all!: number;
  @ApiProperty() ok!: number;
  @ApiProperty() low!: number;
  @ApiProperty() out!: number;
  @ApiProperty() slow!: number;
}

export class InventoryPageDto {
  @ApiProperty({ type: [InventoryItemDto] }) items!: InventoryItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({
    type: LevelCountsDto,
    description: 'Theo keyword + danh mục, bỏ qua bộ lọc mức tồn',
  })
  levelCounts!: LevelCountsDto;
}

export class InventoryStatsDto {
  @ApiProperty({ example: 48250000 }) stockValue!: number;
  @ApiProperty({ example: 29 }) skuCount!: number;
  @ApiProperty({ example: 1934 }) units!: number;
  @ApiProperty() low!: number;
  @ApiProperty() out!: number;
  @ApiProperty() slow!: number;
}

export class StockMovementDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ example: 'Nước suối Aquafina 500ml' }) productName!: string;
  @ApiProperty({ example: 'SP0003' }) sku!: string;
  @ApiProperty({ type: String, nullable: true }) barcode!: string | null;
  @ApiProperty({ example: 'Chai' }) unit!: string;
  @ApiProperty({ enum: MOVEMENT_FILTERS.filter((type) => !['all', 'in', 'out'].includes(type)) })
  type!: string;
  @ApiProperty({ example: -2 }) quantity!: number;
  @ApiProperty({ example: 50 }) before!: number;
  @ApiProperty({ example: 48 }) after!: number;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true }) refCode!: string | null;
  @ApiProperty({ example: 'Minh Thư' }) createdBy!: string;
  @ApiProperty() createdAt!: Date;
}

class StockPointDto {
  @ApiProperty({ example: '2026-11-24' }) date!: string;
  @ApiProperty({ example: 48 }) stock!: number;
}

export class InventoryDetailDto {
  @ApiProperty({ type: InventoryItemDto }) item!: InventoryItemDto;
  @ApiProperty({ type: [StockPointDto], description: 'Tồn cuối ngày (giờ VN), cũ → mới' })
  series!: StockPointDto[];
  @ApiProperty({ type: [StockMovementDto] }) recent!: StockMovementDto[];
}

class MovementSummaryDto {
  @ApiProperty() inQty!: number;
  @ApiProperty() outQty!: number;
}

export class MovementPageDto {
  @ApiProperty({ type: [StockMovementDto] }) items!: StockMovementDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({ type: MovementSummaryDto }) summary!: MovementSummaryDto;
}

export class AdjustResultDto {
  @ApiProperty({ type: InventoryItemDto }) item!: InventoryItemDto;
  @ApiProperty({ type: StockMovementDto }) movement!: StockMovementDto;
}
