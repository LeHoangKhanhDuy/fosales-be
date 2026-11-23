import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.store.findUnique({ where: { id } });
  }

  findByCode(code: string) {
    return this.prisma.store.findUnique({ where: { code } });
  }
}
