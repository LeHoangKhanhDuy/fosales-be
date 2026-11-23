import type { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
  storeId: string;
  sid: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
