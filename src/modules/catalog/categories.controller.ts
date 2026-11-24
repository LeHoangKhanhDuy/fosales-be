import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
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
import { CategoriesService } from './categories.service';
import {
  CategoryQueryDto,
  CategoryRecordDto,
  CreateCategoryDto,
  DeleteCategoryQueryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto/category.dto';

const categoryId = () => Param('id', uuidOr(CatalogErrors.categoryNotFound));

@ApiTags('categories')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOkResponse({ type: [CategoryRecordDto] })
  @ApiErrors(400, 401)
  list(@Query() query: CategoryQueryDto) {
    return this.categories.list(query);
  }

  @Post()
  @ManagersOnly(409)
  @ApiCreatedResponse({ type: CategoryRecordDto })
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthUser,
    @Client() client: ClientInfo,
  ) {
    return this.categories.create(dto, user.id, client);
  }

  @Put('order')
  @HttpCode(204)
  @ManagersOnly()
  @ApiNoContentResponse({ description: 'Đã lưu thứ tự' })
  async reorder(
    @Body() dto: ReorderCategoriesDto,
    @CurrentUser() user: AuthUser,
    @Client() client: ClientInfo,
  ) {
    await this.categories.reorder(dto.ids, user.id, client);
  }

  @Patch(':id')
  @ManagersOnly(404, 409)
  @ApiOkResponse({ type: CategoryRecordDto })
  update(
    @categoryId() id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthUser,
    @Client() client: ClientInfo,
  ) {
    return this.categories.update(id, dto, user.id, client);
  }

  @Delete(':id')
  @HttpCode(204)
  @ManagersOnly(404, 409)
  @ApiNoContentResponse({ description: 'Đã xóa danh mục' })
  async remove(
    @categoryId() id: string,
    @Query() query: DeleteCategoryQueryDto,
    @CurrentUser() user: AuthUser,
    @Client() client: ClientInfo,
  ) {
    await this.categories.remove(id, query.moveTo, user.id, client);
  }
}
