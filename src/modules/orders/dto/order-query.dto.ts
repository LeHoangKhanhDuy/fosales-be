import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageDto } from '../../suppliers/dto/supplier-query.dto';

export const ORDER_STATUSES = [
  'pending',
  'completed',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const;
export const ORDER_SORTS = ['newest', 'oldest', 'total-desc', 'total-asc'] as const;
export const PAYMENT_METHODS = ['cash', 'transfer', 'card', 'ewallet', 'points'] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const AllToUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    value === '' || value === 'all' ? undefined : value,
  );

export class RangeDto {
  @ApiPropertyOptional({ example: '2026-11-25T17:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-26T17:00:00.000Z', description: 'Không bao gồm' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  to?: string;
}

export class OrderListQueryDto extends PageDto {
  @ApiPropertyOptional({ description: 'Mã đơn, tên/SĐT khách, tên/SKU/barcode sản phẩm' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100, { message: 'Từ khóa quá dài' })
  keyword?: string;

  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @AllToUndefined()
  @IsIn(ORDER_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status?: (typeof ORDER_STATUSES)[number];

  @ApiPropertyOptional({ example: '2026-11-25T17:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-26T17:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  to?: string;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @AllToUndefined()
  @IsIn(PAYMENT_METHODS, { message: 'Phương thức không hợp lệ' })
  payment?: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Thu ngân không hợp lệ' })
  cashierId?: string;

  @ApiPropertyOptional({ enum: ORDER_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(ORDER_SORTS, { message: 'Kiểu sắp xếp không hợp lệ' })
  sort: OrderSort = 'newest';
}

export class LookupQueryDto {
  @ApiPropertyOptional({ example: 'HD261126-0001' })
  @Trim()
  @IsString({ message: 'Vui lòng nhập mã đơn' })
  @MaxLength(30)
  code!: string;
}

export class ReturnListQueryDto extends PageDto {
  @ApiPropertyOptional({ description: 'Mã TH / mã HD / tên khách' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Mốc thời gian không hợp lệ' })
  to?: string;
}
