import { AppException } from './app-exception';

export const Errors = {
  invalidCredentials: () =>
    new AppException(401, 'AUTH_INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không đúng'),
  accountLocked: (retryAfter: number) =>
    new AppException(
      423,
      'AUTH_ACCOUNT_LOCKED',
      `Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau ${retryAfter} giây`,
      { retryAfter },
    ),
  accountDisabled: () =>
    new AppException(
      403,
      'AUTH_ACCOUNT_DISABLED',
      'Tài khoản đã bị khóa hoặc vô hiệu hóa, vui lòng liên hệ quản trị viên',
    ),
  unauthenticated: () =>
    new AppException(401, 'AUTH_UNAUTHENTICATED', 'Bạn cần đăng nhập để tiếp tục'),
  sessionExpired: () =>
    new AppException(
      401,
      'AUTH_SESSION_EXPIRED',
      'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
    ),
  refreshReused: () =>
    new AppException(
      401,
      'AUTH_REFRESH_REUSED',
      'Phát hiện phiên đăng nhập bất thường, vui lòng đăng nhập lại',
    ),
  forbidden: () =>
    new AppException(403, 'AUTH_FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này'),
  csrfInvalid: () =>
    new AppException(
      403,
      'CSRF_INVALID',
      'Yêu cầu không hợp lệ, vui lòng tải lại trang và thử lại',
    ),
  originNotAllowed: () =>
    new AppException(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn gửi yêu cầu không được phép'),
  wrongCurrentPassword: () =>
    new AppException(400, 'AUTH_INVALID_PASSWORD', 'Mật khẩu hiện tại không đúng'),
  passwordReused: () =>
    new AppException(400, 'AUTH_PASSWORD_REUSED', 'Mật khẩu mới phải khác mật khẩu hiện tại'),
  otpInvalid: () => new AppException(400, 'OTP_INVALID', 'Mã OTP không đúng hoặc đã hết hạn'),
  sessionNotFound: () =>
    new AppException(404, 'SESSION_NOT_FOUND', 'Không tìm thấy phiên đăng nhập'),
};
