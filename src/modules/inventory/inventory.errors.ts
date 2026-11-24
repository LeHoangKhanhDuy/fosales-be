import { AppException } from '../../common/app-exception';

export const InventoryErrors = {
  productNotFound: () =>
    new AppException(404, 'INVENTORY_PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm trong kho'),
  noChange: () =>
    new AppException(
      400,
      'INVENTORY_NO_CHANGE',
      'Số lượng mới bằng tồn hiện tại, không có gì thay đổi',
    ),
  quantityRequired: () => new AppException(400, 'VALIDATION_ERROR', 'Số lượng phải lớn hơn 0'),
};
