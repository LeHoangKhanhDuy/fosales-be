import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PageDto } from '../../suppliers/dto/supplier-query.dto';

export const CUSTOMER_TIERS = ['retail', 'silver', 'gold', 'diamond'] as const;
export const CUSTOMER_SEGMENTS = ['birthday', 'new30', 'inactive60', 'blocked'] as const;
export const CUSTOMER_SORTS = ['newest', 'spent', 'points', 'recent', 'name'] as const;
export const POINT_LOG_TYPES = ['opening', 'earn', 'revoke', 'adjust', 'redeem'] as const;
export type CustomerTierValue = (typeof CUSTOMER_TIERS)[number];
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const EmptyToUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    value === '' || value === 'all' ? undefined : value,
  );

export class CustomerListQueryDto extends PageDto {
  @ApiPropertyOptional({ description: 'Tên/mã KH/email không dấu; SĐT khi ≥ 3 chữ số' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100, { message: 'Từ khóa quá dài' })
  keyword?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_TIERS })
  @IsOptional()
  @EmptyToUndefined()
  @IsIn(CUSTOMER_TIERS, { message: 'Hạng không hợp lệ' })
  tier?: CustomerTierValue;

  @ApiPropertyOptional({ enum: CUSTOMER_SEGMENTS })
  @IsOptional()
  @EmptyToUndefined()
  @IsIn(CUSTOMER_SEGMENTS, { message: 'Phân khúc không hợp lệ' })
  segment?: CustomerSegment;

  @ApiPropertyOptional({ enum: CUSTOMER_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(CUSTOMER_SORTS, { message: 'Kiểu sắp xếp không hợp lệ' })
  sort: CustomerSort = 'newest';
}

export class CustomerSearchQueryDto {
  @ApiPropertyOptional({ description: 'Tên/SĐT/mã KH, không dấu' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100, { message: 'Từ khóa quá dài' })
  q?: string;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giới hạn không hợp lệ' })
  @Min(1, { message: 'Giới hạn không hợp lệ' })
  @Max(50, { message: 'Tối đa 50' })
  limit: number = 20;
}

export class CustomerLookupQueryDto {
  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'KH000001' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(20)
  code?: string;
}

export class PointLogQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: POINT_LOG_TYPES })
  @IsOptional()
  @IsIn(POINT_LOG_TYPES, { message: 'Loại điểm không hợp lệ' })
  type?: (typeof POINT_LOG_TYPES)[number];
}
