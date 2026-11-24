import { AppException } from '../../common/app-exception';

export const CatalogErrors = {
  categoryNotFound: () => new AppException(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục'),
  categoryNameTaken: () => new AppException(409, 'CATEGORY_NAME_TAKEN', 'Tên danh mục đã tồn tại'),
  categoryInUse: (productCount?: number) =>
    new AppException(
      409,
      'CATEGORY_IN_USE',
      'Danh mục vẫn còn sản phẩm, vui lòng chọn danh mục để chuyển sản phẩm sang',
      { details: { productCount } },
    ),
  categoryMoveTargetInvalid: () =>
    new AppException(400, 'CATEGORY_MOVE_TARGET_INVALID', 'Danh mục chuyển đến không hợp lệ'),
  categoryOrderInvalid: () =>
    new AppException(
      400,
      'CATEGORY_ORDER_INVALID',
      'Thứ tự không hợp lệ, danh sách phải gồm đủ và không trùng các danh mục hiện có',
    ),
  unitNotFound: () => new AppException(404, 'UNIT_NOT_FOUND', 'Không tìm thấy đơn vị tính'),
  unitNameTaken: () => new AppException(409, 'UNIT_NAME_TAKEN', 'Tên đơn vị tính đã tồn tại'),
  unitInUse: (productCount?: number) =>
    new AppException(
      409,
      'UNIT_IN_USE',
      'Đơn vị tính đang được sản phẩm sử dụng, vui lòng chọn đơn vị thay thế',
      { details: { productCount } },
    ),
  unitReplaceTargetInvalid: () =>
    new AppException(400, 'UNIT_REPLACE_TARGET_INVALID', 'Đơn vị tính thay thế không hợp lệ'),
};
