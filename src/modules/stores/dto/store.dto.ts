import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { NullableText, TrimName } from '../../catalog/dto/shared';

const DigitsOrNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/[\s.()-]/g, '').replace(/^\+?84/, '0') || null
      : value,
  );

export class UpdateStoreDto {
  @ApiPropertyOptional({ example: 'FoTech Mart Quận 1' })
  @IsOptional()
  @TrimName()
  @IsString()
  @MinLength(2, { message: 'Tên cửa hàng tối thiểu 2 ký tự' })
  @MaxLength(150, { message: 'Tên cửa hàng tối đa 150 ký tự' })
  name?: string;

  @ApiPropertyOptional({ example: '12 Nguyễn Huệ, P. Bến Nghé, Q. 1, TP.HCM', nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(255, { message: 'Địa chỉ tối đa 255 ký tự' })
  address?: string | null;

  @ApiPropertyOptional({ example: '02838123456', nullable: true })
  @IsOptional()
  @DigitsOrNull()
  @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại cửa hàng gồm 10–11 số, bắt đầu bằng 0' })
  phone?: string | null;

  @ApiPropertyOptional({ example: '0312345678', nullable: true })
  @IsOptional()
  @DigitsOrNull()
  @Matches(/^(\d{10}|\d{13})$/, { message: 'Mã số thuế gồm 10 hoặc 13 chữ số' })
  taxCode?: string | null;

  @ApiPropertyOptional({
    example: 'Đổi/trả trong 7 ngày, kèm hóa đơn và sản phẩm còn nguyên tem',
    nullable: true,
  })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(255, { message: 'Lời nhắn cuối bill tối đa 255 ký tự' })
  receiptFooter?: string | null;

  @ApiPropertyOptional({ example: 'Chi nhánh Quận 1', nullable: true })
  @IsOptional()
  @NullableText()
  @IsString()
  @MaxLength(100, { message: 'Tên chi nhánh tối đa 100 ký tự' })
  branchName?: string | null;

  @ApiPropertyOptional({ example: false, description: 'Cho phép bán khi tồn kho không đủ' })
  @IsOptional()
  @IsBoolean()
  allowNegativeStock?: boolean;

  @ApiPropertyOptional({ example: 7, description: 'Số ngày cho phép trả hàng' })
  @IsOptional()
  @IsInt({ message: 'Số ngày trả hàng phải là số nguyên' })
  @Min(0, { message: 'Số ngày trả hàng không được âm' })
  @Max(365, { message: 'Số ngày trả hàng tối đa 365' })
  returnDays?: number;
}

export class StoreDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'hcm-01' }) code!: string;
  @ApiProperty({ example: 'FoTech Mart Quận 1' }) name!: string;
  @ApiProperty({ type: String, nullable: true }) address!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) taxCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) receiptFooter!: string | null;
  @ApiProperty({ type: String, nullable: true }) branchName!: string | null;
  @ApiProperty() allowNegativeStock!: boolean;
  @ApiProperty({ example: 7 }) returnDays!: number;
}
