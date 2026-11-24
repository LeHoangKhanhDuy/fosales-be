import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const INVENTORY_LEVELS = ['ok', 'low', 'out', 'slow'] as const;
export const INVENTORY_SORTS = ['value-desc', 'stock-asc', 'stock-desc', 'recent', 'name'] as const;
export const MOVEMENT_FILTERS = [
  'all',
  'in',
  'out',
  'sale',
  'return',
  'import',
  'adjust-in',
  'adjust-out',
  'initial',
] as const;

export type InventoryLevel = (typeof INVENTORY_LEVELS)[number];
export type InventorySort = (typeof INVENTORY_SORTS)[number];
export type MovementFilter = (typeof MOVEMENT_FILTERS)[number];

const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

class PageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Trang không hợp lệ' })
  @Min(1, { message: 'Trang không hợp lệ' })
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số dòng mỗi trang không hợp lệ' })
  @Min(1, { message: 'Số dòng mỗi trang không hợp lệ' })
  @Max(100, { message: 'Tối đa 100 dòng mỗi trang' })
  pageSize: number = 10;

  @ApiPropertyOptional({ example: 'nuoc suoi', description: 'Tìm không dấu' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100, { message: 'Từ khóa quá dài' })
  keyword?: string;
}

export class InventoryListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ' })
  categoryId?: string;

  @ApiPropertyOptional({ enum: INVENTORY_LEVELS })
  @IsOptional()
  @IsIn(INVENTORY_LEVELS, { message: 'Mức tồn không hợp lệ' })
  level?: InventoryLevel;

  @ApiPropertyOptional({ enum: INVENTORY_SORTS, default: 'value-desc' })
  @IsOptional()
  @IsIn(INVENTORY_SORTS, { message: 'Kiểu sắp xếp không hợp lệ' })
  sort: InventorySort = 'value-desc';
}

export class InventoryDetailQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số ngày không hợp lệ' })
  @Min(1, { message: 'Số ngày không hợp lệ' })
  @Max(90, { message: 'Tối đa 90 ngày' })
  days: number = 30;
}

export class MovementListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: MOVEMENT_FILTERS, default: 'all' })
  @IsOptional()
  @IsIn(MOVEMENT_FILTERS, { message: 'Loại biến động không hợp lệ' })
  type: MovementFilter = 'all';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Sản phẩm không hợp lệ' })
  productId?: string;

  @ApiPropertyOptional({ example: '2026-11-23T17:00:00.000Z', description: 'Bao gồm' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-24T17:00:00.000Z', description: 'Không bao gồm' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  to?: string;
}
