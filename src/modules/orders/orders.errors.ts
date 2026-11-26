import { AppException } from '../../common/app-exception';

export const OrderErrors = {
  notFound: () => new AppException(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng'),
  returnNotFound: () => new AppException(404, 'RETURN_NOT_FOUND', 'Không tìm thấy phiếu trả hàng'),
  productInvalid: (productIds: string[]) =>
    new AppException(400, 'ORDER_PRODUCT_INVALID', 'Có sản phẩm không tồn tại hoặc đã ngừng bán', {
      details: { productIds },
    }),
  outOfStock: (items: { productId: string; available: number }[]) =>
    new AppException(409, 'ORDER_OUT_OF_STOCK', 'Có sản phẩm không đủ tồn kho', {
      details: { items },
    }),
  totalChanged: (quote: unknown) =>
    new AppException(
      409,
      'ORDER_TOTAL_CHANGED',
      'Giá đơn hàng đã thay đổi, vui lòng kiểm tra lại',
      {
        details: quote,
      },
    ),
  invalidStatus: (status: string) =>
    new AppException(409, 'ORDER_INVALID_STATUS', 'Trạng thái đơn không cho phép thao tác này', {
      details: { status },
    }),
  pointsNeedCustomer: () =>
    new AppException(400, 'VALIDATION_ERROR', 'Chọn khách hàng thành viên trước khi dùng điểm'),
  pointsExceedTotal: (points: number, maxRedeemPoints: number) =>
    new AppException(
      409,
      'CUSTOMER_POINTS_INSUFFICIENT',
      `Chỉ dùng được tối đa ${maxRedeemPoints} điểm cho đơn này`,
      { details: { points, maxRedeemPoints } },
    ),
  paymentInsufficient: (missing: number) =>
    new AppException(
      400,
      'PAYMENT_INSUFFICIENT',
      `Khách còn thiếu ${missing.toLocaleString('vi-VN')}đ`,
      {
        details: { missing },
      },
    ),
  paymentOverpaid: (excess: number) =>
    new AppException(
      400,
      'PAYMENT_OVERPAID',
      'Số tiền chuyển khoản / thẻ / ví vượt quá số tiền phải trả',
      { details: { excess } },
    ),
  paymentInvalid: (message: string) => new AppException(400, 'PAYMENT_INVALID', message),
  noPendingPayment: () =>
    new AppException(409, 'ORDER_INVALID_STATUS', 'Đơn không còn khoản thanh toán chờ xác nhận'),
  cancelForbidden: () =>
    new AppException(
      403,
      'AUTH_FORBIDDEN',
      'Thu ngân chỉ được hủy đơn chờ thanh toán do mình tạo trong 30 phút',
    ),
  returnLineInvalid: (message: string, orderLineId?: string) =>
    new AppException(
      400,
      'RETURN_LINE_INVALID',
      message,
      orderLineId ? { details: { orderLineId } } : {},
    ),
  returnExpired: (days: number) =>
    new AppException(409, 'RETURN_EXPIRED', `Đơn đã quá hạn trả hàng ${days} ngày`, {
      details: { returnDays: days },
    }),
  idempotencyRequired: () =>
    new AppException(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Thiếu header Idempotency-Key'),
};
