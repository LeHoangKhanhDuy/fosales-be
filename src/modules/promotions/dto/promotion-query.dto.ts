import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PageDto } from '../../suppliers/dto/supplier-query.dto';
import { PROMOTION_STATUSES } from '../promotions.utils';
import { PROMOTION_KINDS } from './promotion.dto';

export const PROMOTION_SORTS = ['newest', 'ending', 'usage'] as const;
export type PromotionSort = (typeof PROMOTION_SORTS)[number];

const AllToUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    value === '' || value === 'all' ? undefined : value,
  );

export class PromotionListQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: PROMOTION_KINDS })
  @IsOptional()
  @AllToUndefined()
  @IsIn(PROMOTION_KINDS, { message: 'Loại khuyến mãi không hợp lệ' })
  kind?: (typeof PROMOTION_KINDS)[number];

  @ApiPropertyOptional({ description: 'Không dấu theo mã / tên' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100, { message: 'Từ khóa quá dài' })
  keyword?: string;

  @ApiPropertyOptional({ enum: PROMOTION_STATUSES })
  @IsOptional()
  @AllToUndefined()
  @IsIn(PROMOTION_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status?: (typeof PROMOTION_STATUSES)[number];

  @ApiPropertyOptional({ enum: PROMOTION_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(PROMOTION_SORTS, { message: 'Kiểu sắp xếp không hợp lệ' })
  sort: PromotionSort = 'newest';
}

export class GenerateCodeQueryDto {
  @ApiPropertyOptional({ example: 'FOTECH', description: 'Tối đa 14 ký tự A-Z 0-9 _ -' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9_-]{0,14}$/, { message: 'Tiền tố tối đa 14 ký tự, chỉ gồm chữ, số, - và _' })
  prefix?: string;
}
