import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { normalizePhone } from '../../../common/utils/mask';
import { NullableText, TrimName } from '../../catalog/dto/shared';
import { MAX_PAYMENT, SUPPLIER_CODE_PATTERN } from '../suppliers.utils';

export const SUPPLIER_STATUSES = ['active', 'suspended', 'inactive'] as const;
export const PAYMENT_METHODS = ['cash', 'transfer'] as const;
export type SupplierStatusValue = (typeof SUPPLIER_STATUSES)[number];

const map = (fn: (value: string) => unknown) =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? fn(value) : value));
const UpperCode = () => map((v) => v.trim().toUpperCase() || undefined);
const Phone = () => map((v) => normalizePhone(v) ?? v.replace(/\s+/g, ''));
const LowerOrNull = () => map((v) => v.trim().toLowerCase() || null);
const DigitsOrNull = () => map((v) => v.replace(/\s+/g, '') || null);
const UpperOrNull = () => map((v) => v.trim().replace(/\s+/g, ' ').toUpperCase() || null);
const Unique = () =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? [...new Set(value)] : value,
  );

export class SupplierStatusDto {
  @ApiProperty({ enum: SUPPLIER_STATUSES, example: 'suspended' })
  @IsIn(SUPPLIER_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status!: SupplierStatusValue;

  @ApiPropertyOptional({ example: 'Giao hàng trễ nhiều lần', maxLength: 120 })
  @IsOptional()
  @NullableText()
  @IsString({ message: 'Lý do không hợp lệ' })
  @MaxLength(120, { message: 'Lý do tối đa 120 ký tự' })
  reason?: string | null;

  @ApiPropertyOptional({ example: '2026-12-31T17:00:00.000Z', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Ngày hết tạm ngưng không hợp lệ' })
  until?: string | null;
}

export class CreateSupplierDto {
  @ApiPropertyOptional({ example: 'NCC008', description: 'Bỏ trống để tự sinh NCCxxx' })
  @IsOptional()
  @UpperCode()
  @Matches(SUPPLIER_CODE_PATTERN, {
    message: 'Mã gồm 2–20 ký tự chữ, số, gạch ngang hoặc gạch dưới',
  })
  code?: string;

  @ApiProperty({ example: 'Công ty TNHH Phân phối Minh Phát' })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập tên nhà cung cấp' })
  @MinLength(2, { message: 'Tên nhà cung cấp tối thiểu 2 ký tự' })
  @MaxLength(150, { message: 'Tên nhà cung cấp tối đa 150 ký tự' })
  name!: string;

  @ApiProperty({ example: 'Anh Tuấn' })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập người liên hệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập người liên hệ' })
  @MaxLength(100, { message: 'Người liên hệ tối đa 100 ký tự' })
  contact!: string;

  @ApiProperty({ example: '0903112233' })
  @Phone()
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại gồm 10 số, bắt đầu bằng 0' })
  phone!: string;

  @ApiPropertyOptional({ example: 'order@minhphat.vn', nullable: true })
  @IsOptional()
  @LowerOrNull()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(150, { message: 'Email quá dài' })
  email?: string | null;

  @ApiProperty({ example: '128 Cộng Hòa, P.4, Q. Tân Bình, TP.HCM' })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập địa chỉ' })
  @IsNotEmpty({ message: 'Vui lòng nhập địa chỉ' })
  @MaxLength(255, { message: 'Địa chỉ tối đa 255 ký tự' })
  address!: string;

  @ApiPropertyOptional({ example: '0312456789', nullable: true })
  @IsOptional()
  @DigitsOrNull()
  @Matches(/^(\d{10}|\d{13})$/, { message: 'Mã số thuế gồm 10 hoặc 13 chữ số' })
  taxCode?: string | null;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @Unique()
  @IsArray({ message: 'Danh mục cung cấp không hợp lệ' })
  @ArrayMaxSize(50, { message: 'Tối đa 50 danh mục' })
  @IsUUID('all', { each: true, message: 'Danh mục cung cấp không hợp lệ' })
  categoryIds?: string[];

  @ApiPropertyOptional({ example: 15, default: 15 })
  @IsOptional()
  @IsInt({ message: 'Kỳ hạn thanh toán phải là số nguyên' })
  @Min(0, { message: 'Kỳ hạn thanh toán không hợp lệ' })
  @Max(365, { message: 'Kỳ hạn thanh toán tối đa 365 ngày' })
  paymentTermDays?: number;

  @ApiPropertyOptional({ example: 'Vietcombank', nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(100, { message: 'Tên ngân hàng tối đa 100 ký tự' })
  bankName?: string | null;

  @ApiPropertyOptional({ example: '0071000123456', nullable: true })
  @IsOptional()
  @DigitsOrNull()
  @Matches(/^\d{6,19}$/, { message: 'Số tài khoản gồm 6–19 chữ số' })
  bankAccount?: string | null;

  @ApiPropertyOptional({ example: 'CONG TY TNHH PHAN PHOI MINH PHAT', nullable: true })
  @IsOptional()
  @UpperOrNull()
  @IsString()
  @MaxLength(100, { message: 'Chủ tài khoản tối đa 100 ký tự' })
  bankHolder?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string | null;

  @ApiPropertyOptional({ enum: SUPPLIER_STATUSES, default: 'active' })
  @IsOptional()
  @IsIn(SUPPLIER_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status?: SupplierStatusValue;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(120, { message: 'Lý do tối đa 120 ký tự' })
  suspendReason?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-12-31T17:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Ngày hết tạm ngưng không hợp lệ' })
  suspendedUntil?: string | null;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class CreateSupplierPaymentDto {
  @ApiProperty({ example: 5000000, maximum: MAX_PAYMENT })
  @IsInt({ message: 'Số tiền phải là số nguyên' })
  @Min(1, { message: 'Số tiền phải lớn hơn 0' })
  @Max(MAX_PAYMENT, { message: 'Số tiền quá lớn' })
  amount!: number;

  @ApiProperty({ enum: PAYMENT_METHODS, example: 'transfer' })
  @IsIn(PAYMENT_METHODS, { message: 'Phương thức thanh toán không hợp lệ' })
  method!: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ example: 'FT26112512345', maxLength: 60, nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(60, { message: 'Mã giao dịch tối đa 60 ký tự' })
  reference?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(255, { message: 'Ghi chú tối đa 255 ký tự' })
  note?: string | null;
}
