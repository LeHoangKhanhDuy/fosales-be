# FoSales API

Backend cho hệ thống POS bán lẻ FoSales: NestJS 11 (Fastify) + PostgreSQL + Prisma. Giai đoạn hiện tại gồm khung dự án và module xác thực (Auth) dùng cookie.

## Chạy nhanh (dev)

Yêu cầu: Node.js 22 LTS, Docker.

```bash
npm install
cp .env.example .env            # sửa JWT_SECRET (>= 32 byte)
docker compose up -d            # Postgres 17 (tạo sẵn DB fosales và fosales_test)
npm run prisma:migrate          # lần đầu đặt tên migration là "init" và commit thư mục prisma/migrations
npm run seed
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs` (chỉ bật khi `NODE_ENV` là `development` hoặc `staging`). Ở development, `npm run start:dev` tự mở trang này trên trình duyệt một lần mỗi phiên watch; đặt `OPEN_SWAGGER=false` để tắt
- Healthcheck: `GET /api/health`
- Thử API trên Swagger: gọi `POST /auth/login`, copy `csrfToken` trong response vào nút **Authorize** (mục `csrf`) để gọi các route POST/DELETE khác. Cookie được trình duyệt tự gửi.

Tài khoản seed (mật khẩu `123456`, chỉ dev):

| Username | Tên | Vai trò | SĐT |
|---|---|---|---|
| admin | Khánh Duy | admin | 0909000111 |
| quanly | Quốc Huy | manager | 0909000222 |
| thungan | Minh Thư | cashier | 0909000333 |

Tạo `JWT_SECRET` ngẫu nhiên: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

## Lệnh

| Lệnh | Mô tả |
|---|---|
| `npm run start:dev` | Chạy dev có watch |
| `npm run build` / `npm start` | Build và chạy bản dist |
| `npm run prisma:migrate` | Tạo/áp migration (dev) |
| `npm run prisma:deploy` | Áp migration (production) |
| `npm run seed` | Seed dữ liệu dev (từ chối chạy nếu `NODE_ENV` khác `development`) |
| `npm run test:e2e` | Đẩy schema vào DB `fosales_test` rồi chạy test e2e Auth |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |

## Biến môi trường

Ứng dụng validate env bằng zod lúc khởi động; thiếu hoặc sai biến bắt buộc thì không chạy.

| Biến | Bắt buộc | Ví dụ | Ghi chú |
|---|---|---|---|
| `NODE_ENV` | ✓ | `development` | `development` \| `test` \| `staging` \| `production` |
| `PORT` | | `3000` | |
| `DATABASE_URL` | ✓ | `postgresql://fosales:fosales@localhost:5432/fosales?schema=public` | |
| `JWT_SECRET` | ✓ | | HS256, tối thiểu 32 byte |
| `COOKIE_DOMAIN` | ✓ (được để trống) | | Để trống = host-only cookie của API (khuyến nghị) |
| `CORS_ORIGINS` | ✓ | `https://app.fosales.vn` | Danh sách origin, phân tách bằng dấu phẩy. Dùng cho CORS và kiểm tra `Origin` |
| `ACCESS_TTL` | ✓ | `15m` | Số giây hoặc `s`/`m`/`h`/`d` |
| `REFRESH_TTL_REMEMBER` | ✓ | `30d` | Khi `remember = true` |
| `REFRESH_TTL_SESSION` | ✓ | `12h` | Khi `remember = false` |
| `TRUST_PROXY` | | `false` | `true`, số hop (`1`), hoặc danh sách IP/CIDR của proxy. Đặt đúng để lấy IP thật cho rate-limit và audit |
| `LOG_LEVEL` | | `info` | `fatal`…`trace`, `silent` |
| `OPEN_SWAGGER` | | `true` | Chỉ có tác dụng khi `NODE_ENV=development`: tự mở Swagger khi khởi động |

## Endpoint Auth (prefix `/api`)

| Method | Path | Đăng nhập | CSRF | Ghi chú |
|---|---|---|---|---|
| POST | `/auth/login` | | Origin | `{ username, password, remember }`, `username` nhận cả SĐT. 10 req/phút/IP |
| POST | `/auth/refresh` | | ✓ | Xoay refresh token |
| POST | `/auth/logout` | | ✓ | 204 |
| POST | `/auth/logout-all` | ✓ | ✓ | 204 |
| GET | `/auth/me` | ✓ | | Khôi phục phiên khi F5 |
| GET | `/auth/sessions` | ✓ | | Danh sách thiết bị |
| DELETE | `/auth/sessions/:id` | ✓ | ✓ | 204, thu hồi cả chuỗi token của thiết bị đó |
| POST | `/auth/change-password` | ✓ | ✓ | Trả `{ user, expiresAt, csrfToken }` và cấp phiên mới cho thiết bị hiện tại |
| POST | `/auth/forgot-password` | | Origin | Luôn trả `{ maskedTarget }`. 5 req/15 phút/IP |
| POST | `/auth/reset-password` | | Origin | `{ account, otp, newPassword }`, 204. 5 req/15 phút/IP |

`login`, `refresh`, `change-password` trả `{ user, expiresAt, csrfToken }`; `expiresAt` là thời điểm access token hết hạn. Token không bao giờ nằm trong body.

Guard mặc định bắt buộc đăng nhập cho mọi route; dùng `@Public()` để mở, `@Roles('admin', 'manager')` để giới hạn vai trò, `@CurrentUser()` để lấy `{ id, role, storeId, sid }`.

## Luồng cookie

| Cookie | Nội dung | Thuộc tính |
|---|---|---|
| `fs_at` | Access JWT (HS256, 15 phút, claim `sub role storeId sid iat exp`) | `HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=900` |
| `fs_rt` | Refresh token ngẫu nhiên 256-bit (DB chỉ lưu SHA-256) | `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`; có `Max-Age` khi remember, ngược lại là session cookie |
| `fs_csrf` | CSRF token ngẫu nhiên | Không HttpOnly; `Secure; SameSite=Lax; Path=/` |

`Secure` chỉ được bỏ khi `NODE_ENV=development`.

1. **Đăng nhập**: kiểm tra `Origin` thuộc `CORS_ORIGINS` → tìm user theo username/SĐT → luôn chạy argon2id verify (dùng hash giả nếu không có user) → tạo `Session` (`familyId` mới) → set 3 cookie.
2. **Gọi API**: trình duyệt tự gửi `fs_at`. Guard xác minh JWT rồi tra trạng thái session qua cache 15 giây: từ chối nếu `sid` đã thu hồi/hết hạn, user không còn `active`, hoặc token phát hành trước `passwordChangedAt`.
3. **Access hết hạn (401)**: frontend gọi `POST /auth/refresh` (một lần, có khóa). Server thu hồi refresh token cũ, cấp token mới cùng `familyId`, set lại cả 3 cookie.
4. **Phát hiện dùng lại**: nếu một refresh token đã bị xoay được gửi lại → thu hồi toàn bộ family, ghi `TOKEN_REUSE_DETECTED`, trả `401 AUTH_REFRESH_REUSED`. Hai lần refresh đồng thời bằng cùng token cũng bị coi là dùng lại, nên frontend phải khóa refresh (kể cả giữa các tab, ví dụ bằng `BroadcastChannel` hoặc `navigator.locks`).
5. **Đổi/reset mật khẩu**: cập nhật `passwordChangedAt`, thu hồi mọi session. Đổi mật khẩu cấp ngay phiên mới cho thiết bị đang thao tác; reset mật khẩu thì người dùng đăng nhập lại.

## CSRF

Double-submit cookie: mọi request `POST/PUT/PATCH/DELETE` phải có header `X-CSRF-Token` bằng giá trị cookie `fs_csrf` (so sánh timing-safe), nếu không trả `403 CSRF_INVALID`. Nếu request có header `Origin` không thuộc allowlist và cũng không cùng origin với chính API (so `Origin` với `Host`) thì trả `403 ORIGIN_NOT_ALLOWED`. Nhờ vậy Swagger tại `/api/docs` gọi được API.

`/auth/login`, `/auth/forgot-password`, `/auth/reset-password` miễn CSRF (chưa có cookie) nhưng **bắt buộc** có `Origin` (hoặc `Referer`) nằm trong allowlist.

## Chống dò mật khẩu

- Theo tài khoản: sai 5 lần liên tiếp → khóa 30 giây; mỗi lần khóa tiếp theo gấp đôi (60, 120… tối đa 15 phút). Trả `423 AUTH_ACCOUNT_LOCKED` với `retryAfter` (giây) và header `Retry-After`. Đăng nhập thành công reset bộ đếm.
- Theo IP: `/auth/login` 10 req/phút; `forgot-password` và `reset-password` 5 req/15 phút; các route khác 300 req/phút. Vượt ngưỡng trả `429 RATE_LIMITED` kèm `Retry-After`.
- Rate-limit đang lưu trong bộ nhớ của từng instance. Khi chạy nhiều instance cần chuyển storage của `@nestjs/throttler` sang Redis (và bổ sung service Redis vào `docker-compose.yml`).
- OTP: 6 số, lưu HMAC-SHA256, hết hạn sau 5 phút, tối đa 5 lần nhập, dùng một lần, gửi lại tối thiểu sau 60 giây. Ở dev OTP được in ra log; production cần nối nhà cung cấp SMS trong `SmsService`.

## Định dạng lỗi

```json
{ "statusCode": 401, "code": "AUTH_INVALID_CREDENTIALS", "message": "Tên đăng nhập hoặc mật khẩu không đúng" }
```

| Code | HTTP | Khi nào |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body không hợp lệ (`details` liệt kê từng trường) |
| `AUTH_INVALID_CREDENTIALS` | 401 | Sai tài khoản hoặc mật khẩu (cùng một thông báo) |
| `AUTH_UNAUTHENTICATED` | 401 | Thiếu/hỏng/hết hạn access token → frontend nên gọi refresh |
| `AUTH_SESSION_EXPIRED` | 401 | Phiên đã bị thu hồi/hết hạn → về trang đăng nhập |
| `AUTH_REFRESH_REUSED` | 401 | Phát hiện dùng lại refresh token |
| `AUTH_ACCOUNT_DISABLED` | 403 | Tài khoản `locked`/`disabled` |
| `AUTH_FORBIDDEN` | 403 | Không đủ vai trò |
| `CSRF_INVALID` | 403 | Thiếu/sai CSRF token |
| `ORIGIN_NOT_ALLOWED` | 403 | Origin không thuộc allowlist |
| `SESSION_NOT_FOUND` | 404 | Thu hồi session không tồn tại |
| `AUTH_ACCOUNT_LOCKED` | 423 | Tạm khóa do sai nhiều lần |
| `AUTH_INVALID_PASSWORD` / `AUTH_PASSWORD_REUSED` / `OTP_INVALID` | 400 | Đổi/reset mật khẩu |
| `RATE_LIMITED` | 429 | Vượt giới hạn tần suất |

## Audit log

Bảng `audit_logs` ghi: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_LOCKED`, `LOGOUT`, `LOGOUT_ALL`, `TOKEN_REUSE_DETECTED`, `SESSION_REVOKED`, `PASSWORD_CHANGED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_FAILED`, `PASSWORD_RESET` kèm IP và User-Agent. Không lưu mật khẩu, token hay OTP thô ở bất kỳ đâu; log pino chỉ ghi method/url/status và che các header nhạy cảm.

## Triển khai

- Production: frontend `app.fosales.vn`, API `api.fosales.vn` (cùng site nên `SameSite=Lax/Strict` hoạt động). `COOKIE_DOMAIN` để trống, `CORS_ORIGINS=https://app.fosales.vn`.
- Đặt `TRUST_PROXY` theo hạ tầng (ví dụ `1` nếu sau một reverse proxy/load balancer).
- Docker: `docker build -t fosales-api .` (cần `package-lock.json`). Container chạy bằng user `node`, tự chạy `prisma migrate deploy` trước khi khởi động.
- HSTS chỉ bật khi `NODE_ENV=production`.

## Thay đổi cần làm ở frontend

- `vite.config.ts`: `server.proxy = { '/api': { target: 'http://localhost:3000', changeOrigin: true } }` và giữ `http://localhost:5173` trong `CORS_ORIGINS`.
- `lib/http.ts`: `credentials: 'include'`; thêm header `X-CSRF-Token` (đọc cookie `fs_csrf`) cho request thay đổi dữ liệu; bỏ đọc `fosales_token`; khi nhận `401 AUTH_UNAUTHENTICATED` thì gọi `/auth/refresh` một lần (có khóa) rồi thử lại, refresh lỗi thì chuyển về `/login`.
- `auth.service.ts`: `login` nhận `{ user, expiresAt, csrfToken }`; thêm `me()`.
- `authStore`: chỉ lưu `user`/`expiresAt`; khi mở app gọi `/auth/me` để khôi phục phiên.
# fosales-be
