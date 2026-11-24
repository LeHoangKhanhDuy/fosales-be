import { z } from 'zod';

const DURATION_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export function parseDuration(value: string): number | null {
  const match = /^(\d+)\s*([smhd]?)$/i.exec(value.trim());
  if (!match) return null;
  const seconds = Number(match[1]) * DURATION_UNITS[(match[2] || 's').toLowerCase()];
  return seconds > 0 ? seconds : null;
}

function parseTrustProxy(value: string): boolean | number | string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false' || normalized === '') return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return value.trim();
}

const duration = z.string().transform((value, ctx) => {
  const seconds = parseDuration(value);
  if (seconds === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Expected a duration like 900, 15m, 12h, 30d',
    });
    return z.NEVER;
  }
  return seconds;
});

const origins = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  )
  .pipe(z.array(z.string().url()).min(1));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z
      .string()
      .refine(
        (value) => Buffer.byteLength(value, 'utf8') >= 32,
        'JWT_SECRET must be at least 32 bytes',
      ),
    COOKIE_DOMAIN: z
      .string()
      .trim()
      .transform((value) => value || undefined),
    CORS_ORIGINS: origins,
    ACCESS_TTL: duration,
    REFRESH_TTL_REMEMBER: duration,
    REFRESH_TTL_SESSION: duration,
    TRUST_PROXY: z.string().default('false').transform(parseTrustProxy),
    OPEN_SWAGGER: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    UPLOAD_DIR: z.string().trim().min(1).default('uploads'),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_URL: z
      .string()
      .url()
      .transform((value) => value.replace(/\/+$/, ''))
      .optional(),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER !== 's3') return;
    for (const key of [
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'S3_PUBLIC_URL',
    ] as const) {
      if (!env[key])
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Required when STORAGE_DRIVER=s3',
        });
    }
  });

export type Env = z.infer<typeof envSchema>;
