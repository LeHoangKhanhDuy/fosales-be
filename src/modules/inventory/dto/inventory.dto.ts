import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
import { NullableText, TrimName } from '../../catalog/dto/shared';
import { MIN_STOCK_MAX, STOCK_MAX } from '../../products/products.utils';

export const ADJUST_MODES = ['increase', 'decrease', 'set'] as const;
export type AdjustMode = (typeof ADJUST_MODES)[number];

export class AdjustStockDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Sản phẩm không hợp lệ' })
  productId!: string;

  @ApiProperty({ enum: ADJUST_MODES, example: 'decrease' })
  @IsIn(ADJUST_MODES, { message: 'Kiểu điều chỉnh không hợp lệ' })
  mode!: AdjustMode;

  @ApiProperty({ example: 2, description: 'increase/decrease: 1–1.000.000; set: 0–1.000.000' })
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(0, { message: 'Số lượng không được âm' })
  @Max(STOCK_MAX, { message: 'Số lượng quá lớn' })
  quantity!: number;

  @ApiProperty({ example: 'Hư hỏng', maxLength: 80 })
  @TrimName()
  @IsString({ message: 'Vui lòng nhập lý do' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do' })
  @MaxLength(80, { message: 'Lý do tối đa 80 ký tự' })
  reason!: string;

  @ApiPropertyOptional({ example: 'Vỡ khi vận chuyển', maxLength: 200, nullable: true })
  @IsOptional()
  @NullableText()
  @IsString({ message: 'Ghi chú không hợp lệ' })
  @MaxLength(200, { message: 'Ghi chú tối đa 200 ký tự' })
  note?: string | null;

  @ApiPropertyOptional({
    example: 50,
    description: 'Tồn đang hiển thị ở FE; lệch với tồn thật → 409',
  })
  @IsOptional()
  @IsInt({ message: 'Tồn hiện tại không hợp lệ' })
  @Min(0, { message: 'Tồn hiện tại không hợp lệ' })
  expectedStock?: number;
}

export class UpdateMinStockDto {
  @ApiProperty({ example: 10 })
  @IsInt({ message: 'Tồn tối thiểu phải là số nguyên' })
  @Min(0, { message: 'Tồn tối thiểu không được âm' })
  @Max(MIN_STOCK_MAX, { message: 'Tồn tối thiểu quá lớn' })
  minStock!: number;
}
