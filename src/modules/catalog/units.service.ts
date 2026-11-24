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
import { CreateUnitDto, UnitQueryDto, UpdateUnitDto } from './dto/unit.dto';

const UNIT_FIELDS = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UnitSelect;

const RECORD_SELECT = { ...UNIT_FIELDS, ...PRODUCT_COUNT } satisfies Prisma.UnitSelect;

type UnitRow = Prisma.UnitGetPayload<{ select: typeof UNIT_FIELDS }> & { productCount?: number };

const writeErrors = rethrowPrisma({
  P2002: CatalogErrors.unitNameTaken,
  P2025: CatalogErrors.unitNotFound,
});

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list({ withCount }: UnitQueryDto) {
    const rows: UnitRow[] = withCount
      ? (await this.prisma.unit.findMany({ select: RECORD_SELECT })).map(withProductCount)
      : await this.prisma.unit.findMany({ select: UNIT_FIELDS });
    return rows.sort((a, b) => compareVi(a.name, b.name));
  }

  async create(dto: CreateUnitDto, userId: string, client: ClientInfo) {
    const unit = await this.prisma.unit
      .create({
        data: {
          name: dto.name,
          nameKey: toNameKey(dto.name),
          description: dto.description ?? null,
        },
        select: RECORD_SELECT,
      })
      .catch(writeErrors);
    await this.audit.log('UNIT_CREATED', client, {
      userId,
      meta: { id: unit.id, name: unit.name },
    });
    return withProductCount(unit);
  }

  async update(id: string, dto: UpdateUnitDto, userId: string, client: ClientInfo) {
    const data = definedOnly({
      name: dto.name,
      nameKey: dto.name === undefined ? undefined : toNameKey(dto.name),
      description: dto.description,
    });
    if (!Object.keys(data).length) throw Errors.emptyUpdate();
    const unit = await this.prisma.unit
      .update({ where: { id }, data, select: RECORD_SELECT })
      .catch(writeErrors);
    await this.audit.log('UNIT_UPDATED', client, { userId, meta: { id, name: unit.name } });
    return withProductCount(unit);
  }

  async remove(id: string, replaceWith: string | undefined, userId: string, client: ClientInfo) {
    const result = await this.prisma
      .$transaction(async (tx) => {
        const unit = await tx.unit.findUnique({
          where: { id },
          select: { name: true, ...PRODUCT_COUNT },
        });
        if (!unit) throw CatalogErrors.unitNotFound();
        if (
          replaceWith &&
          (replaceWith === id || !(await tx.unit.count({ where: { id: replaceWith } })))
        ) {
          throw CatalogErrors.unitReplaceTargetInvalid();
        }
        const productCount = unit._count.products;
        if (productCount && !replaceWith) throw CatalogErrors.unitInUse(productCount);
        const moved = (
          await tx.product.updateMany({
            where: { unitId: id },
            data: { unitId: replaceWith ?? null },
          })
        ).count;
        await tx.unit.delete({ where: { id } });
        return { name: unit.name, moved };
      })
      .catch(
        rethrowPrisma({
          P2003: () => CatalogErrors.unitInUse(),
          P2025: CatalogErrors.unitNotFound,
        }),
      );
    await this.audit.log('UNIT_DELETED', client, {
      userId,
      meta: {
        id,
        name: result.name,
        replaceWith: replaceWith ?? null,
        movedProducts: result.moved,
      },
    });
  }
}
