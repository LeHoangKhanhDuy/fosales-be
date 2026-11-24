import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
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
import {
  ProductListQueryDto,
  ProductLookupQueryDto,
  ProductOptionsQueryDto,
  ProductStatsQueryDto,
} from './dto/product-query.dto';
import {
  BulkDeleteResultDto,
  BulkStatusResultDto,
  ProductDto,
  ProductOptionDto,
  ProductPageDto,
  ProductStatsDto,
} from './dto/product-response.dto';
import {
  BulkStatusDto,
  CreateProductDto,
  ProductIdsDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductCommandsService } from './product-commands.service';
import { ProductErrors } from './products.errors';
import { ProductsService } from './products.service';

const productId = () => Param('id', uuidOr(ProductErrors.notFound));

@ApiTags('products')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly commands: ProductCommandsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ProductPageDto })
  @ApiErrors(400, 401)
  list(@CurrentUser() user: AuthUser, @Query() query: ProductListQueryDto) {
    return this.products.list(user, query);
  }

  @Get('stats')
  @ApiOkResponse({ type: ProductStatsDto })
  @ApiErrors(400, 401)
  stats(@CurrentUser() user: AuthUser, @Query() query: ProductStatsQueryDto) {
    return this.products.stats(user, query);
  }

  @Get('sellable')
  @ApiOkResponse({
    type: [ProductDto],
    description: 'Sản phẩm đang bán thuộc danh mục đang hoạt động',
  })
  @ApiErrors(401)
  sellable(@CurrentUser() user: AuthUser) {
    return this.products.sellable(user);
  }

  @Get('options')
  @ApiOkResponse({ type: [ProductOptionDto] })
  @ApiErrors(400, 401)
  options(@CurrentUser() user: AuthUser, @Query() query: ProductOptionsQueryDto) {
    return this.products.options(user, query);
  }

  @Get('lookup')
  @ApiOkResponse({ type: ProductDto })
  @ApiErrors(400, 401, 404)
  lookup(@CurrentUser() user: AuthUser, @Query() query: ProductLookupQueryDto) {
    return this.products.lookup(user, query.code);
  }

  @Patch('status')
  @ManagersOnly()
  @ApiOkResponse({ type: BulkStatusResultDto })
  setStatus(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkStatusDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.setStatus(user, dto.ids, dto.status, client);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  @ManagersOnly()
  @ApiOkResponse({ type: BulkDeleteResultDto })
  bulkDelete(
    @CurrentUser() user: AuthUser,
    @Body() dto: ProductIdsDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.softDelete(user, dto.ids, client);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductDto })
  @ApiErrors(401, 404)
  get(@CurrentUser() user: AuthUser, @productId() id: string) {
    return this.products.get(user, id);
  }

  @Post()
  @ManagersOnly(409)
  @ApiCreatedResponse({ type: ProductDto })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProductDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.create(user, dto, client);
  }

  @Patch(':id')
  @ManagersOnly(404, 409)
  @ApiOkResponse({ type: ProductDto })
  update(
    @CurrentUser() user: AuthUser,
    @productId() id: string,
    @Body() dto: UpdateProductDto,
    @Client() client: ClientInfo,
  ) {
    return this.commands.update(user, id, dto, client);
  }
}
