import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const collapseSpaces = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Khánh Duy' })
  @IsOptional()
  @Transform(collapseSpaces)
  @IsString({ message: 'Họ tên không hợp lệ' })
  @Length(2, 100, { message: 'Họ tên phải từ 2 đến 100 ký tự' })
  name?: string;

  @ApiPropertyOptional({ example: '0909000111' })
  @IsOptional()
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @MaxLength(20, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc khi đổi số điện thoại' })
  @IsOptional()
  @IsString({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  @MaxLength(128, { message: 'Mật khẩu quá dài' })
  currentPassword?: string;
}
