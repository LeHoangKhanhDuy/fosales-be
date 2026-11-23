import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'Secret123';

type Method = 'get' | 'post' | 'delete';

interface CallOptions {
  csrf?: string | null;
  origin?: string | null;
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
