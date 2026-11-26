import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { NullableText, TrimName } from '../../catalog/dto/shared';

export const MONEY_METHODS = ['cash', 'transfer', 'card', 'ewallet'] as const;
export type MoneyMethod = (typeof MONEY_METHODS)[number];
const MONEY_MAX = 2_000_000_000;

const UpperOrNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || null : value,
  );

export class OrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Sản phẩm không hợp lệ' })
  productId!: string;

  @ApiProperty({ example: 2 })
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng tối thiểu 1' })
  @Max(10_000, { message: 'Số lượng tối đa 10.000' })
  quantity!: number;
}

export class QuoteDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray({ message: 'Giỏ hàng không hợp lệ' })
  @ArrayMinSize(1, { message: 'Giỏ hàng đang trống' })
  @ArrayMaxSize(200, { message: 'Tối đa 200 dòng sản phẩm' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all', { message: 'Khách hàng không hợp lệ' })
  customerId?: string | null;

  @ApiPropertyOptional({ example: 'FOSALE10', nullable: true })
  @IsOptional()
  @UpperOrNull()
  @IsString()
  @MaxLength(40, { message: 'Mã giảm giá không hợp lệ' })
  voucherCode?: string | null;

  @ApiPropertyOptional({ example: 0, description: 'Số điểm khách muốn dùng' })
  @IsOptional()
  @IsInt({ message: 'Số điểm phải là số nguyên' })
  @Min(0, { message: 'Số điểm không được âm' })
  @Max(1_000_000, { message: 'Số điểm quá lớn' })
  redeemPoints?: number;
}

export class PaymentDto {
  @ApiProperty({ enum: MONEY_METHODS })
  @IsIn(MONEY_METHODS, { message: 'Phương thức thanh toán không hợp lệ' })
  method!: MoneyMethod;

  @ApiPropertyOptional({
    example: 40000,
    description: 'Bắt buộc với transfer/card/ewallet; cash tự tính',
  })
  @IsOptional()
  @IsInt({ message: 'Số tiền phải là số nguyên' })
  @Min(0, { message: 'Số tiền không được âm' })
  @Max(MONEY_MAX, { message: 'Số tiền quá lớn' })
  amount?: number;

  @ApiPropertyOptional({ example: 100000, description: 'Chỉ cash: tiền khách đưa' })
  @IsOptional()
  @IsInt({ message: 'Tiền khách đưa phải là số nguyên' })
  @Min(0, { message: 'Tiền khách đưa không được âm' })
  @Max(MONEY_MAX, { message: 'Tiền khách đưa quá lớn' })
  tendered?: number;

  @ApiPropertyOptional({ example: 'FT26330123456', nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(60, { message: 'Mã giao dịch tối đa 60 ký tự' })
  reference?: string | null;

  @ApiPropertyOptional({ description: 'transfer/ewallet: thu ngân đã thấy tiền' })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

export class CreateOrderDto extends QuoteDto {
  @ApiProperty({ type: [PaymentDto] })
  @IsArray({ message: 'Thanh toán không hợp lệ' })
  @ArrayMaxSize(5, { message: 'Tối đa 5 khoản thanh toán' })
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments!: PaymentDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string | null;

  @ApiProperty({ example: 98000, description: 'Tổng tiền FE đang hiển thị (trước khi trừ điểm)' })
  @IsInt({ message: 'Tổng tiền không hợp lệ' })
  @Min(0)
  expectedTotal!: number;
}

export class ConfirmPaymentDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Bỏ trống → khoản đang chờ đầu tiên' })
  @IsOptional()
  @IsUUID('all', { message: 'Khoản thanh toán không hợp lệ' })
  paymentId?: string;

  @ApiPropertyOptional({ example: 'FT26330123456' })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(60, { message: 'Mã giao dịch tối đa 60 ký tự' })
  reference?: string | null;
}

export class ReasonDto {
  @ApiProperty({ example: 'Khách không chuyển khoản', maxLength: 200 })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập lý do' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do' })
  @MaxLength(200, { message: 'Lý do tối đa 200 ký tự' })
  reason!: string;
}

export class ReturnLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Dòng hàng không hợp lệ' })
  orderLineId!: string;

  @ApiProperty({ example: 1 })
  @IsInt({ message: 'Số lượng trả phải là số nguyên' })
  @Min(1, { message: 'Số lượng trả tối thiểu 1' })
  @Max(10_000)
  quantity!: number;

  @ApiProperty({ description: 'true → nhập lại kho; false → hàng hỏng' })
  @IsBoolean()
  restock!: boolean;
}

class ReturnOptionsDto extends ReasonDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(60)
  refundReference?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string | null;

  @ApiPropertyOptional({ example: 'Quốc Huy', nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(100)
  approvedBy?: string | null;

  @ApiPropertyOptional({ description: 'Chỉ admin: bỏ qua hạn trả hàng' })
  @IsOptional()
  @IsBoolean()
  override?: boolean;
}

export class RefundOptionsDto extends ReturnOptionsDto {
  @ApiPropertyOptional({ enum: MONEY_METHODS, description: 'Mặc định: phương thức chính của đơn' })
  @IsOptional()
  @IsIn(MONEY_METHODS, { message: 'Phương thức hoàn tiền không hợp lệ' })
  refundMethod?: MoneyMethod;
}

export class CreateReturnDto extends ReturnOptionsDto {
  @ApiProperty({ type: [ReturnLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Chọn ít nhất 1 dòng hàng để trả' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines!: ReturnLineDto[];

  @ApiProperty({ enum: MONEY_METHODS })
  @IsIn(MONEY_METHODS, { message: 'Phương thức hoàn tiền không hợp lệ' })
  refundMethod!: MoneyMethod;
}
