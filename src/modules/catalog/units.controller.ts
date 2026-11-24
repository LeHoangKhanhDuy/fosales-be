import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user';
import { ACCESS_COOKIE } from '../../common/constants';
import { ApiErrors } from '../../common/decorators/api-errors.decorator';
import { Client, CurrentUser } from '../../common/decorators/auth.decorators';
import type { ClientInfo } from '../../common/http/client-info';
import { ManagersOnly, uuidOr } from '../../common/decorators/managers-only.decorator';
import { CatalogErrors } from './catalog.errors';
import {
  CreateUnitDto,
  DeleteUnitQueryDto,
  UnitQueryDto,
  UnitRecordDto,
  UpdateUnitDto,
} from './dto/unit.dto';
import { UnitsService } from './units.service';

const unitId = () => Param('id', uuidOr(CatalogErrors.unitNotFound));

@ApiTags('units')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  @ApiOkResponse({ type: [UnitRecordDto] })
  @ApiErrors(400, 401)
  list(@Query() query: UnitQueryDto) {
    return this.units.list(query);
  }

  @Post()
  @ManagersOnly(409)
  @ApiCreatedResponse({ type: UnitRecordDto })
  create(@Body() dto: CreateUnitDto, @CurrentUser() user: AuthUser, @Client() client: ClientInfo) {
    return this.units.create(dto, user.id, client);
  }

  @Patch(':id')
  @ManagersOnly(404, 409)
  @ApiOkResponse({ type: UnitRecordDto })
  update(
    @unitId() id: string,
    @Body() dto: UpdateUnitDto,
    @CurrentUser() user: AuthUser,
    @Client() client: ClientInfo,
  ) {
    return this.units.update(id, dto, user.id, client);
  }

  @Delete(':id')
  @HttpCode(204)
  @ManagersOnly(404, 409)
  @ApiNoContentResponse({ description: 'Đã xóa đơn vị tính' })
  async remove(
    @unitId() id: string,
    @Query() query: DeleteUnitQueryDto,
    @CurrentUser() user: AuthUser,
    @Client() client: ClientInfo,
  ) {
    await this.units.remove(id, query.replaceWith, user.id, client);
  }
}
