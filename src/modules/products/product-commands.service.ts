import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/app-exception';
import type { AuthUser } from '../../common/auth-user';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { definedOnly } from '../catalog/catalog.utils';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductErrors } from './products.errors';
import { formatSku, isValidBarcode, productSearchKey } from './products.utils';
import { ProductsService } from './products.service';
import { StockLedger } from '../stock/stock-ledger.service';

type Tx = Prisma.TransactionClient;

function uniqueErrors(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta?.target ?? '');
    if (target.includes('barcode')) throw ProductErrors.barcodeTaken();
    if (target.includes('sku')) throw ProductErrors.skuTaken();
  }
  throw error;
}

function assertBarcode(barcode: string | null | undefined) {
  if (barcode && !isValidBarcode(barcode)) throw ProductErrors.barcodeInvalid();
}

function assertPrices(price: number, originalPrice: number | null | undefined) {
  if (originalPrice != null && originalPrice <= price) throw ProductErrors.originalPriceInvalid();
}

@Injectable()
export class ProductCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly ledger: StockLedger,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateProductDto, client: ClientInfo) {
    assertBarcode(dto.barcode);
    assertPrices(dto.price, dto.originalPrice);
    const { initialStock, sku: requestedSku, ...fields } = dto;
    const created = await this.prisma
      .$transaction(async (tx) => {
        await this.assertReferences(tx, dto.categoryId, dto.unitId);
        const sku = requestedSku || (await this.nextSku(tx));
        const barcode = dto.barcode ?? null;
        const product = await tx.product.create({
          data: {
            ...fields,
            sku,
            skuKey: sku,
            barcode,
            barcodeKey: barcode,
            searchKey: productSearchKey(dto.name, sku, barcode),
          },
          select: { id: true, sku: true },
        });
        if (initialStock) {
          await this.ledger.setQuantity(tx, {
            productId: product.id,
            storeId: user.storeId,
            userId: user.id,
            quantity: initialStock,
            type: 'initial',
            reason: 'Tồn đầu kỳ',
          });
        }
        return product;
      })
      .catch(uniqueErrors);
    await this.audit.log('PRODUCT_CREATED', client, {
      userId: user.id,
      meta: { id: created.id, sku: created.sku, name: dto.name, initialStock: initialStock ?? 0 },
    });
    return this.products.get(user, created.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateProductDto, client: ClientInfo) {
    const { stock, initialStock: _ignored, ...changes } = dto;
    if (changes.sku === '') throw new AppException(400, 'VALIDATION_ERROR', 'Vui lòng nhập SKU');
    assertBarcode(changes.barcode);
    const data = definedOnly(changes);
    if (!Object.keys(data).length && stock === undefined) throw Errors.emptyUpdate();

    const result = await this.prisma
      .$transaction(async (tx) => {
        const current = await tx.product.findFirst({
          where: { id, deletedAt: null },
          select: { name: true, sku: true, barcode: true, price: true, originalPrice: true },
        });
        if (!current) throw ProductErrors.notFound();
        assertPrices(
          data.price ?? current.price,
          data.originalPrice !== undefined ? data.originalPrice : current.originalPrice,
        );
        await this.assertReferences(tx, data.categoryId, data.unitId);
        if (Object.keys(data).length) {
          const keys = this.keys(current, data);
          await tx.product.update({ where: { id }, data: { ...data, ...keys } });
        }
        const stockChange =
          stock === undefined
            ? null
            : await this.ledger.setQuantity(tx, {
                productId: id,
                storeId: user.storeId,
                userId: user.id,
                quantity: stock,
                reason: 'Sửa trong trang sản phẩm',
              });
        return { previousPrice: current.price, stockChange };
      })
      .catch(uniqueErrors);

    await this.auditUpdate(user, id, data, result, client);
    return this.products.get(user, id);
  }

  async setStatus(
    user: AuthUser,
    ids: string[],
    status: 'active' | 'inactive',
    client: ClientInfo,
  ) {
    const { count } = await this.prisma.product.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { status },
    });
    await this.audit.log('PRODUCT_STATUS_CHANGED', client, {
      userId: user.id,
      meta: { ids, status, updated: count },
    });
    return { updated: count };
  }

  async softDelete(user: AuthUser, ids: string[], client: ClientInfo) {
    const result = await this.prisma.$transaction(async (tx) => {
      const alive = await tx.product.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: {
          id: true,
          stocks: {
            where: { storeId: user.storeId, quantity: { gt: 0 } },
            select: { quantity: true },
          },
        },
      });
      const aliveIds = alive.map((product) => product.id);
      const { count } = await tx.product.updateMany({
        where: { id: { in: aliveIds }, deletedAt: null },
        data: { deletedAt: new Date(), skuKey: null, barcodeKey: null },
      });
      const withStock = alive
        .filter((product) => product.stocks.length)
        .map((product) => product.id);
      return { deleted: count, ids: aliveIds, withStock };
    });
    await this.audit.log('PRODUCT_DELETED', client, {
      userId: user.id,
      meta: { ids: result.ids, withStock: result.withStock },
    });
    return { deleted: result.deleted, withStock: result.withStock.length };
  }

  private keys(
    current: { name: string; sku: string; barcode: string | null },
    data: Partial<UpdateProductDto>,
  ) {
    const sku = data.sku ?? current.sku;
    const barcode = data.barcode !== undefined ? data.barcode : current.barcode;
    const touched = data.name !== undefined || data.sku !== undefined || data.barcode !== undefined;
    return {
      ...(data.sku !== undefined ? { skuKey: sku } : {}),
      ...(data.barcode !== undefined ? { barcodeKey: barcode } : {}),
      ...(touched ? { searchKey: productSearchKey(data.name ?? current.name, sku, barcode) } : {}),
    };
  }

  private async assertReferences(tx: Tx, categoryId?: string, unitId?: string) {
    const [category, unit] = await Promise.all([
      categoryId ? tx.category.count({ where: { id: categoryId } }) : 1,
      unitId ? tx.unit.count({ where: { id: unitId } }) : 1,
    ]);
    if (!category) throw ProductErrors.categoryInvalid();
    if (!unit) throw ProductErrors.unitInvalid();
  }

  private async nextSku(tx: Tx) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fosales:product-sku'))`;
    const [{ max }] = await tx.$queryRaw<{ max: number }[]>`
      SELECT COALESCE(max(substring(sku FROM 3)::int), 0)::int AS max
      FROM products WHERE sku ~ '^SP[0-9]{1,9}$'`;
    return formatSku(max + 1);
  }

  private async auditUpdate(
    user: AuthUser,
    id: string,
    data: Partial<UpdateProductDto>,
    result: { previousPrice: number; stockChange: { before: number; after: number } | null },
    client: ClientInfo,
  ) {
    const fields = Object.keys(data);
    if (fields.length) {
      const price =
        data.price !== undefined && data.price !== result.previousPrice
          ? { from: result.previousPrice, to: data.price }
          : undefined;
      await this.audit.log('PRODUCT_UPDATED', client, {
        userId: user.id,
        meta: { id, fields, ...(price ? { price } : {}) },
      });
    }
    if (result.stockChange) {
      await this.audit.log('STOCK_ADJUSTED', client, {
        userId: user.id,
        meta: { productId: id, ...result.stockChange },
      });
    }
  }
}
