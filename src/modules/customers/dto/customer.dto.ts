import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { normalizePhone } from '../../../common/utils/mask';
import { NullableText, TrimName } from '../../catalog/dto/shared';
import { LEGACY_SPENT_MAX, POINTS_MAX } from '../customers.utils';

export const GENDERS = ['male', 'female', 'other'] as const;
export const CUSTOMER_STATUSES = ['active', 'blocked'] as const;
export type CustomerStatusValue = (typeof CUSTOMER_STATUSES)[number];

const map = (fn: (value: string) => unknown) =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? fn(value) : value));
const Phone = () =>
  map((v) => {
    const digits = v.replace(/[^\d+]/g, '');
    return normalizePhone(digits) ?? digits;
  });
const LowerOrNull = () => map((v) => v.trim().toLowerCase() || null);
const EmptyToNull = () => map((v) => v.trim() || null);

export class CustomerInputDto {
  @ApiProperty({ example: 'Nguyễn Minh Anh', minLength: 2, maxLength: 100 })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập tên khách hàng' })
  @MinLength(2, { message: 'Tên khách hàng tối thiểu 2 ký tự' })
  @MaxLength(100, { message: 'Tên khách hàng tối đa 100 ký tự' })
  name!: string;

  @ApiProperty({
    example: '0901234567',
    description: 'Nhận cả +84 / 84, tự chuẩn hóa về 0xxxxxxxxx',
  })
  @Phone()
  @IsString({ message: 'Vui lòng nhập số điện thoại' })
  @IsNotEmpty({ message: 'Vui lòng nhập số điện thoại' })
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại gồm 10 số, bắt đầu bằng 0' })
  phone!: string;

  @ApiPropertyOptional({ example: 'minhanh@gmail.com', nullable: true })
  @IsOptional()
  @LowerOrNull()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(150, { message: 'Email quá dài' })
  email?: string | null;

  @ApiPropertyOptional({ enum: GENDERS, nullable: true })
  @IsOptional()
  @EmptyToNull()
  @IsIn(GENDERS, { message: 'Giới tính không hợp lệ' })
  gender?: (typeof GENDERS)[number] | null;

  @ApiPropertyOptional({ example: '1990-11-25', nullable: true })
  @IsOptional()
  @EmptyToNull()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày sinh dạng yyyy-MM-dd' })
  birthday?: string | null;

  @ApiPropertyOptional({ example: 'Q.1, TP.HCM', nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(255, { message: 'Địa chỉ tối đa 255 ký tự' })
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string | null;

  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES, default: 'active' })
  @IsOptional()
  @IsIn(CUSTOMER_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status?: CustomerStatusValue;

  @ApiPropertyOptional({ example: 0, description: 'Chỉ admin — chi tiêu từ hệ thống cũ' })
  @IsOptional()
  @IsInt({ message: 'Chi tiêu cũ phải là số nguyên' })
  @Min(0, { message: 'Chi tiêu cũ không được âm' })
  @Max(LEGACY_SPENT_MAX, { message: 'Chi tiêu cũ tối đa 10 tỷ' })
  legacySpent?: number;
}

export class CreateCustomerDto extends CustomerInputDto {
  @ApiPropertyOptional({ example: 0, description: 'Chỉ admin, chỉ khi tạo — ghi log opening' })
  @IsOptional()
  @IsInt({ message: 'Điểm đầu kỳ phải là số nguyên' })
  @Min(0, { message: 'Điểm đầu kỳ không được âm' })
  @Max(POINTS_MAX, { message: 'Điểm đầu kỳ tối đa 1.000.000' })
  openingPoints?: number;
}

export class UpdateCustomerDto extends PartialType(CustomerInputDto) {}

export class CustomerStatusDto {
  @ApiProperty({ enum: CUSTOMER_STATUSES })
  @IsIn(CUSTOMER_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status!: CustomerStatusValue;

  @ApiPropertyOptional({ example: 'Gian lận tích điểm', maxLength: 120 })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(120, { message: 'Lý do tối đa 120 ký tự' })
  reason?: string | null;
}

export class AdjustPointsDto {
  @ApiProperty({ example: 50, description: 'Có dấu; redeem luôn trừ |points|' })
  @IsInt({ message: 'Số điểm phải là số nguyên' })
  @Min(-POINTS_MAX, { message: 'Tối đa 1.000.000 điểm' })
  @Max(POINTS_MAX, { message: 'Tối đa 1.000.000 điểm' })
  points!: number;

  @ApiProperty({ enum: ['adjust', 'redeem'] })
  @IsIn(['adjust', 'redeem'], { message: 'Loại điều chỉnh không hợp lệ' })
  type!: 'adjust' | 'redeem';

  @ApiProperty({ example: 'Tặng điểm sinh nhật', maxLength: 120 })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập lý do' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do' })
  @MaxLength(120, { message: 'Lý do tối đa 120 ký tự' })
  reason!: string;
}
