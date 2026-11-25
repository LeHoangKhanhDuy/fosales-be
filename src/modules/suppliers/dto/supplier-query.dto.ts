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
import { SUPPLIER_STATUSES, type SupplierStatusValue } from './supplier.dto';

export const SUPPLIER_TABS = ['active', 'suspended', 'inactive', 'debt'] as const;
export const SUPPLIER_SORTS = ['newest', 'name', 'debt', 'purchased'] as const;
export type SupplierTab = (typeof SUPPLIER_TABS)[number];
export type SupplierSort = (typeof SUPPLIER_SORTS)[number];

export class PageDto {
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
}

export class SupplierListQueryDto extends PageDto {
  @ApiPropertyOptional({
    example: 'minh phat',
    description: 'Không dấu: tên, mã, liên hệ, SĐT, MST, email',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100, { message: 'Từ khóa quá dài' })
  keyword?: string;

  @ApiPropertyOptional({ enum: SUPPLIER_TABS })
  @IsOptional()
  @IsIn(SUPPLIER_TABS, { message: 'Tab không hợp lệ' })
  tab?: SupplierTab;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ' })
  categoryId?: string;

  @ApiPropertyOptional({ enum: SUPPLIER_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(SUPPLIER_SORTS, { message: 'Kiểu sắp xếp không hợp lệ' })
  sort: SupplierSort = 'newest';
}

export class SupplierOptionsQueryDto {
  @ApiPropertyOptional({ enum: SUPPLIER_STATUSES, default: 'active' })
  @IsOptional()
  @IsIn(SUPPLIER_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status: SupplierStatusValue = 'active';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ' })
  categoryId?: string;
}

export class LedgerQueryDto extends PageDto {
  @ApiPropertyOptional({ example: '2026-11-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-01T00:00:00.000Z', description: 'Không bao gồm' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  to?: string;
}

export class TopProductsQueryDto {
  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giới hạn không hợp lệ' })
  @Min(1, { message: 'Giới hạn không hợp lệ' })
  @Max(50, { message: 'Tối đa 50' })
  limit: number = 8;
}
