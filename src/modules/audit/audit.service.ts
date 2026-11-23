import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction, Prisma } from '@prisma/client';
import type { ClientInfo } from '../../common/http/client-info';
import { PrismaService } from '../../prisma/prisma.service';

interface AuditData {
  userId?: string | null;
  meta?: Prisma.InputJsonObject;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(action: AuditAction, client: ClientInfo, data: AuditData = {}): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          userId: data.userId ?? null,
          ip: client.ip,
          userAgent: client.userAgent,
          meta: data.meta,
        },
      });
    } catch (error) {
      this.logger.error(`Không ghi được audit log ${action}: ${String(error)}`);
    }
  }
}
