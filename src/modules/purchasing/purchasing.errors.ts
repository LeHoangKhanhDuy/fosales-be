import { AppException } from '../../common/app-exception';

export const PurchaseErrors = {
  notFound: () => new AppException(404, 'PURCHASE_ORDER_NOT_FOUND', 'Không tìm thấy đơn đặt hàng'),
  receiptNotFound: () =>
    new AppException(404, 'GOODS_RECEIPT_NOT_FOUND', 'Không tìm thấy phiếu nhập'),
  itemsRequired: () =>
    new AppException(400, 'PURCHASE_ITEMS_REQUIRED', 'Đơn đặt hàng cần ít nhất 1 sản phẩm'),
  productInvalid: (productIds: string[]) =>
    new AppException(400, 'PURCHASE_PRODUCT_INVALID', 'Có sản phẩm không tồn tại hoặc đã bị xóa', {
      details: { productIds },
    }),
  duplicateProduct: () => new AppException(400, 'VALIDATION_ERROR', 'Sản phẩm bị trùng trong đơn'),
  discountInvalid: () =>
    new AppException(400, 'PURCHASE_DISCOUNT_INVALID', 'Chiết khấu không được lớn hơn tiền hàng'),
  totalTooLarge: () => new AppException(400, 'VALIDATION_ERROR', 'Giá trị đơn tối đa 2 tỷ đồng'),
  expectedDateInvalid: () =>
    new AppException(400, 'VALIDATION_ERROR', 'Ngày giao dự kiến không được trước hôm nay'),
  invalidStatus: (status: string) =>
    new AppException(409, 'PURCHASE_INVALID_STATUS', 'Trạng thái đơn không cho phép thao tác này', {
      details: { status },
    }),
  receivingLocked: (by: string, since: Date) =>
    new AppException(409, 'PURCHASE_RECEIVING_LOCKED', `Đơn đang được ${by} kiểm đếm`, {
      details: { by, since },
    }),
  receivingConflict: (version: number) =>
    new AppException(
      409,
      'PURCHASE_RECEIVING_CONFLICT',
      'Phiên kiểm đếm đã được cập nhật ở nơi khác',
      {
        details: { version },
      },
    ),
  draftInvalid: (message: string) => new AppException(400, 'VALIDATION_ERROR', message),
  lineInvalid: (productId: string) =>
    new AppException(400, 'PURCHASE_LINE_INVALID', 'Dòng kiểm đếm không thuộc đơn đặt hàng', {
      details: { productId },
    }),
  damagedExceeds: () =>
    new AppException(400, 'VALIDATION_ERROR', 'Số lượng hỏng không được lớn hơn số lượng đếm'),
  expiryInvalid: () =>
    new AppException(400, 'VALIDATION_ERROR', 'Hạn sử dụng không được trước hôm nay'),
  receiveEmpty: () =>
    new AppException(400, 'PURCHASE_RECEIVE_EMPTY', 'Chưa kiểm đếm được sản phẩm nào'),
  approvalRequired: (expectedValue: number, acceptedValue: number) =>
    new AppException(
      400,
      'PURCHASE_APPROVAL_REQUIRED',
      'Giá trị nhận chênh lệch quá 5% so với đơn, cần người duyệt',
      { details: { expectedValue, acceptedValue } },
    ),
  idempotencyRequired: () =>
    new AppException(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Thiếu header Idempotency-Key'),
};
