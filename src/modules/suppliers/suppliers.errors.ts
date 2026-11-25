import { AppException } from '../../common/app-exception';

export const SupplierErrors = {
  notFound: () => new AppException(404, 'SUPPLIER_NOT_FOUND', 'Không tìm thấy nhà cung cấp'),
  codeTaken: () => new AppException(409, 'SUPPLIER_CODE_TAKEN', 'Mã nhà cung cấp đã tồn tại'),
  nameTaken: () => new AppException(409, 'SUPPLIER_NAME_TAKEN', 'Tên nhà cung cấp đã tồn tại'),
  phoneTaken: () =>
    new AppException(
      409,
      'SUPPLIER_PHONE_TAKEN',
      'Số điện thoại đã được dùng cho nhà cung cấp khác',
    ),
  taxCodeTaken: () =>
    new AppException(
      409,
      'SUPPLIER_TAX_CODE_TAKEN',
      'Mã số thuế đã được dùng cho nhà cung cấp khác',
    ),
  categoryInvalid: () =>
    new AppException(400, 'SUPPLIER_CATEGORY_INVALID', 'Danh mục cung cấp không hợp lệ'),
  suspendReasonRequired: () =>
    new AppException(400, 'VALIDATION_ERROR', 'Vui lòng nhập lý do tạm ngưng'),
  suspendUntilInvalid: () =>
    new AppException(400, 'VALIDATION_ERROR', 'Ngày hết tạm ngưng phải ở tương lai'),
  hasTransactions: (ledgerCount: number, orderCount = 0) =>
    new AppException(
      409,
      'SUPPLIER_HAS_TRANSACTIONS',
      'Nhà cung cấp đã phát sinh giao dịch, chỉ có thể chuyển sang Ngừng hợp tác',
      { details: { orderCount, ledgerCount } },
    ),
  paymentExceedsDebt: (debt: number) =>
    new AppException(
      409,
      'SUPPLIER_PAYMENT_EXCEEDS_DEBT',
      debt > 0
        ? 'Số tiền thanh toán vượt quá công nợ hiện tại'
        : 'Nhà cung cấp hiện không có công nợ',
      { details: { debt } },
    ),
  notActive: () =>
    new AppException(409, 'SUPPLIER_NOT_ACTIVE', 'Nhà cung cấp đang tạm ngưng hoặc ngừng hợp tác'),
};
