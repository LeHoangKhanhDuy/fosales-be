import { HttpException } from '@nestjs/common';

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  retryAfter?: number;
  details?: unknown;
}

export class AppException extends HttpException {
  readonly body: ErrorBody;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    extra: Pick<ErrorBody, 'retryAfter' | 'details'> = {},
  ) {
    const body: ErrorBody = { statusCode, code, message, ...extra };
    super(body, statusCode);
    this.body = body;
  }
}

const DEFAULT_ERRORS: Record<number, [string, string]> = {
  400: ['BAD_REQUEST', 'Yêu cầu không hợp lệ'],
  401: ['AUTH_UNAUTHENTICATED', 'Bạn cần đăng nhập để tiếp tục'],
  403: ['FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này'],
  404: ['NOT_FOUND', 'Không tìm thấy tài nguyên'],
  405: ['METHOD_NOT_ALLOWED', 'Phương thức không được hỗ trợ'],
  413: ['PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn'],
  415: ['UNSUPPORTED_MEDIA_TYPE', 'Định dạng dữ liệu không được hỗ trợ'],
  429: ['RATE_LIMITED', 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau'],
  500: ['INTERNAL_ERROR', 'Đã có lỗi xảy ra, vui lòng thử lại sau'],
  503: ['SERVICE_UNAVAILABLE', 'Dịch vụ tạm thời không khả dụng'],
};

export function defaultErrorBody(statusCode: number): ErrorBody {
  const fallback = statusCode >= 500 ? DEFAULT_ERRORS[500] : DEFAULT_ERRORS[400];
  const [code, message] = DEFAULT_ERRORS[statusCode] ?? fallback;
  return { statusCode, code, message };
}
