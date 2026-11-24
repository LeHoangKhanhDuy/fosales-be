import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_STATUSES } from '../catalog.constants';
import { NullableText, QueryBoolean, TrimName } from './shared';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Đồ uống', maxLength: 50 })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập tên danh mục' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên danh mục' })
  @MaxLength(50, { message: 'Tên danh mục tối đa 50 ký tự' })
  name!: string;

  @ApiPropertyOptional({ example: 'Nước ngọt, nước suối', maxLength: 255, nullable: true })
  @IsOptional()
  @NullableText()
  @IsString({ message: 'Mô tả không hợp lệ' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string | null;

  @ApiPropertyOptional({ enum: CATEGORY_ICONS, default: 'package', example: 'cup-soda' })
  @IsOptional()
  @IsIn(CATEGORY_ICONS, { message: 'Biểu tượng không hợp lệ' })
  icon?: string;

  @ApiPropertyOptional({ enum: CATEGORY_COLORS, default: 'slate', example: 'sky' })
  @IsOptional()
  @IsIn(CATEGORY_COLORS, { message: 'Màu không hợp lệ' })
  color?: string;

  @ApiPropertyOptional({ enum: CATEGORY_STATUSES, default: 'active' })
  @IsOptional()
  @IsIn(CATEGORY_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status?: (typeof CATEGORY_STATUSES)[number];
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class ReorderCategoriesDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Toàn bộ id danh mục theo thứ tự mới' })
  @IsArray({ message: 'Danh sách thứ tự không hợp lệ' })
  @ArrayMaxSize(1000, { message: 'Danh sách thứ tự quá dài' })
  @IsUUID('all', { each: true, message: 'Id danh mục không hợp lệ' })
  ids!: string[];
}

export class CategoryQueryDto {
  @ApiPropertyOptional({ default: true })
  @QueryBoolean(true)
  @IsBoolean({ message: 'withCount không hợp lệ' })
  withCount: boolean = true;

  @ApiPropertyOptional({ enum: CATEGORY_STATUSES })
  @IsOptional()
  @IsIn(CATEGORY_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status?: (typeof CATEGORY_STATUSES)[number];
}

export class DeleteCategoryQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Danh mục nhận lại sản phẩm' })
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục chuyển đến không hợp lệ' })
  moveTo?: string;
}

export class CategoryRecordDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Đồ uống' }) name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: CATEGORY_ICONS }) icon!: string;
  @ApiProperty({ enum: CATEGORY_COLORS }) color!: string;
  @ApiProperty({ enum: CATEGORY_STATUSES }) status!: string;
  @ApiProperty({ example: 1 }) sortOrder!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ example: 12 }) productCount!: number;
}
