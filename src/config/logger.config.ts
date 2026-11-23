import type { Params } from 'nestjs-pino';
import { AppConfig } from './app-config';

const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.otp',
  '*.token',
  '*.refreshToken',
  '*.csrfToken',
];

export function loggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      transport: config.isDevelopment
        ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } }
        : undefined,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    },
  };
}
