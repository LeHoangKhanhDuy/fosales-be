import { AppException } from '../../common/app-exception';

export const ProductErrors = {
  notFound: () => new AppException(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm'),
  skuTaken: () =>
    new AppException(409, 'PRODUCT_SKU_TAKEN', 'Mã SKU đã được dùng cho sản phẩm khác'),
  barcodeInvalid: () =>
    new AppException(
      400,
      'PRODUCT_BARCODE_INVALID',
      'Mã vạch không hợp lệ (8–14 chữ số, EAN-13 phải đúng số kiểm tra)',
    ),
  barcodeTaken: () =>
    new AppException(409, 'PRODUCT_BARCODE_TAKEN', 'Mã vạch đã được dùng cho sản phẩm khác'),
  categoryInvalid: () =>
    new AppException(400, 'PRODUCT_CATEGORY_INVALID', 'Danh mục không tồn tại'),
  unitInvalid: () => new AppException(400, 'PRODUCT_UNIT_INVALID', 'Đơn vị tính không tồn tại'),
  originalPriceInvalid: () =>
    new AppException(400, 'PRODUCT_ORIGINAL_PRICE_INVALID', 'Giá gốc phải lớn hơn giá bán'),
};
