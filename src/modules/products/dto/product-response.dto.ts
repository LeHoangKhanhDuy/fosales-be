import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IMAGE_FITS, PRODUCT_STATUSES } from './product.dto';

export class ProductOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'SP0003' }) sku!: string;
  @ApiProperty({ type: String, nullable: true, example: '8934588104114' }) barcode!: string | null;
  @ApiProperty({ example: 'Nước suối Aquafina 500ml' }) name!: string;
  @ApiProperty({ example: 'Chai' }) unit!: string;
  @ApiProperty({ example: 6000 }) price!: number;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Không trả cho thu ngân' })
  costPrice?: number | null;
  @ApiProperty({ example: 240 }) stock!: number;
  @ApiProperty({ type: String, nullable: true }) image!: string | null;
  @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @ApiProperty({ enum: PRODUCT_STATUSES }) status!: string;
}

export class ProductDto extends ProductOptionDto {
  @ApiProperty({ format: 'uuid' }) unitId!: string;
  @ApiProperty({ type: Number, nullable: true, example: 7000 }) originalPrice!: number | null;
  @ApiProperty({ example: 10 }) minStock!: number;
  @ApiProperty({ enum: IMAGE_FITS }) imageFit!: string;
  @ApiProperty() isBestSeller!: boolean;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ProductPageDto {
  @ApiProperty({ type: [ProductDto] }) items!: ProductDto[];
  @ApiProperty({ example: 29 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 10 }) pageSize!: number;
}

export class ProductStatsDto {
  @ApiProperty({ example: 29 }) total!: number;
  @ApiProperty({ example: 27 }) active!: number;
  @ApiProperty({ example: 48250000, description: 'Tổng tồn × (giá vốn ?? giá bán)' })
  inventoryValue!: number;
  @ApiProperty({ example: 1934 }) inventoryUnits!: number;
  @ApiProperty({ example: 5 }) low!: number;
  @ApiProperty({ example: 2 }) out!: number;
}

export class BulkStatusResultDto {
  @ApiProperty({ example: 3 }) updated!: number;
}

export class BulkDeleteResultDto {
  @ApiProperty({ example: 3 }) deleted!: number;
  @ApiProperty({
    example: 1,
    description: 'Số sản phẩm bị xóa khi vẫn còn tồn tại cửa hàng hiện tại',
  })
  withStock!: number;
}
