import { Injectable } from '@nestjs/common';
import { Prisma, type PromotionState } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePromotionDto, PromotionInputDto, UpdatePromotionDto } from './dto/promotion.dto';
import { promotionInclude, scopeOf } from './promotion.mapper';
import { PromotionErrors } from './promotions.errors';
import { PromotionsService } from './promotions.service';
import { isExpired, isUsedUp, promotionSearchKey, type Scope } from './promotions.utils';

type Tx = Prisma.TransactionClient;

interface Draft {
  code: string;
  name: string;
  description: string | null;
  discountType: 'percent' | 'amount';
  discountValue: number;
  maxDiscount: number | null;
  minOrder: number | null;
  scope: Scope;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  stackable: boolean;
  startAt: Date;
  endAt: Date | null;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

function toDraft(input: PromotionInputDto): Draft {
  const type = input.scope?.type ?? 'all';
  return {
    code: input.code,
    name: input.name,
    description: input.description ?? null,
    discountType: input.discountType,
    discountValue: input.discountValue,
    maxDiscount: input.discountType === 'percent' ? (input.maxDiscount ?? null) : null,
    minOrder: input.minOrder ?? null,
    scope: {
      type,
      categoryIds: type === 'categories' ? (input.scope?.categoryIds ?? []) : [],
      productIds: type === 'products' ? (input.scope?.productIds ?? []) : [],
    },
    usageLimit: input.usageLimit ?? null,
    perCustomerLimit: input.perCustomerLimit ?? null,
    stackable: input.stackable ?? true,
    startAt: new Date(input.startAt),
    endAt: input.endAt ? new Date(input.endAt) : null,
  };
}

function checkRules(draft: Draft) {
  const { discountType: type, discountValue: value } = draft;
  if (type === 'percent' && (value < 1 || value > 100))
    throw PromotionErrors.invalid('Mức giảm từ 1% tới 100%');
  if (type === 'amount' && (value < 1000 || value > 100_000_000)) {
    throw PromotionErrors.invalid('Mức giảm từ 1.000đ tới 100.000.000đ');
  }
  if (draft.usageLimit && draft.perCustomerLimit && draft.perCustomerLimit > draft.usageLimit) {
    throw PromotionErrors.invalid('Giới hạn mỗi khách không được vượt tổng lượt');
  }
  if (draft.endAt && draft.endAt.getTime() <= draft.startAt.getTime()) {
    throw PromotionErrors.invalid('Ngày kết thúc phải sau ngày bắt đầu');
  }
}

const scopeData = (scope: Scope) => ({
  categories: { createMany: { data: scope.categoryIds.map((categoryId) => ({ categoryId })) } },
  products: { createMany: { data: scope.productIds.map((productId) => ({ productId })) } },
});

@Injectable()
export class PromotionCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotions: PromotionsService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreatePromotionDto, client: ClientInfo) {
    if ((dto.kind ?? 'voucher') !== 'voucher') throw PromotionErrors.kindUnsupported();
    const draft = toDraft(dto);
    checkRules(draft);
    if (draft.endAt && draft.endAt.getTime() <= Date.now()) {
      throw PromotionErrors.invalid('Ngày kết thúc phải ở tương lai');
    }
    const created = await this.prisma
      .$transaction(async (tx) => {
        await this.assertScope(tx, draft.scope);
        if (await tx.promotion.count({ where: { code: draft.code } }))
          throw PromotionErrors.codeTaken();
        const { scope, ...fields } = draft;
        return tx.promotion.create({
          data: {
            ...fields,
            kind: 'voucher',
            scopeType: scope.type,
            searchKey: promotionSearchKey(draft.name, draft.code),
            state: dto.activate ? 'active' : 'draft',
            createdById: user.id,
            ...scopeData(scope),
          },
          select: { id: true, code: true, state: true },
        });
      })
      .catch(this.uniqueCode);
    await this.audit.log('PROMOTION_CREATED', client, { userId: user.id, meta: { ...created } });
    return this.promotions.get(created.id);
  }

  async update(user: AuthUser, id: string, dto: UpdatePromotionDto, client: ClientInfo) {
    const changes = await this.prisma
      .$transaction(async (tx) => {
        const current = await this.lock(tx, id);
        const scope = scopeOf(current);
        const merged = toDraft({
          code: dto.code ?? current.code,
          name: dto.name ?? current.name,
          description: dto.description !== undefined ? dto.description : current.description,
          discountType: dto.discountType ?? current.discountType,
          discountValue: dto.discountValue ?? current.discountValue,
          maxDiscount: dto.maxDiscount !== undefined ? dto.maxDiscount : current.maxDiscount,
          minOrder: dto.minOrder !== undefined ? dto.minOrder : current.minOrder,
          scope: dto.scope ?? scope,
          usageLimit: dto.usageLimit !== undefined ? dto.usageLimit : current.usageLimit,
          perCustomerLimit:
            dto.perCustomerLimit !== undefined ? dto.perCustomerLimit : current.perCustomerLimit,
          stackable: dto.stackable ?? current.stackable,
          startAt: dto.startAt ?? current.startAt.toISOString(),
          endAt: dto.endAt !== undefined ? dto.endAt : (current.endAt?.toISOString() ?? null),
        });
        checkRules(merged);
        const used = await tx.promotionRedemption.count({ where: { promotionId: id } });
        if (used) {
          const locked = [
            merged.code !== current.code && 'code',
            merged.discountType !== current.discountType && 'discountType',
            merged.discountValue !== current.discountValue && 'discountValue',
            (merged.scope.type !== scope.type ||
              !sameSet(merged.scope.categoryIds, scope.categoryIds) ||
              !sameSet(merged.scope.productIds, scope.productIds)) &&
              'scope',
          ].filter((field): field is string => !!field);
          if (locked.length) throw PromotionErrors.lockedFields(locked);
        }
        if (merged.usageLimit !== null && merged.usageLimit < current.usedCount) {
          throw PromotionErrors.invalid(
            `Giới hạn lượt không được thấp hơn số lượt đã dùng (${current.usedCount})`,
          );
        }
        if (
          merged.code !== current.code &&
          (await tx.promotion.count({ where: { code: merged.code } }))
        ) {
          throw PromotionErrors.codeTaken();
        }
        await this.assertScope(tx, merged.scope);
        const activate = dto.activate && current.state === 'draft';
        if (activate) this.assertActivatable({ ...current, ...merged });
        const { scope: nextScope, ...fields } = merged;
        await tx.promotionCategory.deleteMany({ where: { promotionId: id } });
        await tx.promotionProduct.deleteMany({ where: { promotionId: id } });
        await tx.promotion.update({
          where: { id },
          data: {
            ...fields,
            scopeType: nextScope.type,
            searchKey: promotionSearchKey(merged.name, merged.code),
            ...(activate ? { state: 'active' } : {}),
            ...scopeData(nextScope),
          },
        });
        return { code: merged.code, fields: Object.keys(dto), activated: !!activate };
      })
      .catch(this.uniqueCode);
    await this.audit.log('PROMOTION_UPDATED', client, {
      userId: user.id,
      meta: { id, ...changes },
    });
    return this.promotions.get(id);
  }

  async setState(
    user: AuthUser,
    id: string,
    state: Exclude<PromotionState, 'draft'>,
    client: ClientInfo,
  ) {
    const before = await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      if (current.state === state) return null;
      if (state === 'active') this.assertActivatable(current);
      if (state === 'paused' && current.state !== 'active') {
        throw PromotionErrors.invalidState('Chỉ tạm dừng được chương trình đang hoạt động');
      }
      await tx.promotion.update({ where: { id }, data: { state } });
      return current;
    });
    if (before) {
      await this.audit.log('PROMOTION_STATE_CHANGED', client, {
        userId: user.id,
        meta: { id, code: before.code, from: before.state, to: state },
      });
    }
    return this.promotions.get(id);
  }

  async remove(user: AuthUser, id: string, client: ClientInfo) {
    const removed = await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      if (await tx.promotionRedemption.count({ where: { promotionId: id } }))
        throw PromotionErrors.inUse();
      await tx.promotion.delete({ where: { id } });
      return { code: current.code, name: current.name };
    });
    await this.audit.log('PROMOTION_DELETED', client, {
      userId: user.id,
      meta: { id, ...removed },
    });
  }

  private assertActivatable(p: {
    endAt: Date | null;
    usageLimit: number | null;
    usedCount: number;
  }) {
    if (isExpired(p))
      throw PromotionErrors.invalidState(
        'Chương trình đã hết hạn, hãy gia hạn ngày kết thúc trước',
      );
    if (isUsedUp(p))
      throw PromotionErrors.invalidState('Chương trình đã hết lượt, hãy tăng giới hạn lượt trước');
  }

  private async lock(tx: Tx, id: string) {
    const [row] = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM promotions WHERE id = ${id}::uuid FOR UPDATE`;
    if (!row) throw PromotionErrors.notFound();
    return tx.promotion.findUniqueOrThrow({ where: { id }, include: promotionInclude });
  }

  private async assertScope(tx: Tx, scope: Scope) {
    if (scope.type === 'categories') {
      if (!scope.categoryIds.length) throw PromotionErrors.scopeInvalid('Chọn ít nhất 1 danh mục');
      const found = await tx.category.count({ where: { id: { in: scope.categoryIds } } });
      if (found !== scope.categoryIds.length)
        throw PromotionErrors.scopeInvalid('Có danh mục không tồn tại');
    }
    if (scope.type === 'products') {
      if (!scope.productIds.length) throw PromotionErrors.scopeInvalid('Chọn ít nhất 1 sản phẩm');
      const found = await tx.product.count({
        where: { id: { in: scope.productIds }, deletedAt: null },
      });
      if (found !== scope.productIds.length)
        throw PromotionErrors.scopeInvalid('Có sản phẩm không tồn tại hoặc đã bị xóa');
    }
  }

  private uniqueCode(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw PromotionErrors.codeTaken();
    }
    throw error;
  }
}
