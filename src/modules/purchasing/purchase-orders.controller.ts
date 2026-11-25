import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiQuery,
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
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { PurchaseOrderListQueryDto, SuggestionQueryDto } from './dto/purchase-query.dto';
import {
  PurchaseOrderDto,
  PurchaseOrderPageDto,
  PurchaseSummaryDto,
  ReceiveResultDto,
  ReceivingDraftBodyDto,
  ReceivingSavedDto,
  SuggestionDto,
} from './dto/purchase-response.dto';
import { ReceiveDto } from './dto/receive.dto';
import { PurchaseOrderCommandsService } from './purchase-order-commands.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseErrors } from './purchasing.errors';
import { ReceivingService } from './receiving.service';

const orderId = () => Param('id', uuidOr(PurchaseErrors.notFound));

@ApiTags('purchase-orders')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@ManagersOnly()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly orders: PurchaseOrdersService,
    private readonly commands: PurchaseOrderCommandsService,
    private readonly receiving: ReceivingService,
  ) {}

  @Get()
  @ApiOkResponse({ type: PurchaseOrderPageDto })
  list(@CurrentUser() user: AuthUser, @Query() query: PurchaseOrderListQueryDto) {
    return this.orders.list(user.storeId, query);
  }

  @Get('summary')
  @ApiOkResponse({ type: PurchaseSummaryDto })
  summary(@CurrentUser() user: AuthUser) {
    return this.orders.summary(user.storeId);
  }

  @Get('suggestions')
  @ApiOkResponse({ type: [SuggestionDto] })
  suggestions(@CurrentUser() user: AuthUser, @Query() query: SuggestionQueryDto) {
    return this.orders.suggestions(user.storeId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiErrors(404)
  get(@CurrentUser() user: AuthUser, @orderId() id: string) {
    return this.orders.get(user.storeId, id);
  }

  @Post()
  @ApiCreatedResponse({ type: PurchaseOrderDto })
  @ApiErrors(404, 409)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePurchaseOrderDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.create(user, dto, client);
  }

  @Patch(':id')
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiErrors(404, 409)
  update(
    @CurrentUser() user: AuthUser,
    @orderId() id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.update(user, id, dto, client);
  }

  @Post(':id/place')
  @HttpCode(200)
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiErrors(404, 409)
  place(@CurrentUser() user: AuthUser, @orderId() id: string, @Client() client: ClientInfo) {
    return this.commands.place(user, id, client);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiErrors(404, 409)
  cancel(
    @CurrentUser() user: AuthUser,
    @orderId() id: string,
    @Body() dto: CancelPurchaseOrderDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.cancel(user, id, dto.reason, client);
  }

  @Put(':id/receiving')
  @ApiHeader({ name: 'If-Match', required: false, description: 'draftVersion hiện có; lệch → 409' })
  @ApiQuery({ name: 'takeover', required: false, type: Boolean })
  @ApiBody({ type: ReceivingDraftBodyDto })
  @ApiOkResponse({ type: ReceivingSavedDto })
  @ApiErrors(404, 409)
  saveDraft(
    @CurrentUser() user: AuthUser,
    @orderId() id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Query('takeover') takeover: string | undefined,
  ) {
    return this.receiving.saveDraft(
      user,
      id,
      body,
      ifMatch,
      takeover === 'true' || takeover === '1',
    );
  }

  @Delete(':id/receiving')
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiErrors(404, 409)
  discard(@CurrentUser() user: AuthUser, @orderId() id: string, @Client() client: ClientInfo) {
    return this.receiving.discard(user, id, client);
  }

  @Post(':id/receive')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Bắt buộc; gửi lại cùng khóa trong 24h không nhập kho lần 2',
  })
  @ApiCreatedResponse({ type: ReceiveResultDto })
  @ApiErrors(404, 409)
  receive(
    @CurrentUser() user: AuthUser,
    @orderId() id: string,
    @Body() dto: ReceiveDto,
    @Headers('idempotency-key') key: string | undefined,
    @Client() client: ClientInfo,
  ) {
    return this.receiving.receive(user, id, dto, parseIdempotencyKey(key), client);
  }
}
