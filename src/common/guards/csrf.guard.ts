import '@fastify/cookie';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { AppConfig } from '../../config/app-config';
import { CSRF_COOKIE, CSRF_HEADER, SKIP_CSRF_KEY } from '../constants';
import { Errors } from '../errors';
import { requestOrigin } from '../http/client-info';
import { safeEqual } from '../security/crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(req.method)) return true;

    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const origin = requestOrigin(req);
    if (origin ? !this.isTrustedOrigin(origin, req) : skipCsrf) throw Errors.originNotAllowed();
    if (skipCsrf) return true;

    const cookie = req.cookies[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER];
    if (!cookie || typeof header !== 'string' || !safeEqual(cookie, header)) {
      throw Errors.csrfInvalid();
    }
    return true;
  }

  private isTrustedOrigin(origin: string, req: FastifyRequest) {
    if (this.config.isAllowedOrigin(origin)) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }
}
