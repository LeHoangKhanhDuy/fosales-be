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
  ApiExtraModels,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user';
import { ACCESS_COOKIE } from '../../common/constants';
import { ApiErrors } from '../../common/decorators/api-errors.decorator';
import { Client, CurrentUser } from '../../common/decorators/auth.decorators';
import { ManagersOnly, uuidOr } from '../../common/decorators/managers-only.decorator';
import type { ClientInfo } from '../../common/http/client-info';
import { parseIdempotencyKey } from '../idempotency/idempotency.service';
import { PageDto } from '../suppliers/dto/supplier-query.dto';
import { CustomerCommandsService } from './customer-commands.service';
import { CustomerPointsService } from './customer-points.service';
import { CustomersService } from './customers.service';
import { CustomerErrors } from './customers.errors';
import {
  CustomerListQueryDto,
  CustomerLookupQueryDto,
  CustomerSearchQueryDto,
  PointLogQueryDto,
} from './dto/customer-query.dto';
import {
  AdjustPointsResultDto,
  CustomerDto,
  CustomerLiteDto,
  CustomerOrderPageDto,
  CustomerPageDto,
  CustomerStatsSummaryDto,
  PointLogPageDto,
} from './dto/customer-response.dto';
import {
  AdjustPointsDto,
  CreateCustomerDto,
  CustomerStatusDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

const customerId = () => Param('id', uuidOr(CustomerErrors.notFound));

@ApiTags('customers')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@ApiExtraModels(CustomerDto, CustomerLiteDto)
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly commands: CustomerCommandsService,
    private readonly points: CustomerPointsService,
  ) {}

  @Get()
  @ManagersOnly()
  @ApiOkResponse({ type: CustomerPageDto })
  list(@Query() query: CustomerListQueryDto) {
    return this.customers.list(query);
  }

  @Get('stats')
  @ManagersOnly()
  @ApiOkResponse({ type: CustomerStatsSummaryDto })
  stats() {
    return this.customers.stats();
  }

  @Get('search')
  @ApiOkResponse({ type: [CustomerLiteDto], description: 'Mọi vai trò; chỉ khách active' })
  @ApiErrors(400, 401)
  search(@Query() query: CustomerSearchQueryDto) {
    return this.customers.search(query);
  }

  @Get('lookup')
  @ApiOkResponse({
    type: CustomerLiteDto,
    description: 'Mọi vai trò; khách bị khóa → 409 CUSTOMER_BLOCKED',
  })
  @ApiErrors(400, 401, 404, 409)
  lookup(@Query() query: CustomerLookupQueryDto) {
    return this.customers.lookup(query);
  }

  @Get(':id')
  @ManagersOnly(404)
  @ApiOkResponse({ type: CustomerDto })
  get(@customerId() id: string) {
    return this.customers.get(id);
  }

  @Post()
  @ApiCreatedResponse({
    description:
      'Mọi vai trò. Cashier chỉ gửi được name/phone/email/gender/birthday và nhận CustomerLite',
    schema: {
      oneOf: [{ $ref: getSchemaPath(CustomerDto) }, { $ref: getSchemaPath(CustomerLiteDto) }],
    },
  })
  @ApiErrors(400, 401, 403, 409)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCustomerDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.create(user, dto, client);
  }

  @Patch(':id')
  @ManagersOnly(404, 409)
  @ApiOkResponse({ type: CustomerDto })
  update(
    @CurrentUser() user: AuthUser,
    @customerId() id: string,
    @Body() dto: UpdateCustomerDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.update(user, id, dto, client);
  }

  @Patch(':id/status')
  @ManagersOnly(404)
  @ApiOkResponse({ type: CustomerDto })
  setStatus(
    @CurrentUser() user: AuthUser,
    @customerId() id: string,
    @Body() dto: CustomerStatusDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.setStatus(user, id, dto, client);
  }

  @Delete(':id')
  @HttpCode(204)
  @ManagersOnly(404, 409)
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthUser, @customerId() id: string, @Client() client: ClientInfo) {
    return this.commands.remove(user, id, client);
  }

  @Get(':id/points')
  @ManagersOnly(404)
  @ApiOkResponse({ type: PointLogPageDto })
  pointLogs(@customerId() id: string, @Query() query: PointLogQueryDto) {
    return this.points.list(id, query);
  }

  @Post(':id/points')
  @ManagersOnly(404, 409)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Gửi lại cùng khóa trong 24h không cộng/trừ lần 2',
  })
  @ApiCreatedResponse({ type: AdjustPointsResultDto })
  adjust(
    @CurrentUser() user: AuthUser,
    @customerId() id: string,
    @Body() dto: AdjustPointsDto,
    @Headers('idempotency-key') key: string | undefined,
    @Client() client: ClientInfo,
  ) {
    return this.points.adjust(user, id, dto, parseIdempotencyKey(key), client);
  }

  @Get(':id/orders')
  @ManagersOnly(404)
  @ApiOkResponse({ type: CustomerOrderPageDto })
  orders(@customerId() id: string, @Query() query: PageDto) {
    return this.customers.orders(id, query);
  }
}
