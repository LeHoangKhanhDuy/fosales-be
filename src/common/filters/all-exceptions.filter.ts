import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AppException, defaultErrorBody, ErrorBody } from '../app-exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }
    const retryAfter = body.retryAfter ?? this.headerRetryAfter(reply, body.statusCode);
    if (retryAfter) {
      body.retryAfter = retryAfter;
      void reply.header('Retry-After', String(retryAfter));
    }
    void reply.status(body.statusCode).send(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof AppException) return { ...exception.body };
    if (exception instanceof HttpException) return defaultErrorBody(exception.getStatus());
    const status = (exception as { statusCode?: unknown } | null)?.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 600)
      return defaultErrorBody(status);
    return defaultErrorBody(500);
  }

  private headerRetryAfter(reply: FastifyReply, statusCode: number) {
    if (statusCode !== 429) return undefined;
    const value = Number(reply.getHeader('retry-after'));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
}
