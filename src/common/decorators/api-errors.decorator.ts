import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiResponse } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'VALIDATION_ERROR' })
  code!: string;

  @ApiProperty({ example: 'Dữ liệu không hợp lệ' })
  message!: string;

  @ApiPropertyOptional({ type: Object })
  details?: unknown;
}

const DESCRIPTIONS: Record<number, string> = {
  400: 'Dữ liệu không hợp lệ',
  401: 'Chưa đăng nhập hoặc phiên đã hết hạn',
  403: 'Không đủ quyền hoặc thiếu CSRF token',
  404: 'Không tìm thấy',
  409: 'Xung đột dữ liệu',
};

export const ApiErrors = (...statuses: number[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, description: DESCRIPTIONS[status], type: ErrorResponseDto }),
    ),
  );
