import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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
import { QueryBoolean } from '../../catalog/dto/shared';
import { PageDto } from '../../suppliers/dto/supplier-query.dto';

export const PURCHASE_TABS = [
  'open',
  'all',
  'draft',
  'ordered',
  'partial',
  'completed',
  'cancelled',
] as const;
export type PurchaseTab = (typeof PURCHASE_TABS)[number];

const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

class RangeQueryDto extends PageDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Nhà cung cấp không hợp lệ' })
  supplierId?: string;

  @ApiPropertyOptional({ example: '2026-11-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-01T00:00:00.000Z', description: 'Không bao gồm' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100, { message: 'Từ khóa quá dài' })
  keyword?: string;
}

export class PurchaseOrderListQueryDto extends RangeQueryDto {
  @ApiPropertyOptional({ enum: PURCHASE_TABS, default: 'open' })
  @IsOptional()
  @IsIn(PURCHASE_TABS, { message: 'Tab không hợp lệ' })
  tab: PurchaseTab = 'open';

  @ApiPropertyOptional({ description: 'true → chỉ đơn quá hạn giao' })
  @IsOptional()
  @QueryBoolean(false)
  @IsBoolean()
  overdue: boolean = false;
}

export class GoodsReceiptListQueryDto extends RangeQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Đơn đặt hàng không hợp lệ' })
  poId?: string;
}

export class SuggestionQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Nhà cung cấp không hợp lệ' })
  supplierId?: string;

  @ApiPropertyOptional({ default: 30, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giới hạn không hợp lệ' })
  @Min(1, { message: 'Giới hạn không hợp lệ' })
  @Max(100, { message: 'Tối đa 100' })
  limit: number = 30;
}
