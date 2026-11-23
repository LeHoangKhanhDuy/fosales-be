import '@fastify/cookie';
import '../auth-user';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { SessionCacheService } from '../../modules/auth/session-cache.service';
import { TokensService } from '../../modules/auth/tokens.service';
import { ACCESS_COOKIE, IS_PUBLIC_KEY } from '../constants';
import { Errors } from '../errors';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly sessions: SessionCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = req.cookies[ACCESS_COOKIE];
    if (!token) throw Errors.unauthenticated();

    const payload = await this.tokens.verifyAccess(token);
    if (!payload) throw Errors.unauthenticated();

    const state = await this.sessions.get(payload.sid);
    const valid =
      state?.active && state.userId === payload.sub && payload.iat >= state.passwordChangedAtSec;
    if (!state || !valid) throw Errors.sessionExpired();

    req.user = { id: payload.sub, role: state.role, storeId: state.storeId, sid: payload.sid };
    return true;
  }
}
