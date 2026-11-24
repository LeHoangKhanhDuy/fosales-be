import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BULK_MAX } from '../products.utils';
import { PRODUCT_STATUSES } from './product.dto';

export const STOCK_FILTERS = ['in-stock', 'low', 'out'] as const;
export const PRODUCT_SORTS = ['newest', 'name', 'price-desc', 'price-asc', 'stock-asc'] as const;

export type StockFilter = (typeof STOCK_FILTERS)[number];
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class ProductStatsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ' })
  categoryId?: string;

  @ApiPropertyOptional({ enum: PRODUCT_STATUSES })
  @IsOptional()
  @IsIn(PRODUCT_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status?: (typeof PRODUCT_STATUSES)[number];
}

export class ProductListQueryDto extends ProductStatsQueryDto {
  @ApiPropertyOptional({
    example: 'nuoc suoi',
    description: 'Tìm không dấu theo tên, SKU, mã vạch',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100, { message: 'Từ khóa quá dài' })
  keyword?: string;

  @ApiPropertyOptional({ enum: STOCK_FILTERS })
  @IsOptional()
  @IsIn(STOCK_FILTERS, { message: 'Bộ lọc tồn kho không hợp lệ' })
  stock?: StockFilter;

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS, { message: 'Kiểu sắp xếp không hợp lệ' })
  sort: ProductSort = 'newest';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Trang không hợp lệ' })
  @Min(1, { message: 'Trang không hợp lệ' })
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số dòng mỗi trang không hợp lệ' })
  @Min(1, { message: 'Số dòng mỗi trang không hợp lệ' })
  @Max(100, { message: 'Tối đa 100 dòng mỗi trang' })
  pageSize: number = 10;
}

export class ProductOptionsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100, { message: 'Từ khóa quá dài' })
  keyword?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giới hạn không hợp lệ' })
  @Min(1, { message: 'Giới hạn không hợp lệ' })
  @Max(200, { message: 'Tối đa 200 sản phẩm' })
  limit: number = 50;

  @ApiPropertyOptional({
    description: 'Danh sách id phân tách bằng dấu phẩy',
    example: 'uuid1,uuid2',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : value,
  )
  @ArrayMaxSize(BULK_MAX, { message: `Tối đa ${BULK_MAX} id` })
  @IsUUID('all', { each: true, message: 'Id sản phẩm không hợp lệ' })
  ids?: string[];
}

export class ProductLookupQueryDto {
  @ApiProperty({ example: '8934588104114', description: 'Mã vạch hoặc SKU' })
  @Trim()
  @IsString({ message: 'Vui lòng nhập mã' })
  @IsNotEmpty({ message: 'Vui lòng nhập mã' })
  @MaxLength(32, { message: 'Mã không hợp lệ' })
  code!: string;
}
