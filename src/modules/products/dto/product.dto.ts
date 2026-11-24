import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { NullableText, TrimName } from '../../catalog/dto/shared';
import { BULK_MAX, MIN_STOCK_MAX, PRICE_MAX, SKU_PATTERN, STOCK_MAX } from '../products.utils';

export const PRODUCT_STATUSES = ['active', 'inactive'] as const;
export const IMAGE_FITS = ['cover', 'contain', 'auto'] as const;
const IMAGE_URL = /^(\/api\/uploads\/files\/[\w.-]+|https:\/\/\S+)$/;

const UpperTrim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  );
const TrimOrNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  );

export class CreateProductDto {
  @ApiProperty({ example: 'Nước suối Aquafina 500ml', maxLength: 150 })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập tên sản phẩm' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên sản phẩm' })
  @MaxLength(150, { message: 'Tên sản phẩm tối đa 150 ký tự' })
  name!: string;

  @ApiPropertyOptional({ example: 'SP0031', description: 'Bỏ trống để hệ thống tự sinh SPxxxx' })
  @IsOptional()
  @UpperTrim()
  @ValidateIf((_, value) => value !== '')
  @Matches(SKU_PATTERN, { message: 'SKU gồm 2–32 ký tự chữ, số, dấu gạch hoặc dấu chấm' })
  sku?: string;

  @ApiPropertyOptional({ example: '8934588104114', nullable: true })
  @IsOptional()
  @TrimOrNull()
  @IsString({ message: 'Mã vạch không hợp lệ' })
  @MaxLength(14, { message: 'Mã vạch không hợp lệ' })
  barcode?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Vui lòng chọn danh mục' })
  categoryId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Vui lòng chọn đơn vị tính' })
  unitId!: string;

  @ApiProperty({ example: 6000 })
  @IsInt({ message: 'Giá bán phải là số nguyên' })
  @Min(1, { message: 'Giá bán phải lớn hơn 0' })
  @Max(PRICE_MAX, { message: 'Giá bán quá lớn' })
  price!: number;

  @ApiPropertyOptional({ example: 7000, nullable: true })
  @IsOptional()
  @IsInt({ message: 'Giá gốc phải là số nguyên' })
  @Max(PRICE_MAX, { message: 'Giá gốc quá lớn' })
  originalPrice?: number | null;

  @ApiPropertyOptional({ example: 4200, nullable: true })
  @IsOptional()
  @IsInt({ message: 'Giá vốn phải là số nguyên' })
  @Min(0, { message: 'Giá vốn không được âm' })
  @Max(PRICE_MAX, { message: 'Giá vốn quá lớn' })
  costPrice?: number | null;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsInt({ message: 'Tồn tối thiểu phải là số nguyên' })
  @Min(0, { message: 'Tồn tối thiểu không được âm' })
  @Max(MIN_STOCK_MAX, { message: 'Tồn tối thiểu quá lớn' })
  minStock?: number;

  @ApiPropertyOptional({ example: 48, description: 'Tồn đầu kỳ tại cửa hàng của người tạo' })
  @IsOptional()
  @IsInt({ message: 'Tồn kho phải là số nguyên' })
  @Min(0, { message: 'Tồn kho không được âm' })
  @Max(STOCK_MAX, { message: 'Tồn kho quá lớn' })
  initialStock?: number;

  @ApiPropertyOptional({ example: '/api/uploads/files/7d1c….webp', nullable: true })
  @IsOptional()
  @TrimOrNull()
  @Matches(IMAGE_URL, { message: 'Ảnh không hợp lệ' })
  @MaxLength(500, { message: 'Đường dẫn ảnh quá dài' })
  image?: string | null;

  @ApiPropertyOptional({ enum: IMAGE_FITS, default: 'auto' })
  @IsOptional()
  @IsIn(IMAGE_FITS, { message: 'Kiểu hiển thị ảnh không hợp lệ' })
  imageFit?: (typeof IMAGE_FITS)[number];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: 'Giá trị bán chạy không hợp lệ' })
  isBestSeller?: boolean;

  @ApiPropertyOptional({ enum: PRODUCT_STATUSES, default: 'active' })
  @IsOptional()
  @IsIn(PRODUCT_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status?: (typeof PRODUCT_STATUSES)[number];

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @NullableText()
  @IsString({ message: 'Mô tả không hợp lệ' })
  @MaxLength(1000, { message: 'Mô tả tối đa 1000 ký tự' })
  description?: string | null;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({
    example: 50,
    description: 'Tồn mới tại cửa hàng hiện tại, khác tồn cũ sẽ ghi phiếu điều chỉnh',
  })
  @IsOptional()
  @IsInt({ message: 'Tồn kho phải là số nguyên' })
  @Min(0, { message: 'Tồn kho không được âm' })
  @Max(STOCK_MAX, { message: 'Tồn kho quá lớn' })
  stock?: number;
}

export class ProductIdsDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: BULK_MAX })
  @IsArray({ message: 'Danh sách sản phẩm không hợp lệ' })
  @ArrayMinSize(1, { message: 'Chọn ít nhất 1 sản phẩm' })
  @ArrayMaxSize(BULK_MAX, { message: `Tối đa ${BULK_MAX} sản phẩm mỗi lần` })
  @IsUUID('all', { each: true, message: 'Id sản phẩm không hợp lệ' })
  ids!: string[];
}

export class BulkStatusDto extends ProductIdsDto {
  @ApiProperty({ enum: PRODUCT_STATUSES })
  @IsIn(PRODUCT_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status!: (typeof PRODUCT_STATUSES)[number];
}
