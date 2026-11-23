import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, createAdapter } from './app.setup';
import { openBrowserOnce } from './common/utils/open-browser';
import { loadConfig } from './config/app-config';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createAdapter(config), {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  await configureApp(app, config);
  await app.listen(config.port, '0.0.0.0');
  logger.log(`FoSales API đang chạy tại cổng ${config.port} (${config.nodeEnv})`);
  if (!config.swaggerEnabled) return;
  const docsUrl = `http://localhost:${config.port}/api/docs`;
  logger.log(`Swagger: ${docsUrl}`);
  if (config.isDevelopment && config.openSwagger) openBrowserOnce(docsUrl);
}

void bootstrap();
