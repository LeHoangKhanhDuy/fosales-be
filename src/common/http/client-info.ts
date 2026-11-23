import type { FastifyRequest } from 'fastify';

export interface ClientInfo {
  ip: string;
  userAgent: string | null;
}

export function clientInfo(req: FastifyRequest): ClientInfo {
  const userAgent = req.headers['user-agent'];
  return { ip: req.ip, userAgent: userAgent ? userAgent.slice(0, 512) : null };
}

export function requestOrigin(req: FastifyRequest): string | null {
  const origin = req.headers.origin;
  if (origin) return origin === 'null' ? null : origin.replace(/\/+$/, '');
  const referer = req.headers.referer;
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
