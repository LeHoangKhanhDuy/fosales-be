import { AppException } from '../../common/app-exception';

export const PromotionErrors = {
  notFound: () =>
    new AppException(404, 'PROMOTION_NOT_FOUND', 'Không tìm thấy chương trình khuyến mãi'),
  codeTaken: () => new AppException(409, 'PROMOTION_CODE_TAKEN', 'Mã chương trình đã tồn tại'),
  kindUnsupported: () =>
    new AppException(400, 'VALIDATION_ERROR', 'Hiện chỉ hỗ trợ tạo mã giảm giá (voucher)'),
  invalid: (message: string) => new AppException(400, 'VALIDATION_ERROR', message),
  scopeInvalid: (message: string) => new AppException(400, 'PROMOTION_SCOPE_INVALID', message),
  lockedFields: (fields: string[]) =>
    new AppException(
      409,
      'PROMOTION_LOCKED_FIELDS',
      'Mã đã có lượt dùng, không thể sửa mã, mức giảm hoặc phạm vi',
      { details: { fields } },
    ),
  invalidState: (message: string) => new AppException(409, 'PROMOTION_INVALID_STATE', message),
  inUse: () =>
    new AppException(
      409,
      'PROMOTION_IN_USE',
      'Chương trình đã có lượt sử dụng, không thể xóa — hãy chuyển sang Kết thúc',
    ),
  codeExhausted: () =>
    new AppException(
      409,
      'PROMOTION_CODE_TAKEN',
      'Không tạo được mã mới, vui lòng thử tiền tố khác',
    ),
  voucherNotFound: () => new AppException(404, 'VOUCHER_NOT_FOUND', 'Mã giảm giá không tồn tại'),
  voucherNotStarted: (startAt: Date, label: string) =>
    new AppException(409, 'VOUCHER_NOT_STARTED', `Mã áp dụng từ ${label}`, {
      details: { startAt },
    }),
  voucherPaused: () => new AppException(409, 'VOUCHER_PAUSED', 'Mã giảm giá đang tạm dừng'),
  voucherUsedUp: () => new AppException(409, 'VOUCHER_USED_UP', 'Mã giảm giá đã hết lượt sử dụng'),
  voucherExpired: () => new AppException(409, 'VOUCHER_EXPIRED', 'Mã giảm giá đã hết hạn'),
  voucherMemberOnly: () =>
    new AppException(
      409,
      'VOUCHER_MEMBER_ONLY',
      'Mã chỉ dành cho khách thành viên, hãy chọn khách hàng trước',
    ),
  voucherCustomerLimit: (limit: number) =>
    new AppException(409, 'VOUCHER_CUSTOMER_LIMIT', `Khách đã dùng hết ${limit} lượt của mã này`, {
      details: { limit },
    }),
  voucherScopeMismatch: () =>
    new AppException(
      400,
      'VOUCHER_SCOPE_MISMATCH',
      'Giỏ hàng chưa có sản phẩm thuộc phạm vi áp dụng của mã',
    ),
  voucherMinOrder: (missing: number) =>
    new AppException(
      400,
      'VOUCHER_MIN_ORDER',
      `Mua thêm ${missing.toLocaleString('vi-VN')}đ để được áp dụng`,
      { details: { missing } },
    ),
  voucherNotStackable: (promoName: string) =>
    new AppException(
      409,
      'VOUCHER_NOT_STACKABLE',
      `Không dùng chung với "${promoName}" đang có lợi hơn`,
    ),
  voucherAlreadyApplied: () =>
    new AppException(409, 'VOUCHER_ALREADY_APPLIED', 'Đơn hàng đã áp dụng mã giảm giá'),
  rateLimited: (retryAfter: number) =>
    new AppException(429, 'RATE_LIMITED', 'Bạn nhập mã quá nhiều lần, vui lòng thử lại sau', {
      retryAfter,
    }),
};
