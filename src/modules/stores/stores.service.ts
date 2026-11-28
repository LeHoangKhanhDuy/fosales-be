import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth-user';
import { AppException } from '../../common/app-exception';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { definedOnly } from '../catalog/catalog.utils';
import { UpdateStoreDto } from './dto/store.dto';

const STORE_SELECT = {
  id: true,
  code: true,
  name: true,
  address: true,
  phone: true,
  taxCode: true,
  receiptFooter: true,
  branchName: true,
  allowNegativeStock: true,
  returnDays: true,
} as const;

const notFound = () => new AppException(404, 'STORE_NOT_FOUND', 'Không tìm thấy cửa hàng');

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findById(id: string) {
    return this.prisma.store.findUnique({ where: { id } });
  }

  findByCode(code: string) {
    return this.prisma.store.findUnique({ where: { code } });
  }

  async current(user: AuthUser) {
    const store = await this.prisma.store.findUnique({
      where: { id: user.storeId },
      select: STORE_SELECT,
    });
    if (!store) throw notFound();
    return store;
  }

  async updateCurrent(user: AuthUser, dto: UpdateStoreDto, client: ClientInfo) {
    const data = definedOnly(dto);
    if (!Object.keys(data).length) throw Errors.emptyUpdate();
    if (user.role === 'manager' && Object.keys(data).some((field) => field !== 'code')) {
      throw Errors.forbidden();
    }
    const store = await this.prisma.store.update({
      where: { id: user.storeId },
      data,
      select: STORE_SELECT,
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(409, 'STORE_CODE_EXISTS', 'Mã cửa hàng đã được sử dụng');
      }
      throw error;
    });
    await this.audit.log('STORE_UPDATED', client, {
      userId: user.id,
      meta: { storeId: store.id, fields: Object.keys(data) },
    });
    return store;
  }
}
