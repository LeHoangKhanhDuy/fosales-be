import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp, PASSWORD, TestClient, TestData } from './support';

let app: NestFastifyApplication;
let data: TestData;

const signedIn = async () => {
  const user = await data.user('manager');
  const client = new TestClient(app);
  await client.login(user.username);
  return { user, client };
};

beforeAll(async () => {
  app = await createTestApp();
  data = TestData.for(app);
});

afterAll(async () => {
  await data?.cleanup();
  await app?.close();
});

describe('Profile', () => {
  it('xem hồ sơ kèm cửa hàng, không lộ dữ liệu nhạy cảm', async () => {
    const { user, client } = await signedIn();
    const res = await client.call('get', '/profile');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user.id,
      username: user.username,
      phone: user.phone,
      role: 'manager',
      store: { id: await data.store(), code: data.run, name: 'E2E Store' },
    });
    expect(res.body.lastLoginAt).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('failedLoginCount');
  });

  it('yêu cầu đăng nhập và CSRF', async () => {
    expect((await new TestClient(app).call('get', '/profile')).status).toBe(401);
    const { client } = await signedIn();
    const res = await client.call('patch', '/profile', { name: 'Tên Mới' }, { csrf: null });
    expect(res.status).toBe(403);
  });

  it('đổi họ tên, chuẩn hóa khoảng trắng và ghi audit', async () => {
    const { user, client } = await signedIn();
    const res = await client.call('patch', '/profile', { name: '  Nguyễn   Văn  An ' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Nguyễn Văn An');
    expect((await client.call('get', '/auth/me')).body.name).toBe('Nguyễn Văn An');
    const audit = await data.prisma.auditLog.findFirst({ where: { userId: user.id, action: 'PROFILE_UPDATED' } });
    expect(audit?.meta).toEqual({ fields: ['name'] });
  });

  it('đổi số điện thoại phải nhập đúng mật khẩu', async () => {
    const { client } = await signedIn();
    const phone = data.phone(900);

    const missing = await client.call('patch', '/profile', { phone });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('AUTH_PASSWORD_REQUIRED');

    const wrong = await client.call('patch', '/profile', { phone, currentPassword: 'NotMine123' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('AUTH_INVALID_PASSWORD');

    const ok = await client.call('patch', '/profile', { phone: `+84${phone.slice(1)}`, currentPassword: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.phone).toBe(phone);
  });

  it('từ chối số điện thoại sai định dạng hoặc đã có người dùng', async () => {
    const other = await data.user();
    const { client } = await signedIn();

    const invalid = await client.call('patch', '/profile', { phone: '12345', currentPassword: PASSWORD });
    expect(invalid.status).toBe(400);

    const taken = await client.call('patch', '/profile', { phone: other.phone, currentPassword: PASSWORD });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('PHONE_TAKEN');
  });

  it('từ chối body rỗng hoặc trường lạ', async () => {
    const { client } = await signedIn();
    expect((await client.call('patch', '/profile', {})).body.code).toBe('VALIDATION_ERROR');
    expect((await client.call('patch', '/profile', { role: 'admin' })).status).toBe(400);
    expect((await client.call('patch', '/profile', { name: 'A' })).status).toBe(400);
  });
});
