import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/http/client-info';
import { rethrowPrisma } from '../../common/prisma-errors';
import { compareVi, toNameKey } from '../../common/utils/text';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogErrors } from './catalog.errors';
import { definedOnly, PRODUCT_COUNT, withProductCount } from './catalog.utils';
import { CategoryQueryDto, CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

const CATEGORY_FIELDS = {
  id: true,
  name: true,
  description: true,
  icon: true,
  color: true,
  status: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

const RECORD_SELECT = { ...CATEGORY_FIELDS, ...PRODUCT_COUNT } satisfies Prisma.CategorySelect;

type CategoryRow = Prisma.CategoryGetPayload<{ select: typeof CATEGORY_FIELDS }> & { productCount?: number };

const byOrderThenName = (a: { sortOrder: number; name: string }, b: { sortOrder: number; name: string }) =>
  a.sortOrder - b.sortOrder || compareVi(a.name, b.name);

const writeErrors = rethrowPrisma({
  P2002: CatalogErrors.categoryNameTaken,
  P2025: CatalogErrors.categoryNotFound,
});

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list({ withCount, status }: CategoryQueryDto) {
    const where = status ? { status } : {};
    const rows: CategoryRow[] = withCount
      ? (await this.prisma.category.findMany({ where, select: RECORD_SELECT })).map(withProductCount)
      : await this.prisma.category.findMany({ where, select: CATEGORY_FIELDS });
    return rows.sort(byOrderThenName);
  }

  async create(dto: CreateCategoryDto, userId: string, client: ClientInfo) {
    const category = await this.prisma
      .$transaction(async (tx) => {
        const { _max } = await tx.category.aggregate({ _max: { sortOrder: true } });
        return tx.category.create({
          data: { ...this.fields(dto), name: dto.name, nameKey: toNameKey(dto.name), sortOrder: (_max.sortOrder ?? 0) + 1 },
          select: RECORD_SELECT,
        });
      })
      .catch(writeErrors);
    await this.audit.log('CATEGORY_CREATED', client, { userId, meta: { id: category.id, name: category.name } });
    return withProductCount(category);
  }

  async update(id: string, dto: UpdateCategoryDto, userId: string, client: ClientInfo) {
    const data = this.fields(dto);
    if (!Object.keys(data).length) throw Errors.emptyUpdate();
    const category = await this.prisma.category
      .update({ where: { id }, data, select: RECORD_SELECT })
      .catch(writeErrors);
    await this.audit.log('CATEGORY_UPDATED', client, {
      userId,
      meta: { id, name: category.name, fields: Object.keys(dto).filter((key) => key in data) },
    });
    return withProductCount(category);
  }

  async reorder(ids: string[], userId: string, client: ClientInfo) {
    if (new Set(ids).size !== ids.length) throw CatalogErrors.categoryOrderInvalid();
    await this.prisma.$transaction(async (tx) => {
      const [total, matched] = await Promise.all([
        tx.category.count(),
        tx.category.count({ where: { id: { in: ids } } }),
      ]);
      if (total !== ids.length || matched !== ids.length) throw CatalogErrors.categoryOrderInvalid();
      await tx.$executeRaw`
        UPDATE categories AS c
        SET sort_order = o.position, updated_at = now()
        FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS o(id, position)
        WHERE c.id = o.id`;
    });
    await this.audit.log('CATEGORY_REORDERED', client, { userId, meta: { count: ids.length } });
  }

  async remove(id: string, moveTo: string | undefined, userId: string, client: ClientInfo) {
    const result = await this.prisma
      .$transaction(async (tx) => {
        const category = await tx.category.findUnique({ where: { id }, select: { name: true, ...PRODUCT_COUNT } });
        if (!category) throw CatalogErrors.categoryNotFound();
        if (moveTo && (moveTo === id || !(await tx.category.count({ where: { id: moveTo } })))) {
          throw CatalogErrors.categoryMoveTargetInvalid();
        }
        const productCount = category._count.products;
        if (productCount && !moveTo) throw CatalogErrors.categoryInUse(productCount);
        const moved = moveTo
          ? (await tx.product.updateMany({ where: { categoryId: id }, data: { categoryId: moveTo } })).count
          : 0;
        await tx.category.delete({ where: { id } });
        return { name: category.name, moved };
      })
      .catch(rethrowPrisma({ P2003: () => CatalogErrors.categoryInUse(), P2025: CatalogErrors.categoryNotFound }));
    await this.audit.log('CATEGORY_DELETED', client, {
      userId,
      meta: { id, name: result.name, moveTo: moveTo ?? null, movedProducts: result.moved },
    });
  }

  private fields(dto: UpdateCategoryDto) {
    return definedOnly({
      name: dto.name,
      nameKey: dto.name === undefined ? undefined : toNameKey(dto.name),
      description: dto.description,
      icon: dto.icon,
      color: dto.color,
      status: dto.status,
    });
  }
}
