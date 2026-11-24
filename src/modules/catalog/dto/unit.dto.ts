import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { NullableText, QueryBoolean, TrimName } from './shared';

export class CreateUnitDto {
  @ApiProperty({ example: 'Chai', maxLength: 20 })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập tên đơn vị tính' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên đơn vị tính' })
  @MaxLength(20, { message: 'Tên đơn vị tính tối đa 20 ký tự' })
  name!: string;

  @ApiPropertyOptional({ example: 'Chai nhựa hoặc thủy tinh', maxLength: 255, nullable: true })
  @IsOptional()
  @NullableText()
  @IsString({ message: 'Mô tả không hợp lệ' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string | null;
}

export class UpdateUnitDto extends PartialType(CreateUnitDto) {}

export class UnitQueryDto {
  @ApiPropertyOptional({ default: true })
  @QueryBoolean(true)
  @IsBoolean({ message: 'withCount không hợp lệ' })
  withCount: boolean = true;
}

export class DeleteUnitQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Đơn vị tính thay thế cho sản phẩm' })
  @IsOptional()
  @IsUUID('all', { message: 'Đơn vị tính thay thế không hợp lệ' })
  replaceWith?: string;
}

export class UnitRecordDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Chai' }) name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ example: 8 }) productCount!: number;
}
