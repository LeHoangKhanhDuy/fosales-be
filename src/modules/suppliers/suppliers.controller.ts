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
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
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
import { parseIdempotencyKey } from '../idempotency/idempotency.service';
import {
  LedgerQueryDto,
  PageDto,
  SupplierListQueryDto,
  SupplierOptionsQueryDto,
  TopProductsQueryDto,
} from './dto/supplier-query.dto';
import {
  LedgerPageDto,
  NextCodeDto,
  PaymentPageDto,
  PaymentResultDto,
  SupplierListItemDto,
  SupplierOptionDto,
  SupplierPageDto,
  SupplierStatsDto,
} from './dto/supplier-response.dto';
import {
  CreateSupplierDto,
  CreateSupplierPaymentDto,
  SupplierStatusDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { SupplierCommandsService } from './supplier-commands.service';
import { SupplierPaymentsService } from './supplier-payments.service';
import { SupplierErrors } from './suppliers.errors';
import { SuppliersService } from './suppliers.service';

const supplierId = () => Param('id', uuidOr(SupplierErrors.notFound));

@ApiTags('suppliers')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@ManagersOnly()
@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliers: SuppliersService,
    private readonly commands: SupplierCommandsService,
    private readonly payments: SupplierPaymentsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: SupplierPageDto })
  list(@Query() query: SupplierListQueryDto) {
    return this.suppliers.list(query);
  }

  @Get('stats')
  @ApiOkResponse({ type: SupplierStatsDto })
  stats() {
    return this.suppliers.stats();
  }

  @Get('options')
  @ApiOkResponse({ type: [SupplierOptionDto] })
  options(@Query() query: SupplierOptionsQueryDto) {
    return this.suppliers.options(query);
  }

  @Get('next-code')
  @ApiOkResponse({ type: NextCodeDto })
  async nextCode() {
    return { code: await this.suppliers.nextCode() };
  }

  @Get(':id')
  @ApiOkResponse({ type: SupplierListItemDto })
  @ApiErrors(404)
  get(@supplierId() id: string) {
    return this.suppliers.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: SupplierListItemDto })
  @ApiErrors(409)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSupplierDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.create(user, dto, client);
  }

  @Patch(':id')
  @ApiOkResponse({ type: SupplierListItemDto })
  @ApiErrors(404, 409)
  update(
    @CurrentUser() user: AuthUser,
    @supplierId() id: string,
    @Body() dto: UpdateSupplierDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.update(user, id, dto, client);
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: SupplierListItemDto })
  @ApiErrors(404)
  setStatus(
    @CurrentUser() user: AuthUser,
    @supplierId() id: string,
    @Body() dto: SupplierStatusDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.setStatus(user, id, dto, client);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Đã xóa nhà cung cấp chưa phát sinh giao dịch' })
  @ApiErrors(404, 409)
  async remove(
    @CurrentUser() user: AuthUser,
    @supplierId() id: string,
    @Client() client: ClientInfo,
  ) {
    await this.commands.remove(user, id, client);
  }

  @Get(':id/ledger')
  @ApiOkResponse({ type: LedgerPageDto })
  @ApiErrors(404)
  ledger(@supplierId() id: string, @Query() query: LedgerQueryDto) {
    return this.suppliers.ledger(id, query);
  }

  @Get(':id/payments')
  @ApiOkResponse({ type: PaymentPageDto })
  @ApiErrors(404)
  paymentList(@supplierId() id: string, @Query() query: PageDto) {
    return this.suppliers.payments(id, query);
  }

  @Post(':id/payments')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Gửi lại cùng khóa trong 24h không chi tiền lần 2',
  })
  @ApiCreatedResponse({ type: PaymentResultDto })
  @ApiErrors(404, 409)
  pay(
    @CurrentUser() user: AuthUser,
    @supplierId() id: string,
    @Body() dto: CreateSupplierPaymentDto,
    @Headers('idempotency-key') key: string | undefined,
    @Client() client: ClientInfo,
  ) {
    return this.payments.create(user, id, dto, parseIdempotencyKey(key), client);
  }

  @Get(':id/top-products')
  @ApiOkResponse({
    description:
      'Sản phẩm nhập nhiều nhất từ phiếu nhập: qty = Σ acceptedQty, value = Σ acceptedQty × unitCost, lastCost = giá dòng mới nhất',
  })
  @ApiErrors(404)
  topProducts(@supplierId() id: string, @Query() query: TopProductsQueryDto) {
    return this.suppliers.topProducts(id, query.limit);
  }
}
