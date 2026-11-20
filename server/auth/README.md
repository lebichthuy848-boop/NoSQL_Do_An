# Xác thực SkillGraph — React + Python + ArangoDB

## Cấu trúc và trạng thái

- `src/features/auth/`: trang đăng ký, đăng nhập, quên mật khẩu, đặt lại mật khẩu, tài khoản, provider và CSS riêng.
- `server/auth/`: API Python 3.10+, chỉ dùng thư viện chuẩn; không cần cài pip package.
- API dùng ArangoDB thật. Không lưu mật khẩu/token vào localStorage, không dùng tài khoản giả.
- Chưa thay đổi DB của bạn, chưa tạo collection/index, chưa cấu hình SMTP thật. Bạn cần thực hiện các bước bên dưới trước khi sử dụng đầy đủ.
- Catalog và các tính năng lộ trình mô phỏng hiện có vẫn chạy như trước. Dữ liệu mô phỏng trong `userStore` vẫn thuộc trình duyệt, chưa được chuyển thành dữ liệu tài khoản trên server. Các trang này vẫn công khai; trang `/account` yêu cầu đăng nhập.

## 1. Thay đổi ArangoDB thủ công

Chọn database hiện có hoặc tạo database riêng (ví dụ `skillgraph`). Không chạy trong `_system` nếu đó không phải database bạn muốn dùng.

Tạo ba **document collection** sau bằng Web UI:

| Collection | Trường | Index thêm |
| --- | --- | --- |
| `auth_users` | `_key`, `name`, `email`, `passwordHash`, `createdAt`, `passwordChangedAt` (sau reset) | persistent `email`, **unique=true**, sparse=false |
| `auth_sessions` | `_key` = SHA-256 token, `userId`, `createdAt`, `expiresAt` | persistent `userId`; TTL `expiresAt`, expireAfter=0 |
| `auth_password_resets` | `_key` = SHA-256 token, `userId`, `createdAt`, `expiresAt` | persistent `userId`; TTL `expiresAt`, expireAfter=0 |

`createdAt`/`expiresAt` là số giây Unix, không phải mili giây. `_key` có primary index mặc định. API kiểm tra hạn dùng ngay cả khi TTL chưa dọn document. Không thêm tài khoản bằng mật khẩu thô và không dùng trực tiếp tài khoản quản trị ArangoDB làm tài khoản website.

Hoặc tự xem rồi chạy `manual-setup.arangosh.js` bằng arangosh trong đúng database. Đây là script tham khảo chạy thủ công, không nằm trong startup/build/test. Script chỉ tạo collection auth nếu thiếu và các index ở bảng trên; không tạo database hay tài khoản ArangoDB.

Tạo user ArangoDB riêng, ví dụ `skillgraph_auth`, có quyền truy cập database và read/write trên ba collection trên. Điền tài khoản đó trong `.env`. Backend không cần quyền sửa schema. Thiết kế giao dịch ở đây hướng tới ArangoDB single server; với cluster cần đánh giá cấu hình shard và giới hạn unique index/giao dịch nhiều collection trước khi triển khai.

## 2. Cấu hình backend

Tại thư mục project, PowerShell:

```powershell
Copy-Item server/auth/.env.example server/auth/.env
```

Sửa `server/auth/.env`:

```dotenv
APP_ORIGIN=http://localhost:5174
ARANGO_URL=http://127.0.0.1:8529
ARANGO_DATABASE=skillgraph
ARANGO_USERNAME=skillgraph_auth
ARANGO_PASSWORD=mat-khau-user-arango
MAIL_MODE=console
```

`MAIL_MODE=console` dành riêng cho thử nghiệm local: đường dẫn reset được in ở terminal chạy API, không gửi email. Mở đường dẫn đó cùng trình duyệt chạy frontend. Không dùng chế độ này trên môi trường thật.

Gửi email thật: đặt `MAIL_MODE=smtp`, điền `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`. Dùng `SMTP_SECURITY=starttls` với cổng 587, hoặc `ssl` với cổng 465 theo nhà cung cấp. Với Gmail cần mật khẩu ứng dụng nếu tài khoản hỗ trợ; không dùng mật khẩu đăng nhập Gmail thường. Khi SMTP lỗi, API vẫn trả thông báo chung để tránh lộ email đã đăng ký; terminal ghi lỗi cấu hình, token gửi thất bại bị xóa.

Không commit `.env`; `.gitignore` hiện có đã loại trừ file này. Không đưa bí mật vào biến `VITE_*` vì frontend sẽ công khai chúng.

## 3. Chạy ứng dụng

Terminal 1, từ project:

```powershell
npm run auth:dev
```

Terminal 2:

```powershell
npm run dev
```

Mở **http://localhost:5174**. Vite chuyển `/api/auth` đến `http://127.0.0.1:8001`. Vite cố định cổng 5174; nếu cổng bận cần tắt tiến trình cũ hoặc sửa đồng thời `APP_ORIGIN` và Vite config. Không dùng `127.0.0.1:5174` khi APP_ORIGIN đang đặt `localhost:5174`.

Các trang: `/register`, `/login`, `/forgot-password`, `/reset-password#token=...`, `/account`. Header có nút Đăng nhập/Tài khoản của tôi.

## API

| Method | Đường dẫn | JSON request |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ "name": "Nguyễn An", "email": "an@example.com", "password": "MatKhau12345" }` |
| POST | `/api/auth/login` | `{ "email": "an@example.com", "password": "MatKhau12345" }` |
| GET | `/api/auth/me` | Không có body; đọc cookie |
| GET | `/api/auth/admin/catalog` | Read-only catalog live (chỉ role `admin`) |
| GET | `/api/auth/admin/users` | Danh sách hồ sơ tài khoản cơ bản (chỉ role `admin`) |
| POST | `/api/auth/admin/users` | Tạo tài khoản, đổi role, khóa/mở khóa, gửi email reset hoặc xóa (chỉ role `admin`) |
| POST | `/api/auth/admin/records` | Tạo/sửa/xóa bản ghi và duyệt khóa học (chỉ role `admin`) |
| GET | `/api/auth/admin/export` | Export collections dữ liệu ứng dụng, bỏ các collection xác thực (chỉ role `admin`) |
| POST | `/api/auth/admin/account` | Cập nhật tên hồ sơ Admin hiện tại (chỉ role `admin`) |
| POST | `/api/auth/logout` | `{}` |
| POST | `/api/auth/forgot-password` | `{ "email": "an@example.com" }` |
| POST | `/api/auth/reset-password` | `{ "token": "...", "password": "MatKhauMoi12345" }` |

POST yêu cầu `Content-Type: application/json`, `X-SkillGraph-Client: web` và `Origin` khớp `APP_ORIGIN`. Frontend tự thêm các giá trị này. Không bật CORS rộng. Khi thử bằng Postman/curl cần tự đặt Origin/header và giữ cookie.

Admin gọi `/api/auth/admin/catalog` để đọc các collection `careers`, `skills`, `providers`, `courses`, `teaches`, `offered_by`, `requires_skill` và `skill_prerequisite` (fallback `prerequisite`). Các thao tác ghi được xác thực ở backend và lưu trực tiếp vào ArangoDB. Export chỉ gồm các collection ứng dụng nằm trong allowlist, không xuất `auth_users`, `auth_sessions` hay `auth_password_resets`.

Danh sách tài khoản dùng `/api/auth/admin/users`; API chỉ trả ID, tên, email, username, role, ngày tạo và trạng thái, tuyệt đối không trả `passwordHash` hoặc token.

Mật khẩu 10–128 ký tự, có chữ hoa ASCII, chữ thường ASCII và số. Email trim + lowercase và unique trong DB. Đăng ký xong chuyển sang đăng nhập, không mặc định tự xác minh quyền sở hữu email. Chức năng xác minh email chưa thuộc phần đăng ký hiện tại.

Session ngẫu nhiên có hạn 7 ngày; cookie HttpOnly, SameSite=Lax; DB chỉ lưu hash. Reset link ngẫu nhiên có hạn 15 phút; DB chỉ lưu hash. Token trong fragment URL được xóa khỏi thanh địa chỉ sau khi trang đọc; nếu tải lại trang reset sau đó cần mở lại liên kết email. Reset thành công hủy mọi token reset và session của tài khoản trong cùng stream transaction. Mật khẩu dùng scrypt với salt riêng. Giới hạn yêu cầu theo IP và email ở bộ nhớ tiến trình; khởi động lại sẽ làm mới bộ đếm.

## Kiểm tra

```powershell
npm run auth:test
npm test
npm run build
```

Auth tests dùng DB adapter giả có rollback trong bộ nhớ, không truy cập hay thay đổi DB thật. Kiểm thử bao phủ luồng API, cookie, CSRF, đăng ký trùng, mật khẩu sai, reset hết hạn/dùng lại, hủy phiên và lỗi DB. Các test này không xác minh AQL với ArangoDB thật hay gửi SMTP thật.

Sau khi bạn cấu hình DB: đăng ký → kiểm tra document có `passwordHash` → đăng nhập → tải lại `/account` → quên mật khẩu → mở link từ terminal/mail → đặt mật khẩu mới → thử mật khẩu cũ và token cũ phải thất bại → đăng nhập mật khẩu mới → đăng xuất. Thử gửi lại reset và đặt lại mật khẩu ở trình duyệt thứ hai để xác minh phiên cũ bị thu hồi.

## Khi đưa lên server

Chạy backend bằng Python và phục vụ `dist` qua web server có SPA fallback về `index.html`. Reverse proxy `/api/auth/*` sang backend; **vite preview không phải cấu hình triển khai API**. Đặt `APP_ORIGIN` là origin HTTPS thực, `AUTH_COOKIE_SECURE=true`, `MAIL_MODE=smtp`. Backend mặc định chỉ bind loopback. Cấu hình TLS tới ArangoDB khi DB không chạy cùng máy. Giữ Python và ArangoDB trong môi trường quản lý tiến trình phù hợp.

Rate limit hiện tại dành cho một tiến trình; khi có nhiều instance cần bộ đếm chung ở gateway/Redis. Nếu reverse proxy, giới hạn theo IP ở gateway vì backend chỉ thấy IP proxy; API không tin header X-Forwarded-For do client tự gửi.

Tài liệu API ArangoDB tham chiếu: [Stream Transactions](https://docs.arango.ai/arangodb/stable/develop/http-api/transactions/stream-transactions/) và [persistent indexes](https://docs.arango.ai/arangodb/stable/develop/http-api/indexes/persistent/).
