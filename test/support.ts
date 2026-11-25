import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp, createAdapter } from '../src/app.setup';
import { hashPassword } from '../src/common/security/password';
import { loadConfig } from '../src/config/app-config';
import { PrismaService } from '../src/prisma/prisma.service';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'Secret123';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface CallOptions {
  csrf?: string | null;
  origin?: string | null;
  headers?: Record<string, string>;
}

let ipSeq = 0;

function nextIp() {
  ipSeq += 1;
  return `10.20.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
}

export function setCookieLines(res: request.Response): string[] {
  const raw: unknown = res.headers['set-cookie'];
  if (Array.isArray(raw)) return raw.map(String);
  return typeof raw === 'string' ? [raw] : [];
}

export function cookieLine(res: request.Response, name: string): string | undefined {
  return setCookieLines(res).find((line) => line.startsWith(`${name}=`));
}

export class TestClient {
  readonly jar: Record<string, string> = {};
  readonly ip = nextIp();

  constructor(private readonly app: NestFastifyApplication) {}

  async call(method: Method, path: string, body?: object, options: CallOptions = {}) {
    let req = request(this.app.getHttpServer())
      [method](`/api${path}`)
      .set('X-Forwarded-For', this.ip);
    if (options.headers) req = req.set(options.headers);
    const origin = options.origin === undefined ? ORIGIN : options.origin;
    if (origin) req = req.set('Origin', origin);
    const cookie = Object.entries(this.jar)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    if (cookie) req = req.set('Cookie', cookie);
    const csrf = options.csrf === undefined ? this.jar.fs_csrf : options.csrf;
    if (method !== 'get' && csrf) req = req.set('X-CSRF-Token', csrf);
    const res = body ? await req.send(body) : await req;
    this.absorb(res);
    return res;
  }

  upload(path: string, file: Buffer, filename: string) {
    const cookie = Object.entries(this.jar)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    return request(this.app.getHttpServer())
      .post(`/api${path}`)
      .set('X-Forwarded-For', this.ip)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', this.jar.fs_csrf ?? '')
      .attach('file', file, filename);
  }

  login(username: string, password = PASSWORD, remember = false) {
    return this.call('post', '/auth/login', { username, password, remember });
  }

  clone() {
    const copy = new TestClient(this.app);
    Object.assign(copy.jar, this.jar);
    return copy;
  }

  private absorb(res: request.Response) {
    for (const line of setCookieLines(res)) {
      const pair = line.split(';')[0];
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = /expires=thu, 01 jan 1970/i.test(line) || /max-age=0(;|$)/i.test(line);
      if (!value || expired) delete this.jar[name];
      else this.jar[name] = value;
    }
  }
}

export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
) {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('E2E chỉ chạy với NODE_ENV=test (test/e2e.env)');
  const config = loadConfig();
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createAdapter(config));
  await configureApp(app, config);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export class TestData {
  readonly run = `e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  private readonly phoneBase = Math.floor(Math.random() * 80_000_000);
  private seq = 0;
  private storeId?: string;

  constructor(readonly prisma: PrismaService) {}

  static for(app: NestFastifyApplication) {
    return new TestData(app.get(PrismaService));
  }

  async store() {
    this.storeId ??= (
      await this.prisma.store.create({ data: { code: this.run, name: 'E2E Store' } })
    ).id;
    return this.storeId;
  }

  async user(role: Role = 'cashier') {
    this.seq += 1;
    return this.prisma.user.create({
      data: {
        username: `${this.run}u${this.seq}`,
        phone: this.phone(this.seq),
        name: `E2E ${this.seq}`,
        role,
        storeId: await this.store(),
        passwordHash: await hashPassword(PASSWORD),
      },
    });
  }

  phone(offset: number) {
    return `07${String(this.phoneBase + offset).padStart(8, '0')}`;
  }

  async catalog() {
    this.seq += 1;
    const key = `${this.run} c${this.seq}`;
    const [category, unit] = await Promise.all([
      this.prisma.category.create({ data: { name: key, nameKey: key, sortOrder: 9999 } }),
      this.prisma.unit.create({
        data: { name: `${this.run}u${this.seq}`, nameKey: `${this.run}u${this.seq}` },
      }),
    ]);
    return { category, unit };
  }

  product(categoryId: string, unitId: string) {
    this.seq += 1;
    const sku = `${this.run}P${this.seq}`.toUpperCase();
    const name = `${this.run} p${this.seq}`;
    return this.prisma.product.create({
      data: { name, sku, skuKey: sku, searchKey: name, price: 10000, categoryId, unitId },
    });
  }

  async cleanup() {
    const supplier = { supplier: { nameKey: { startsWith: this.run } } };
    const store = { store: { code: this.run } };
    const customer = { customer: { name: { startsWith: this.run } } };
    await this.prisma.pointLog.deleteMany({ where: customer });
    await this.prisma.customer.deleteMany({ where: { name: { startsWith: this.run } } });
    await this.prisma.goodsReceipt.deleteMany({ where: store });
    await this.prisma.purchaseOrder.deleteMany({ where: store });
    await this.prisma.supplierLedgerEntry.deleteMany({ where: supplier });
    await this.prisma.supplierPayment.deleteMany({ where: supplier });
    await this.prisma.supplier.deleteMany({ where: { nameKey: { startsWith: this.run } } });
    await this.prisma.product.deleteMany({ where: { name: { startsWith: this.run } } });
    await this.prisma.category.deleteMany({ where: { nameKey: { startsWith: this.run } } });
    await this.prisma.unit.deleteMany({ where: { nameKey: { startsWith: this.run } } });
    await this.prisma.user.deleteMany({ where: { username: { startsWith: this.run } } });
    await this.prisma.store.deleteMany({ where: { code: this.run } });
  }
}
