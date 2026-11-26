import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user';
import { ACCESS_COOKIE } from '../../common/constants';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { ManagersOnly, uuidOr } from '../../common/decorators/managers-only.decorator';
import { ReturnListQueryDto } from './dto/order-query.dto';
import { OrderErrors } from './orders.errors';
import { OrdersService } from './orders.service';

@ApiTags('returns')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@ManagersOnly()
@Controller('returns')
export class ReturnsController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOkResponse({ description: '{ items, total, page, pageSize }' })
  list(@CurrentUser() user: AuthUser, @Query() query: ReturnListQueryDto) {
    return this.orders.listReturns(user, query);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Chi tiết + dữ liệu in phiếu trả' })
  get(@CurrentUser() user: AuthUser, @Param('id', uuidOr(OrderErrors.returnNotFound)) id: string) {
    return this.orders.getReturn(user, id);
  }
}
