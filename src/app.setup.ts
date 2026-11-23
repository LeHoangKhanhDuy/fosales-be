import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import { Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppException, defaultErrorBody } from './common/app-exception';
import { ACCESS_COOKIE, CSRF_HEADER } from './common/constants';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppConfig } from './config/app-config';

const BODY_LIMIT = 1024 * 1024;
const logger = new Logger('Fastify');

export function createAdapter(config: AppConfig) {
  return new FastifyAdapter({
    bodyLimit: BODY_LIMIT,
    trustProxy: trustProxyOption(config.trustProxy),
    return503OnClosing: true,
  });
}

function trustProxyOption(value: AppConfig['trustProxy']) {
  if (typeof value !== 'number') return value;
  return (_address: string, hop: number) => hop < value;
}

export async function configureApp(app: NestFastifyApplication, config: AppConfig) {
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.register(fastifyCookie);
  await app.register(fastifyHelmet, helmetOptions(config));
  await app.register(fastifyCors, {
    origin: (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) =>
      callback(null, !origin || config.isAllowedOrigin(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', CSRF_HEADER],
    maxAge: 600,
  });

  const fastify: FastifyInstance = app.getHttpAdapter().getInstance();
  fastify.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) logger.error(error.stack ?? error.message);
    void reply.status(status).send(defaultErrorBody(status));
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationException,
    }),
  );

  if (config.swaggerEnabled) setupSwagger(app);
}

function helmetOptions(config: AppConfig) {
  const directives: Record<string, string[]> = config.swaggerEnabled
    ? {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
        frameAncestors: ["'none'"],
      }
    : { defaultSrc: ["'none'"], frameAncestors: ["'none'"] };
  return {
    contentSecurityPolicy: { useDefaults: false as const, directives },
    strictTransportSecurity: config.isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true }
      : false,
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' as const },
    crossOriginResourcePolicy: { policy: 'same-site' as const },
    referrerPolicy: { policy: 'no-referrer' as const },
  };
}

function flattenErrors(
  errors: ValidationError[],
  parent = '',
): { field: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const constraints = Object.entries(error.constraints ?? {});
    const own = constraints.slice(0, 1).map(([key, message]) => ({
      field,
      message: key === 'whitelistValidation' ? `Trường "${field}" không được phép` : message,
    }));
    return [...own, ...flattenErrors(error.children ?? [], field)];
  });
}

function validationException(errors: ValidationError[]) {
  const details = flattenErrors(errors);
  return new AppException(400, 'VALIDATION_ERROR', details[0]?.message ?? 'Dữ liệu không hợp lệ', {
    details,
  });
}

function setupSwagger(app: NestFastifyApplication) {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('FoSales API')
      .setVersion('0.1.0')
      .addCookieAuth(ACCESS_COOKIE)
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, { swaggerOptions: { withCredentials: true } });
}
