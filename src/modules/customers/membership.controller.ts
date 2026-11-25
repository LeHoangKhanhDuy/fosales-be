import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { ACCESS_COOKIE } from '../../common/constants';
import { ApiErrors } from '../../common/decorators/api-errors.decorator';
import { Client, CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { ClientInfo } from '../../common/http/client-info';
import { AuditService } from '../audit/audit.service';
import { MembershipDto, MembershipUpdateResultDto } from './dto/membership.dto';
import { MembershipService } from './membership.service';

@ApiTags('membership')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@Controller('membership')
export class MembershipController {
  constructor(
    private readonly membership: MembershipService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOkResponse({ type: MembershipDto, description: 'Mọi vai trò; cache 60 giây' })
  @ApiErrors(401)
  get() {
    return this.membership.settings();
  }

  @Put()
  @Roles('admin')
  @ApiOkResponse({ type: MembershipUpdateResultDto })
  @ApiErrors(400, 401, 403)
  async update(
    @CurrentUser() user: AuthUser,
    @Body() dto: MembershipDto,
    @Client() client: ClientInfo,
  ) {
    const before = await this.membership.settings();
    const result = await this.membership.update(dto, user.id);
    await this.audit.log('MEMBERSHIP_UPDATED', client, {
      userId: user.id,
      meta: {
        before: before as unknown as Prisma.InputJsonObject,
        after: result.settings as unknown as Prisma.InputJsonObject,
        changedTiers: result.changedTiers,
      },
    });
    return result;
  }
}
