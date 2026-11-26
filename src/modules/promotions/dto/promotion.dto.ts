import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { NullableText, TrimName } from '../../catalog/dto/shared';
import { CODE_PATTERN } from '../promotions.utils';

export const PROMOTION_KINDS = ['voucher', 'product', 'order', 'gift'] as const;
export const DISCOUNT_TYPES = ['percent', 'amount'] as const;
export const SCOPE_TYPES = ['all', 'categories', 'products'] as const;
export const SETTABLE_STATES = ['active', 'paused', 'ended'] as const;

const Upper = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  );
const Unique = () =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? [...new Set(value)] : value,
  );

export class ScopeDto {
  @ApiProperty({ enum: SCOPE_TYPES, default: 'all' })
  @IsIn(SCOPE_TYPES, { message: 'Phạm vi không hợp lệ' })
  type!: (typeof SCOPE_TYPES)[number];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @Unique()
  @IsArray()
  @ArrayMaxSize(200, { message: 'Tối đa 200 danh mục' })
  @IsUUID('all', { each: true, message: 'Danh mục không hợp lệ' })
  categoryIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @Unique()
  @IsArray()
  @ArrayMaxSize(500, { message: 'Tối đa 500 sản phẩm' })
  @IsUUID('all', { each: true, message: 'Sản phẩm không hợp lệ' })
  productIds?: string[];
}

export class PromotionInputDto {
  @ApiProperty({ example: 'FOSALE10', description: '4–20 ký tự A-Z 0-9 _ -, tự viết hoa' })
  @Upper()
  @IsString({ message: 'Vui lòng nhập mã giảm giá' })
  @Matches(CODE_PATTERN, { message: 'Mã 4–20 ký tự, chỉ gồm chữ, số, - và _' })
  code!: string;

  @ApiProperty({ example: 'Giảm 10% toàn đơn' })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập tên chương trình' })
  @MinLength(2, { message: 'Tên chương trình tối thiểu 2 ký tự' })
  @MaxLength(120, { message: 'Tên chương trình tối đa 120 ký tự' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự' })
  description?: string | null;

  @ApiPropertyOptional({ enum: PROMOTION_KINDS, default: 'voucher' })
  @IsOptional()
  @IsIn(PROMOTION_KINDS, { message: 'Loại khuyến mãi không hợp lệ' })
  kind?: (typeof PROMOTION_KINDS)[number];

  @ApiProperty({ enum: DISCOUNT_TYPES })
  @IsIn(DISCOUNT_TYPES, { message: 'Kiểu giảm không hợp lệ' })
  discountType!: (typeof DISCOUNT_TYPES)[number];

  @ApiProperty({ example: 10, description: 'percent: 1–100; amount: 1.000–100.000.000' })
  @IsInt({ message: 'Mức giảm phải là số nguyên' })
  discountValue!: number;

  @ApiPropertyOptional({ example: 50000, nullable: true, description: 'Chỉ với percent' })
  @IsOptional()
  @IsInt({ message: 'Giảm tối đa phải là số nguyên' })
  @Min(1000, { message: 'Giảm tối đa tối thiểu 1.000đ' })
  @Max(100_000_000, { message: 'Giảm tối đa quá lớn' })
  maxDiscount?: number | null;

  @ApiPropertyOptional({ example: 100000, nullable: true })
  @IsOptional()
  @IsInt({ message: 'Đơn tối thiểu phải là số nguyên' })
  @Min(0, { message: 'Đơn tối thiểu không được âm' })
  @Max(2_000_000_000, { message: 'Đơn tối thiểu quá lớn' })
  minOrder?: number | null;

  @ApiPropertyOptional({ type: ScopeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScopeDto)
  scope?: ScopeDto;

  @ApiPropertyOptional({ example: 500, nullable: true })
  @IsOptional()
  @IsInt({ message: 'Giới hạn lượt phải là số nguyên' })
  @Min(1, { message: 'Giới hạn lượt tối thiểu 1' })
  @Max(10_000_000, { message: 'Giới hạn lượt quá lớn' })
  usageLimit?: number | null;

  @ApiPropertyOptional({
    example: 1,
    nullable: true,
    description: 'Có giá trị → bắt buộc chọn khách',
  })
  @IsOptional()
  @IsInt({ message: 'Giới hạn mỗi khách phải là số nguyên' })
  @Min(1, { message: 'Giới hạn mỗi khách tối thiểu 1' })
  @Max(10_000_000, { message: 'Giới hạn mỗi khách quá lớn' })
  perCustomerLimit?: number | null;

  @ApiPropertyOptional({ default: true, description: 'Dùng chung với KM hóa đơn' })
  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  @ApiProperty({ example: '2026-11-25T00:00:00.000+07:00' })
  @IsISO8601({}, { message: 'Ngày bắt đầu không hợp lệ' })
  startAt!: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000+07:00', nullable: true })
  @IsOptional()
  @IsISO8601({}, { message: 'Ngày kết thúc không hợp lệ' })
  endAt?: string | null;
}

export class CreatePromotionDto extends PromotionInputDto {
  @ApiPropertyOptional({ default: false, description: 'true → kích hoạt ngay (state active)' })
  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}

export class UpdatePromotionDto extends PartialType(
  OmitType(PromotionInputDto, ['kind'] as const),
) {
  @ApiPropertyOptional({ description: 'true → kích hoạt nếu đang nháp' })
  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}

export class PromotionStateDto {
  @ApiProperty({ enum: SETTABLE_STATES })
  @IsIn(SETTABLE_STATES, { message: 'Trạng thái không hợp lệ' })
  state!: (typeof SETTABLE_STATES)[number];
}

export class ValidateVoucherDto {
  @ApiProperty({ example: 'fosale10', description: 'Không phân biệt hoa/thường' })
  @Upper()
  @IsString({ message: 'Vui lòng nhập mã giảm giá' })
  @MinLength(1, { message: 'Vui lòng nhập mã giảm giá' })
  @MaxLength(40, { message: 'Mã giảm giá không hợp lệ' })
  code!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all', { message: 'Khách hàng không hợp lệ' })
  customerId?: string | null;

  @ApiPropertyOptional({
    example: 250000,
    description: 'Không chặn ở bước kiểm tra (engine FE xử lý minOrder)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  cartTotal?: number;
}
