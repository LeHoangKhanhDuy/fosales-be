import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const STRONG_PASSWORD = /^(?=.*\p{L})(?=.*\d)[\s\S]{8,128}$/u;
const STRONG_PASSWORD_MESSAGE = 'Mật khẩu mới phải có từ 8 ký tự, gồm cả chữ và số';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Tên đăng nhập hoặc số điện thoại' })
  @IsString({ message: 'Vui lòng nhập tên đăng nhập' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên đăng nhập' })
  @MaxLength(64, { message: 'Tên đăng nhập quá dài' })
  username!: string;

  @ApiProperty({ example: '123456' })
  @IsString({ message: 'Vui lòng nhập mật khẩu' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  @MaxLength(128, { message: 'Mật khẩu quá dài' })
  password!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: 'Giá trị ghi nhớ đăng nhập không hợp lệ' })
  remember?: boolean;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  @MaxLength(128, { message: 'Mật khẩu quá dài' })
  currentPassword!: string;

  @ApiProperty({ example: 'MatKhauMoi123' })
  @IsString({ message: STRONG_PASSWORD_MESSAGE })
  @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MESSAGE })
  newPassword!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'thungan', description: 'Tên đăng nhập hoặc số điện thoại' })
  @IsString({ message: 'Vui lòng nhập tài khoản' })
  @IsNotEmpty({ message: 'Vui lòng nhập tài khoản' })
  @MaxLength(64, { message: 'Tài khoản quá dài' })
  account!: string;
}

export class ResetPasswordDto extends ForgotPasswordDto {
  @ApiProperty({ example: '123456' })
  @IsString({ message: 'Mã OTP gồm 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'Mã OTP gồm 6 chữ số' })
  otp!: string;

  @ApiProperty({ example: 'MatKhauMoi123' })
  @IsString({ message: STRONG_PASSWORD_MESSAGE })
  @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MESSAGE })
  newPassword!: string;
}
