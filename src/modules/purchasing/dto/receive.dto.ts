import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
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

const QTY_MAX = 1_000_000;

export class CheckInDto {
  @ApiProperty({ example: 'HD-MP-0912', maxLength: 50 })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập số chứng từ của nhà cung cấp' })
  @IsNotEmpty({ message: 'Vui lòng nhập số chứng từ của nhà cung cấp' })
  @MaxLength(50, { message: 'Số chứng từ tối đa 50 ký tự' })
  supplierDocNo!: string;

  @ApiProperty({ example: 8 })
  @IsInt({ message: 'Số kiện phải là số nguyên' })
  @Min(0, { message: 'Số kiện không được âm' })
  @Max(10_000, { message: 'Số kiện quá lớn' })
  packageCount!: number;

  @ApiProperty({ example: true })
  @IsBoolean({ message: 'Tình trạng bao bì không hợp lệ' })
  packagingOk!: boolean;

  @ApiPropertyOptional({ example: 'Anh Hùng', nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(100, { message: 'Người giao tối đa 100 ký tự' })
  deliveredBy?: string | null;
}

export class ReceiveLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Sản phẩm không hợp lệ' })
  productId!: string;

  @ApiProperty({ example: 96 })
  @IsInt({ message: 'Số lượng đếm phải là số nguyên' })
  @Min(0, { message: 'Số lượng đếm không được âm' })
  @Max(QTY_MAX, { message: 'Số lượng đếm quá lớn' })
  scannedQty!: number;

  @ApiProperty({ example: 0 })
  @IsInt({ message: 'Số lượng hỏng phải là số nguyên' })
  @Min(0, { message: 'Số lượng hỏng không được âm' })
  @Max(QTY_MAX, { message: 'Số lượng hỏng quá lớn' })
  damagedQty!: number;

  @ApiProperty({ example: 7200 })
  @IsInt({ message: 'Giá nhập phải là số nguyên' })
  @Min(0, { message: 'Giá nhập không được âm' })
  @Max(1_000_000_000, { message: 'Giá nhập quá lớn' })
  unitCost!: number;

  @ApiProperty({ example: false, description: 'Dòng ngoài đơn' })
  @IsBoolean()
  extra!: boolean;

  @ApiProperty({ enum: ['backorder', 'cancel'] })
  @IsIn(['backorder', 'cancel'], { message: 'Cách xử lý thiếu hàng không hợp lệ' })
  shortageAction!: 'backorder' | 'cancel';

  @ApiProperty({ enum: ['accept', 'return'] })
  @IsIn(['accept', 'return'], { message: 'Cách xử lý thừa hàng không hợp lệ' })
  excessAction!: 'accept' | 'return';

  @ApiPropertyOptional({ example: '2027-06-30' })
  @IsOptional()
  @IsISO8601({}, { message: 'Hạn sử dụng không hợp lệ' })
  expiryDate?: string;

  @ApiPropertyOptional({ example: 'L2611A', maxLength: 40 })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(40, { message: 'Số lô tối đa 40 ký tự' })
  lotNo?: string | null;
}

export class ReceiveDto {
  @ApiProperty({ type: CheckInDto })
  @ValidateNested()
  @Type(() => CheckInDto)
  checkIn!: CheckInDto;

  @ApiProperty({ type: [ReceiveLineDto] })
  @IsArray({ message: 'Danh sách dòng kiểm đếm không hợp lệ' })
  @ArrayMaxSize(500, { message: 'Tối đa 500 dòng' })
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines!: ReceiveLineDto[];

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string | null;

  @ApiPropertyOptional({ example: 'Quốc Huy', maxLength: 100, nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(100, { message: 'Người duyệt tối đa 100 ký tự' })
  approvedBy?: string | null;
}
