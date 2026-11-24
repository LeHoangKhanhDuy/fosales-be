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
- Thử API trên Swagger: gọi `POST /auth/login` trước. Sau đó trình duyệt tự gửi cookie, còn Swagger tự đọc cookie `fs_csrf` và gắn header `X-CSRF-Token` cho các request POST/PUT/PATCH/DELETE.

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

## Endpoint Profile (prefix `/api`, cần đăng nhập)

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/profile` | `{ id, username, phone, name, role, storeId, store: { id, code, name }, lastLoginAt, passwordChangedAt, createdAt }` |
| PATCH | `/profile` | `{ name?, phone?, currentPassword? }`. Họ tên 2–100 ký tự (tự gộp khoảng trắng). Đổi SĐT bắt buộc `currentPassword` (SĐT dùng nhận OTP khôi phục), chấp nhận `0xxx`/`+84xxx`, trùng SĐT trả `409 PHONE_TAKEN`. Trả hồ sơ mới, ghi audit `PROFILE_UPDATED` (chỉ lưu tên trường) |

Đổi mật khẩu và quản lý thiết bị vẫn ở `/auth/change-password`, `/auth/sessions`.

## Endpoint Danh mục & Đơn vị tính (prefix `/api`)

Dùng chung cho cả chuỗi. `GET` cho mọi vai trò đã đăng nhập; `POST/PATCH/PUT/DELETE` chỉ `admin`, `manager` (còn lại `403 AUTH_FORBIDDEN`).

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/categories` | `?withCount=true` (mặc định), `?status=active\|inactive`. Sắp `sortOrder`, rồi tên (tiếng Việt) |
| POST | `/categories` | `{ name, description?, icon?, color?, status? }` → 201, `sortOrder = max + 1` |
| PATCH | `/categories/:id` | Sửa một phần |
| PUT | `/categories/order` | `{ ids }` là hoán vị đủ mọi danh mục → 204 (1 câu `UPDATE … unnest`) |
| DELETE | `/categories/:id` | `?moveTo=<id>` khi còn sản phẩm → 204 |
| GET | `/units` | `?withCount=true`. Sắp theo tên (tiếng Việt) |
| POST | `/units` | `{ name, description? }` → 201 |
| PATCH | `/units/:id` | Sửa một phần |
| DELETE | `/units/:id` | `?replaceWith=<id>` khi đang dùng → 204 |

- Tên danh mục 1–50 ký tự, đơn vị 1–20 (tự gộp khoảng trắng); mô tả ≤ 255, chuỗi rỗng lưu `null`.
- Chống trùng tên không phân biệt dấu/hoa thường qua cột `nameKey` (unique): "Đồ uống" trùng "do uong".
- `icon`, `color`, `status` hợp lệ: xem `src/modules/catalog/catalog.constants.ts` (`CATEGORY_ICONS`, `CATEGORY_COLORS`, `CATEGORY_STATUSES`).
- `productCount` đếm sản phẩm chưa xóa bằng `_count` trong cùng truy vấn. Xóa danh mục/đơn vị: sản phẩm đã xóa mềm được chuyển theo `moveTo`/`replaceWith`, hoặc gỡ liên kết (`NULL`) nếu không có.
- Mã lỗi: `CATEGORY_NOT_FOUND`/`UNIT_NOT_FOUND` (404), `*_NAME_TAKEN` và `*_IN_USE` (409, `details.productCount`), `CATEGORY_MOVE_TARGET_INVALID`, `UNIT_REPLACE_TARGET_INVALID`, `CATEGORY_ORDER_INVALID` (400).
- Audit: `CATEGORY_CREATED/UPDATED/DELETED/REORDERED`, `UNIT_CREATED/UPDATED/DELETED`.

## Endpoint Sản phẩm (prefix `/api`)

Danh mục sản phẩm dùng chung toàn chuỗi; tồn kho tách theo cửa hàng (`product_stocks`), mọi API trả `stock` là tồn tại cửa hàng của người đang đăng nhập. `GET` cho mọi vai trò; ghi chỉ `admin`, `manager`. Thu ngân không nhận `costPrice`.

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/products` | `keyword` (không dấu), `categoryId`, `status`, `stock=in-stock\|low\|out`, `sort=newest\|name\|price-desc\|price-asc\|stock-asc`, `page`, `pageSize` (≤100) → `{ items, total, page, pageSize }` |
| GET | `/products/stats` | `categoryId?`, `status?` → `{ total, active, inventoryValue, inventoryUnits, low, out }` |
| GET | `/products/sellable` | Cho POS: đang bán, chưa xóa, danh mục đang hoạt động |
| GET | `/products/options` | `keyword?`, `limit?` (≤200), `ids?` (csv) → bản gọn cho ô chọn sản phẩm |
| GET | `/products/lookup` | `code` = mã vạch hoặc SKU → 404 `PRODUCT_NOT_FOUND` |
| GET | `/products/:id` | |
| POST | `/products` | SKU bỏ trống → tự sinh `SPxxxx` (khóa advisory); `initialStock > 0` → movement `initial` |
| PATCH | `/products/:id` | Sửa một phần; `stock` khác tồn hiện tại → movement `adjust_in/adjust_out` |
| PATCH | `/products/status` | `{ ids (1–200), status }` → `{ updated }` |
| POST | `/products/bulk-delete` | `{ ids (1–200) }` → `{ deleted, withStock }` (xóa mềm) |
| POST | `/uploads/images` | multipart `file` (PNG/JPEG/WebP/GIF ≤ 5MB, kiểm tra magic bytes) → 201 `{ url }`; 30 ảnh/phút/IP |

- Tiền là số nguyên VND. SKU lưu viết hoa; mã vạch 8–14 số, 13 số phải đúng số kiểm tra EAN-13.
- Xóa là xóa mềm (`deletedAt`). SKU/mã vạch chỉ unique trong các sản phẩm chưa xóa nhờ cột `skuKey`/`barcodeKey` (`@unique`, đặt `NULL` khi xóa), nên tạo lại được SKU cũ.
- Mọi thay đổi tồn đi qua `StockLedger.setQuantity` (khóa dòng `FOR UPDATE`, ghi `stock_movements` before/after) trong cùng transaction.
- Danh sách/thống kê dùng một truy vấn SQL (LEFT JOIN tồn của cửa hàng) để lọc tồn và sắp theo tồn; sắp theo tên dùng `search_key` (tên bỏ dấu).
- Mã lỗi: `PRODUCT_NOT_FOUND` (404), `PRODUCT_SKU_TAKEN`/`PRODUCT_BARCODE_TAKEN` (409), `PRODUCT_BARCODE_INVALID`, `PRODUCT_CATEGORY_INVALID`, `PRODUCT_UNIT_INVALID`, `PRODUCT_ORIGINAL_PRICE_INVALID`, `IMAGE_REQUIRED`, `IMAGE_INVALID` (400), `IMAGE_TOO_LARGE` (413).
- Audit: `PRODUCT_CREATED/UPDATED/STATUS_CHANGED/DELETED`, `STOCK_ADJUSTED`, `IMAGE_UPLOADED`.

### Lưu ảnh

Ảnh được xoay theo EXIF, thu về cạnh dài tối đa 800px, chuyển WebP chất lượng 82, bỏ metadata, đặt tên bằng UUID.

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `STORAGE_DRIVER` | `local` | `local` hoặc `s3` |
| `UPLOAD_DIR` | `uploads` | Thư mục lưu khi `local`, phục vụ tại `/api/uploads/files/<tên>` (cache 1 năm, immutable) |
| `S3_ENDPOINT` | | Bỏ trống với AWS; R2/MinIO điền endpoint |
| `S3_REGION` | `auto` | |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | | Bắt buộc khi `s3`; URL trả về là `S3_PUBLIC_URL/products/<tên>` |

Khi dùng S3, frontend cần cho phép domain `S3_PUBLIC_URL` trong `img-src` của CSP. Việc dọn ảnh không gắn vào sản phẩm nào sau 24 giờ chưa làm (cần job định kỳ).

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
| `AUTH_INVALID_PASSWORD` / `AUTH_PASSWORD_REUSED` / `AUTH_PASSWORD_REQUIRED` / `OTP_INVALID` | 400 | Đổi/reset mật khẩu, đổi SĐT |
| `PHONE_TAKEN` | 409 | SĐT đã thuộc tài khoản khác |
| `RATE_LIMITED` | 429 | Vượt giới hạn tần suất |

## Audit log

Bảng `audit_logs` ghi: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_LOCKED`, `LOGOUT`, `LOGOUT_ALL`, `TOKEN_REUSE_DETECTED`, `SESSION_REVOKED`, `PASSWORD_CHANGED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_FAILED`, `PASSWORD_RESET`, `PROFILE_UPDATED`, `CATEGORY_*`, `UNIT_*`, `PRODUCT_*`, `STOCK_ADJUSTED`, `IMAGE_UPLOADED` kèm IP và User-Agent. Không lưu mật khẩu, token hay OTP thô ở bất kỳ đâu; log pino chỉ ghi method/url/status và che các header nhạy cảm.

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
