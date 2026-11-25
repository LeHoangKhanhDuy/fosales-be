import { AppException } from '../../common/app-exception';

export const StockErrors = {
  changed: (current: number) =>
    new AppException(
      409,
      'INVENTORY_STOCK_CHANGED',
      'Tồn kho vừa thay đổi, vui lòng kiểm tra lại',
      {
        details: { current },
      },
    ),
  insufficient: (current: number) =>
    new AppException(
      409,
      'INVENTORY_INSUFFICIENT_STOCK',
      `Không đủ tồn kho (hiện còn ${current})`,
      {
        details: { current },
      },
    ),
};
