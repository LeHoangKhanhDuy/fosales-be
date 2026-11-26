import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiCreatedResponse,
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
import { LookupQueryDto, OrderListQueryDto, RangeDto } from './dto/order-query.dto';
import {
  ConfirmPaymentDto,
  CreateOrderDto,
  CreateReturnDto,
  QuoteDto,
  ReasonDto,
  RefundOptionsDto,
} from './dto/order.dto';
import { OrderCommandsService } from './order-commands.service';
import { OrderErrors } from './orders.errors';
import { OrdersService } from './orders.service';
import { ReturnsService } from './returns.service';

const orderId = () => Param('id', uuidOr(OrderErrors.notFound));
const IdempotencyHeader = () =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Bắt buộc; gửi lại cùng khóa trong 24h không thực hiện lần 2',
  });

@ApiTags('orders')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@ApiErrors(400, 401)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly commands: OrderCommandsService,
    private readonly returns: ReturnsService,
  ) {}

  @Post('quote')
  @HttpCode(200)
  @ApiOkResponse({
    description:
      'Báo giá server (port priceCart): lines, promotions, totals, voucherIssue, pointsToEarn, maxRedeemPoints, stockWarnings',
  })
  @ApiErrors(404, 409)
  quote(@CurrentUser() user: AuthUser, @Body() dto: QuoteDto) {
    return this.commands.quote(user, dto);
  }

  @Post()
  @IdempotencyHeader()
  @ApiCreatedResponse({ description: 'Đơn hàng đầy đủ (dùng in bill ngay)' })
  @ApiErrors(404, 409)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') key: string | undefined,
    @Client() client: ClientInfo,
  ) {
    return this.commands.create(user, dto, parseIdempotencyKey(key), client);
  }

  @Get()
  @ApiOkResponse({
    description:
      '{ items, total, page, pageSize, statusCounts } — ngoài admin chỉ thấy đơn của cửa hàng mình',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: OrderListQueryDto) {
    return this.orders.list(user, query);
  }

  @Get('stats')
  @ManagersOnly()
  @ApiOkResponse({
    description:
      '{ revenue, orders, avgOrderValue, pending, pendingAmount, cancelled, cancelledAmount, refunded, refundedAmount, byMethod }',
  })
  stats(@CurrentUser() user: AuthUser, @Query() query: RangeDto) {
    return this.orders.stats(user, query);
  }

  @Get('today')
  @ApiOkResponse({ description: 'Thẻ POS so với cùng giờ hôm qua' })
  today(@CurrentUser() user: AuthUser) {
    return this.orders.today(user);
  }

  @Get('lookup')
  @ApiErrors(404)
  lookup(@CurrentUser() user: AuthUser, @Query() query: LookupQueryDto) {
    return this.orders.lookup(user, query.code);
  }

  @Get(':id')
  @ApiErrors(404)
  get(@CurrentUser() user: AuthUser, @orderId() id: string) {
    return this.orders.get(user, id);
  }

  @Get(':id/receipt')
  @ApiOkResponse({ description: 'Dữ liệu in bill 80mm' })
  @ApiErrors(404)
  receipt(@CurrentUser() user: AuthUser, @orderId() id: string) {
    return this.orders.receipt(user, id);
  }

  @Post(':id/print')
  @HttpCode(200)
  @ApiErrors(404)
  print(@CurrentUser() user: AuthUser, @orderId() id: string, @Client() client: ClientInfo) {
    return this.commands.print(user, id, client);
  }

  @Post(':id/confirm-payment')
  @HttpCode(200)
  @IdempotencyHeader()
  @ApiErrors(404, 409)
  confirmPayment(
    @CurrentUser() user: AuthUser,
    @orderId() id: string,
    @Body() dto: ConfirmPaymentDto,
    @Headers('idempotency-key') key: string | undefined,
    @Client() client: ClientInfo,
  ) {
    return this.commands.confirmPayment(user, id, dto, parseIdempotencyKey(key), client);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @IdempotencyHeader()
  @ApiOkResponse({
    description:
      'Quản lý: đơn pending hoặc completed trong ngày chưa trả hàng; thu ngân: đơn pending của mình trong 30 phút',
  })
  @ApiErrors(403, 404, 409)
  cancel(
    @CurrentUser() user: AuthUser,
    @orderId() id: string,
    @Body() dto: ReasonDto,
    @Headers('idempotency-key') key: string | undefined,
    @Client() client: ClientInfo,
  ) {
    return this.commands.cancel(user, id, dto.reason, parseIdempotencyKey(key), client);
  }

  @Post(':id/returns')
  @ManagersOnly(404, 409)
  @IdempotencyHeader()
  @ApiCreatedResponse({ description: 'Phiếu trả hàng' })
  createReturn(
    @CurrentUser() user: AuthUser,
    @orderId() id: string,
    @Body() dto: CreateReturnDto,
    @Headers('idempotency-key') key: string | undefined,
    @Client() client: ClientInfo,
  ) {
    return this.returns.create(user, id, dto, parseIdempotencyKey(key), client);
  }

  @Post(':id/refund')
  @ManagersOnly(404, 409)
  @IdempotencyHeader()
  @ApiCreatedResponse({ description: 'Shortcut: trả toàn bộ phần còn lại, nhập lại kho' })
  refund(
    @CurrentUser() user: AuthUser,
    @orderId() id: string,
    @Body() dto: RefundOptionsDto,
    @Headers('idempotency-key') key: string | undefined,
    @Client() client: ClientInfo,
  ) {
    return this.returns.refundAll(user, id, dto, parseIdempotencyKey(key), client);
  }
}
