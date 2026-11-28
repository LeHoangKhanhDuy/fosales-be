import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user';
import { ACCESS_COOKIE } from '../../common/constants';
import { ApiErrors } from '../../common/decorators/api-errors.decorator';
import { Client, CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { ClientInfo } from '../../common/http/client-info';
import { StoreDto, UpdateStoreDto } from './dto/store.dto';
import { StoresService } from './stores.service';

@ApiTags('stores')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get('current')
  @ApiOkResponse({
    type: StoreDto,
    description: 'Cửa hàng của người đang đăng nhập (dùng cho bill)',
  })
  @ApiErrors(401)
  current(@CurrentUser() user: AuthUser) {
    return this.stores.current(user);
  }

  @Patch('current')
  @Roles('admin', 'manager')
  @ApiOkResponse({ type: StoreDto })
  @ApiErrors(400, 401, 403, 409)
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateStoreDto, @Client() client: ClientInfo) {
    return this.stores.updateCurrent(user, dto, client);
  }
}
