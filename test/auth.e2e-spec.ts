import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SmsService } from '../src/modules/auth/sms.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { cookieLine, createTestApp, PASSWORD, TestClient, TestData } from './support';

const sentOtps: { phone: string; code: string }[] = [];

let app: NestFastifyApplication;
let prisma: PrismaService;
let data: TestData;
let storeId = '';
let RUN = '';

const createUser = (role?: Parameters<TestData['user']>[0]) => data.user(role);
const client = () => new TestClient(app);

beforeAll(async () => {
  app = await createTestApp((builder) =>
    builder.overrideProvider(SmsService).useValue({
      sendOtp: async (phone: string, code: string) => {
        sentOtps.push({ phone, code });
      },
    }),
  );
  data = TestData.for(app);
  prisma = data.prisma;
  RUN = data.run;
  storeId = await data.store();
});

afterAll(async () => {
  await data?.cleanup();
  await app?.close();
});

describe('Đăng nhập', () => {
  it('đăng nhập đúng: set 3 cookie, không trả token trong body', async () => {
    const user = await createUser('manager');
    const c = client();
    const res = await c.login(user.username);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: user.id,
      username: user.username,
      phone: user.phone,
      name: user.name,
      role: 'manager',
      storeId,
    });
    expect(res.body.csrfToken).toBe(c.jar.fs_csrf);
    expect(typeof res.body.expiresAt).toBe('string');
    expect(JSON.stringify(res.body)).not.toContain(c.jar.fs_at);
    expect(JSON.stringify(res.body)).not.toContain(c.jar.fs_rt);

    const at = cookieLine(res, 'fs_at') ?? '';
    expect(at).toMatch(/HttpOnly/);
    expect(at).toMatch(/SameSite=Lax/);
    expect(at).toMatch(/Path=\/api(;|$)/);
    expect(at).toMatch(/Max-Age=900/);
    const rt = cookieLine(res, 'fs_rt') ?? '';
    expect(rt).toMatch(/HttpOnly/);
    expect(rt).toMatch(/SameSite=Strict/);
    expect(rt).toMatch(/Path=\/api\/auth/);
    expect(rt).not.toMatch(/Max-Age/);
    const csrf = cookieLine(res, 'fs_csrf') ?? '';
    expect(csrf).not.toMatch(/HttpOnly/);
    expect(csrf).toMatch(/Path=\/(;|$)/);

    const me = await c.call('get', '/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(user.id);
  });

  it('đăng nhập bằng số điện thoại, remember cấp refresh cookie 30 ngày', async () => {
    const user = await createUser();
    const res = await client().login(user.phone, PASSWORD, true);
    expect(res.status).toBe(200);
    expect(cookieLine(res, 'fs_rt')).toMatch(/Max-Age=2592000/);
  });

  it('sai mật khẩu và sai tài khoản trả cùng một lỗi', async () => {
    const user = await createUser();
    const wrongPassword = await client().login(user.username, 'WrongPass1');
    const unknownUser = await client().login(`${RUN}ghost`, 'WrongPass1');
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownUser.body);
    expect(wrongPassword.body.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('khóa tài khoản sau 5 lần sai liên tiếp', async () => {
    const user = await createUser();
    const c = client();
    for (let i = 0; i < 4; i += 1) {
      expect((await c.login(user.username, 'WrongPass1')).status).toBe(401);
    }
    const locked = await c.login(user.username, 'WrongPass1');
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe('AUTH_ACCOUNT_LOCKED');
    expect(locked.body.retryAfter).toBe(30);
    expect(locked.headers['retry-after']).toBe('30');

    const stillLocked = await c.login(user.username, PASSWORD);
    expect(stillLocked.status).toBe(423);
  });

  it('yêu cầu chưa đăng nhập bị từ chối', async () => {
    const res = await client().call('get', '/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_UNAUTHENTICATED');
  });

  it('giới hạn 10 lần đăng nhập/phút theo IP', async () => {
    const c = client();
    for (let i = 0; i < 10; i += 1) {
      expect((await c.login(`${RUN}nobody`, 'WrongPass1')).status).toBe(401);
    }
    const limited = await c.login(`${RUN}nobody`, 'WrongPass1');
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('Refresh token', () => {
  it('xoay token và phát hiện dùng lại token cũ', async () => {
    const user = await createUser();
    const c = client();
    await c.login(user.username);
    const stale = c.clone();

    const refreshed = await c.call('post', '/auth/refresh');
    expect(refreshed.status).toBe(200);
    expect(c.jar.fs_rt).not.toBe(stale.jar.fs_rt);
    expect(refreshed.body.user.id).toBe(user.id);
    expect(refreshed.body.csrfToken).toBe(c.jar.fs_csrf);
    expect((await c.call('get', '/auth/me')).status).toBe(200);

    const reuse = await stale.call('post', '/auth/refresh');
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('AUTH_REFRESH_REUSED');

    expect((await c.call('post', '/auth/refresh')).status).toBe(401);
    const audit = await prisma.auditLog.findFirst({
      where: { userId: user.id, action: 'TOKEN_REUSE_DETECTED' },
    });
    expect(audit).not.toBeNull();
  });
});

describe('Đăng xuất', () => {
  it('logout thu hồi phiên hiện tại và xóa cookie', async () => {
    const user = await createUser();
    const c = client();
    await c.login(user.username);
    const stale = c.clone();

    const res = await c.call('post', '/auth/logout');
    expect(res.status).toBe(204);
    expect(c.jar.fs_at).toBeUndefined();
    expect(c.jar.fs_rt).toBeUndefined();
    expect((await stale.call('get', '/auth/me')).status).toBe(401);
    expect((await stale.call('post', '/auth/refresh')).status).toBe(401);
  });

  it('logout-all thu hồi mọi thiết bị', async () => {
    const user = await createUser();
    const a = client();
    const b = client();
    await a.login(user.username);
    await b.login(user.username);

    expect((await a.call('post', '/auth/logout-all')).status).toBe(204);
    expect((await b.call('get', '/auth/me')).status).toBe(401);
    expect((await b.call('post', '/auth/refresh')).status).toBe(401);
  });

  it('thu hồi một thiết bị trong danh sách phiên', async () => {
    const user = await createUser();
    const a = client();
    const b = client();
    await a.login(user.username);
    await b.login(user.username);

    const list = await a.call('get', '/auth/sessions');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    const other = list.body.find((s: { current: boolean }) => !s.current);
    expect(other.ip).toMatch(/^10\.20\.\*\.\*$/);

    expect((await a.call('delete', `/auth/sessions/${other.id}`)).status).toBe(204);
    expect((await b.call('get', '/auth/me')).status).toBe(401);
    expect((await a.call('get', '/auth/me')).status).toBe(200);
  });
});

describe('CSRF & Origin', () => {
  it('thiếu hoặc sai CSRF bị chặn 403', async () => {
    const user = await createUser();
    const c = client();
    await c.login(user.username);

    const missing = await c.call('post', '/auth/logout-all', undefined, { csrf: null });
    expect(missing.status).toBe(403);
    expect(missing.body.code).toBe('CSRF_INVALID');
    const wrong = await c.call('post', '/auth/logout-all', undefined, { csrf: 'wrong-token' });
    expect(wrong.status).toBe(403);
    const refresh = await c.call('post', '/auth/refresh', undefined, { csrf: null });
    expect(refresh.status).toBe(403);
    expect((await c.call('get', '/auth/me')).status).toBe(200);
  });

  it('Origin ngoài allowlist hoặc thiếu Origin bị từ chối', async () => {
    const user = await createUser();
    const evil = await client().call(
      'post',
      '/auth/login',
      { username: user.username, password: PASSWORD },
      { origin: 'https://evil.example' },
    );
    expect(evil.status).toBe(403);
    expect(evil.body.code).toBe('ORIGIN_NOT_ALLOWED');

    const none = await client().call(
      'post',
      '/auth/login',
      { username: user.username, password: PASSWORD },
      { origin: null },
    );
    expect(none.status).toBe(403);

    const c = client();
    await c.login(user.username);
    const crossSite = await c.call('post', '/auth/logout-all', undefined, {
      origin: 'https://evil.example',
    });
    expect(crossSite.status).toBe(403);
  });
});

describe('Mật khẩu', () => {
  it('đổi mật khẩu làm các phiên cũ mất hiệu lực', async () => {
    const user = await createUser();
    const a = client();
    const b = client();
    await a.login(user.username);
    await b.login(user.username);

    const wrong = await a.call('post', '/auth/change-password', {
      currentPassword: 'NotMine123',
      newPassword: 'NewPass123',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('AUTH_INVALID_PASSWORD');

    const weak = await a.call('post', '/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'short',
    });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('VALIDATION_ERROR');

    const ok = await a.call('post', '/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'NewPass123',
    });
    expect(ok.status).toBe(200);
    expect((await a.call('get', '/auth/me')).status).toBe(200);
    expect((await b.call('get', '/auth/me')).status).toBe(401);
    expect((await b.call('post', '/auth/refresh')).status).toBe(401);
    expect((await client().login(user.username)).status).toBe(401);
    expect((await client().login(user.username, 'NewPass123')).status).toBe(200);
  });

  it('quên mật khẩu bằng OTP', async () => {
    const user = await createUser();
    const holder = client();
    await holder.login(user.username);
    const c = client();

    const decoy = await c.call('post', '/auth/forgot-password', { account: `${RUN}ghost` });
    expect(decoy.status).toBe(200);
    expect(decoy.body.maskedTarget).toMatch(/^\d{3}\*{4}\d{3}$/);

    const res = await c.call('post', '/auth/forgot-password', { account: user.username });
    expect(res.status).toBe(200);
    expect(res.body.maskedTarget).toBe(`${user.phone.slice(0, 3)}****${user.phone.slice(-3)}`);
    const sent = sentOtps.find((otp) => otp.phone === user.phone);
    expect(sent).toBeDefined();
    const code = sent?.code ?? '';

    const bad = await c.call('post', '/auth/reset-password', {
      account: user.username,
      otp: code === '000000' ? '111111' : '000000',
      newPassword: 'Reset1234',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('OTP_INVALID');

    const reset = { account: user.username, otp: code, newPassword: 'Reset1234' };
    expect((await c.call('post', '/auth/reset-password', reset)).status).toBe(204);
    expect((await c.call('post', '/auth/reset-password', reset)).status).toBe(400);
    expect((await holder.call('get', '/auth/me')).status).toBe(401);
    expect((await client().login(user.username, 'Reset1234')).status).toBe(200);
  });
});

describe('Hệ thống', () => {
  it('healthcheck kiểm tra DB', async () => {
    const res = await client().call('get', '/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });
});
