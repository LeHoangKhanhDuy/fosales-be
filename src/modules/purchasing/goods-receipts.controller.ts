import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user';
import { ACCESS_COOKIE } from '../../common/constants';
import { ApiErrors } from '../../common/decorators/api-errors.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { ManagersOnly, uuidOr } from '../../common/decorators/managers-only.decorator';
import { GoodsReceiptListQueryDto } from './dto/purchase-query.dto';
import { GoodsReceiptDetailDto, GoodsReceiptPageDto } from './dto/purchase-response.dto';
import { GoodsReceiptsService } from './goods-receipts.service';
import { PurchaseErrors } from './purchasing.errors';

@ApiTags('goods-receipts')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@ManagersOnly()
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly receipts: GoodsReceiptsService) {}

  @Get()
  @ApiOkResponse({ type: GoodsReceiptPageDto })
  list(@CurrentUser() user: AuthUser, @Query() query: GoodsReceiptListQueryDto) {
    return this.receipts.list(user.storeId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: GoodsReceiptDetailDto })
  @ApiErrors(404)
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', uuidOr(PurchaseErrors.receiptNotFound)) id: string,
  ) {
    return this.receipts.get(user.storeId, id);
  }
}
