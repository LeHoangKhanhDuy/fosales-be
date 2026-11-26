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
import { ManagersOnly, uuidOr } from '../../common/decorators/managers-only.decorator';
import type { ClientInfo } from '../../common/http/client-info';
import { PageDto } from '../suppliers/dto/supplier-query.dto';
import { GenerateCodeQueryDto, PromotionListQueryDto } from './dto/promotion-query.dto';
import {
  GeneratedCodeDto,
  PromotionDto,
  PromotionPageDto,
  RedemptionPageDto,
  VoucherDto,
} from './dto/promotion-response.dto';
import {
  CreatePromotionDto,
  PromotionStateDto,
  UpdatePromotionDto,
  ValidateVoucherDto,
} from './dto/promotion.dto';
import { PromotionCommandsService } from './promotion-commands.service';
import { PromotionErrors } from './promotions.errors';
import { PromotionsService } from './promotions.service';
import { VoucherService } from './voucher.service';

const promotionId = () => Param('id', uuidOr(PromotionErrors.notFound));

@ApiTags('promotions')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly commands: PromotionCommandsService,
    private readonly vouchers: VoucherService,
  ) {}

  @Get()
  @ManagersOnly()
  @ApiOkResponse({ type: PromotionPageDto })
  list(@Query() query: PromotionListQueryDto) {
    return this.promotions.list(query);
  }

  @Get('generate-code')
  @ManagersOnly(409)
  @ApiOkResponse({ type: GeneratedCodeDto })
  generateCode(@Query() query: GenerateCodeQueryDto) {
    return this.promotions.generateCode(query);
  }

  @Post('vouchers/validate')
  @HttpCode(200)
  @ApiOkResponse({ type: VoucherDto, description: 'Mọi vai trò; giới hạn 20 lần/phút/người dùng' })
  @ApiErrors(400, 401, 404, 409, 429)
  validate(@CurrentUser() user: AuthUser, @Body() dto: ValidateVoucherDto) {
    return this.vouchers.validate(user, dto);
  }

  @Get(':id')
  @ManagersOnly(404)
  @ApiOkResponse({ type: PromotionDto })
  get(@promotionId() id: string) {
    return this.promotions.get(id);
  }

  @Post()
  @ManagersOnly(409)
  @ApiCreatedResponse({ type: PromotionDto })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePromotionDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.create(user, dto, client);
  }

  @Patch(':id')
  @ManagersOnly(404, 409)
  @ApiOkResponse({ type: PromotionDto })
  update(
    @CurrentUser() user: AuthUser,
    @promotionId() id: string,
    @Body() dto: UpdatePromotionDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.update(user, id, dto, client);
  }

  @Patch(':id/state')
  @ManagersOnly(404, 409)
  @ApiOkResponse({ type: PromotionDto })
  setState(
    @CurrentUser() user: AuthUser,
    @promotionId() id: string,
    @Body() dto: PromotionStateDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.setState(user, id, dto.state, client);
  }

  @Delete(':id')
  @HttpCode(204)
  @ManagersOnly(404, 409)
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthUser, @promotionId() id: string, @Client() client: ClientInfo) {
    return this.commands.remove(user, id, client);
  }

  @Get(':id/redemptions')
  @ManagersOnly(404)
  @ApiOkResponse({ type: RedemptionPageDto })
  redemptions(@promotionId() id: string, @Query() query: PageDto) {
    return this.promotions.redemptions(id, query);
  }
}
