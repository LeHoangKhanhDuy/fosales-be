import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
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
import { parseIdempotencyKey } from '../idempotency/idempotency.service';
import {
  InventoryDetailQueryDto,
  InventoryListQueryDto,
  MovementListQueryDto,
} from './dto/inventory-query.dto';
import {
  AdjustResultDto,
  InventoryDetailDto,
  InventoryItemDto,
  InventoryPageDto,
  InventoryStatsDto,
  MovementPageDto,
} from './dto/inventory-response.dto';
import { AdjustStockDto, UpdateMinStockDto } from './dto/inventory.dto';
import { InventoryCommandsService } from './inventory-commands.service';
import { InventoryErrors } from './inventory.errors';
import { InventoryService } from './inventory.service';
import { MovementsService } from './movements.service';

const productId = () => Param('productId', uuidOr(InventoryErrors.productNotFound));

@ApiTags('inventory')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@ManagersOnly()
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly movements: MovementsService,
    private readonly commands: InventoryCommandsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: InventoryPageDto })
  list(@CurrentUser() user: AuthUser, @Query() query: InventoryListQueryDto) {
    return this.inventory.list(user.storeId, query);
  }

  @Get('stats')
  @ApiOkResponse({ type: InventoryStatsDto })
  stats(@CurrentUser() user: AuthUser) {
    return this.inventory.stats(user.storeId);
  }

  @Get('movements')
  @ApiOkResponse({ type: MovementPageDto })
  movementList(@CurrentUser() user: AuthUser, @Query() query: MovementListQueryDto) {
    return this.movements.list(user.storeId, query);
  }

  @Post('adjust')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Gửi lại cùng khóa trong 24h không trừ tồn lần 2',
  })
  @ApiCreatedResponse({ type: AdjustResultDto })
  @ApiErrors(404, 409)
  adjust(
    @CurrentUser() user: AuthUser,
    @Body() dto: AdjustStockDto,
    @Headers('idempotency-key') key: string | undefined,
    @Client() client: ClientInfo,
  ) {
    return this.commands.adjust(user, dto, parseIdempotencyKey(key), client);
  }

  @Get(':productId')
  @ApiOkResponse({ type: InventoryDetailDto })
  @ApiErrors(404)
  detail(
    @CurrentUser() user: AuthUser,
    @productId() id: string,
    @Query() query: InventoryDetailQueryDto,
  ) {
    return this.inventory.detail(user.storeId, id, query.days);
  }

  @Patch(':productId/min-stock')
  @ApiOkResponse({ type: InventoryItemDto })
  @ApiErrors(404)
  setMinStock(
    @CurrentUser() user: AuthUser,
    @productId() id: string,
    @Body() dto: UpdateMinStockDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.setMinStock(user, id, dto.minStock, client);
  }
}
