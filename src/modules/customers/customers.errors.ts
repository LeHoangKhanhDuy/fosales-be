import { AppException } from '../../common/app-exception';

export const CustomerErrors = {
  notFound: () => new AppException(404, 'CUSTOMER_NOT_FOUND', 'Không tìm thấy khách hàng'),
  phoneTaken: (customerId: string, name: string) =>
    new AppException(409, 'CUSTOMER_PHONE_TAKEN', `Số điện thoại đã thuộc về khách hàng ${name}`, {
      details: { customerId, name },
    }),
  blocked: () => new AppException(409, 'CUSTOMER_BLOCKED', 'Khách hàng đã bị khóa'),
  pointsInsufficient: (points: number) =>
    new AppException(409, 'CUSTOMER_POINTS_INSUFFICIENT', 'Khách hàng không đủ điểm', {
      details: { points },
    }),
  hasTransactions: (orders: number, pointLogs: number) =>
    new AppException(
      409,
      'CUSTOMER_HAS_TRANSACTIONS',
      'Khách hàng đã phát sinh giao dịch, chỉ có thể khóa',
      { details: { orders, pointLogs } },
    ),
  fieldForbidden: (field: string) =>
    new AppException(403, 'AUTH_FORBIDDEN', `Chỉ quản trị viên được thay đổi ${field}`, {
      details: { field },
    }),
  pointsZero: () => new AppException(400, 'VALIDATION_ERROR', 'Số điểm điều chỉnh phải khác 0'),
  birthdayInvalid: () =>
    new AppException(400, 'VALIDATION_ERROR', 'Ngày sinh phải từ 01/01/1900 tới hôm nay'),
  lookupRequired: () =>
    new AppException(400, 'VALIDATION_ERROR', 'Vui lòng nhập số điện thoại hoặc mã khách hàng'),
  membershipInvalid: (field: string, message: string, tier?: string) =>
    new AppException(400, 'MEMBERSHIP_INVALID', message, {
      details: tier ? { field, tier } : { field },
    }),
};
