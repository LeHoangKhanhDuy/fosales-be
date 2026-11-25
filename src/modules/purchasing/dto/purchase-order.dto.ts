import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
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

export class PurchaseOrderItemInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Sản phẩm không hợp lệ' })
  productId!: string;

  @ApiProperty({ example: 96 })
  @IsInt({ message: 'Số lượng đặt phải là số nguyên' })
  @Min(1, { message: 'Số lượng đặt tối thiểu 1' })
  @Max(1_000_000, { message: 'Số lượng đặt quá lớn' })
  orderedQty!: number;

  @ApiProperty({ example: 7200 })
  @IsInt({ message: 'Giá nhập phải là số nguyên' })
  @Min(0, { message: 'Giá nhập không được âm' })
  @Max(1_000_000_000, { message: 'Giá nhập quá lớn' })
  unitCost!: number;

  @ApiPropertyOptional({
    example: 24,
    description: 'Mặc định theo đơn vị (lon/chai 24, gói 30, hộp 12, lốc 6, tuýp 12)',
  })
  @IsOptional()
  @IsInt({ message: 'Quy cách thùng phải là số nguyên' })
  @Min(1, { message: 'Quy cách thùng tối thiểu 1' })
  @Max(1000, { message: 'Quy cách thùng tối đa 1000' })
  packSize?: number;
}

export class PurchaseOrderInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Vui lòng chọn nhà cung cấp' })
  supplierId!: string;

  @ApiProperty({ example: '2026-11-28' })
  @IsISO8601({}, { message: 'Ngày giao dự kiến không hợp lệ' })
  expectedDate!: string;

  @ApiProperty({ type: [PurchaseOrderItemInputDto] })
  @IsArray({ message: 'Danh sách sản phẩm không hợp lệ' })
  @ArrayMaxSize(200, { message: 'Tối đa 200 dòng sản phẩm' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInputDto)
  items!: PurchaseOrderItemInputDto[];

  @ApiPropertyOptional({ example: 50000, default: 0 })
  @IsOptional()
  @IsInt({ message: 'Chiết khấu phải là số nguyên' })
  @Min(0, { message: 'Chiết khấu không được âm' })
  discount?: number;

  @ApiPropertyOptional({ example: 'Giao buổi sáng trước 10h', nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string | null;
}

export class CreatePurchaseOrderDto extends PurchaseOrderInputDto {
  @ApiPropertyOptional({ default: false, description: 'true → gửi đơn cho NCC ngay (ordered)' })
  @IsOptional()
  @IsBoolean()
  place?: boolean;
}

export class UpdatePurchaseOrderDto extends PartialType(PurchaseOrderInputDto) {}

export class CancelPurchaseOrderDto {
  @ApiProperty({ example: 'Nhà cung cấp hết hàng', maxLength: 200 })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập lý do hủy' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do hủy' })
  @MaxLength(200, { message: 'Lý do tối đa 200 ký tự' })
  reason!: string;
}
