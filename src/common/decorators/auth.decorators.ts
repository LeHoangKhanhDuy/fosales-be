import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '../auth-user';
import { IS_PUBLIC_KEY, ROLES_KEY, SKIP_CSRF_KEY } from '../constants';
import { clientInfo, ClientInfo } from '../http/client-info';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<FastifyRequest>().user,
);

export const Client = createParamDecorator((_data: unknown, ctx: ExecutionContext): ClientInfo =>
  clientInfo(ctx.switchToHttp().getRequest<FastifyRequest>()),
);
