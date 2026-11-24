import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user';
import { ACCESS_COOKIE } from '../../common/constants';
import { Client, CurrentUser } from '../../common/decorators/auth.decorators';
import type { ClientInfo } from '../../common/http/client-info';
import { UpdateProfileDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.profile.get(user.id);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
    @Client() client: ClientInfo,
  ) {
    return this.profile.update(user, dto, client);
  }
}
