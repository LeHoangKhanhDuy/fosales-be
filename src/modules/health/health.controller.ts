import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppException } from '../../common/app-exception';
import { Public } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppException(503, 'SERVICE_UNAVAILABLE', 'Không kết nối được cơ sở dữ liệu', {
        details: { database: 'down' },
      });
    }
    return { status: 'ok', database: 'up', time: new Date().toISOString() };
  }
}
