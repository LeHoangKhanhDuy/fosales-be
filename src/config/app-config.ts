import { config as loadDotenv } from 'dotenv';
import { Env, envSchema } from './env.schema';

export class AppConfig {
  readonly nodeEnv: Env['NODE_ENV'];
  readonly port: number;
  readonly jwtSecret: string;
  readonly cookieDomain: string | undefined;
  readonly corsOrigins: readonly string[];
  readonly accessTtl: number;
  readonly refreshTtlRemember: number;
  readonly refreshTtlSession: number;
  readonly trustProxy: boolean | number | string;
  readonly logLevel: Env['LOG_LEVEL'];
  readonly openSwagger: boolean;
  readonly storage: {
    driver: 'local' | 's3';
    uploadDir: string;
    s3: {
      endpoint?: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicUrl: string;
    };
  };
  private readonly allowedOrigins: Set<string>;

  constructor(env: Env) {
    this.nodeEnv = env.NODE_ENV;
    this.port = env.PORT;
    this.jwtSecret = env.JWT_SECRET;
    this.cookieDomain = env.COOKIE_DOMAIN;
    this.corsOrigins = env.CORS_ORIGINS;
    this.accessTtl = env.ACCESS_TTL;
    this.refreshTtlRemember = env.REFRESH_TTL_REMEMBER;
    this.refreshTtlSession = env.REFRESH_TTL_SESSION;
    this.trustProxy = env.TRUST_PROXY;
    this.logLevel = env.LOG_LEVEL;
    this.openSwagger = env.OPEN_SWAGGER;
    this.storage = {
      driver: env.STORAGE_DRIVER,
      uploadDir: env.UPLOAD_DIR,
      s3: {
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET ?? '',
        accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
        publicUrl: env.S3_PUBLIC_URL ?? '',
      },
    };
    this.allowedOrigins = new Set(env.CORS_ORIGINS);
  }

  get isProduction() {
    return this.nodeEnv === 'production';
  }

  get isDevelopment() {
    return this.nodeEnv === 'development';
  }

  get swaggerEnabled() {
    return this.nodeEnv === 'development' || this.nodeEnv === 'staging';
  }

  get cookieSecure() {
    return !this.isDevelopment;
  }

  isAllowedOrigin(origin: string) {
    return this.allowedOrigins.has(origin);
  }
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  loadDotenv();
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment variables:\n${issues.join('\n')}`);
  }
  cached = new AppConfig(result.data);
  return cached;
}
