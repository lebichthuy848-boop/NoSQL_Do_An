# Database dùng chung cho nhóm

Thư mục này chứa logical dump của `skill_graph_v366_acceptance` từ ArangoDB 3.12.11. Dump gồm 28 collections của đồ án và có thể restore trên máy khác bằng Docker Desktop.

## Khởi tạo nhanh

Mở PowerShell tại thư mục gốc đồ án rồi chạy:

```powershell
PowerShell -ExecutionPolicy Bypass -File .\database\restore.ps1
Copy-Item .\server\auth\.env.example .\server\auth\.env
```

Sau khi restore, mở hai terminal tại thư mục gốc:

```powershell
npm run auth:dev
```

```powershell
npm run dev
```

Website chạy tại `http://localhost:5174`. ArangoDB UI chạy tại `http://localhost:8530`.

## Tài khoản test

- Website Admin: `admin` / `123456`
- ArangoDB root local: `root` / `skillgraph-root-123456`
- Application DB user: `skillgraph_auth` / `skillgraph-auth-123456`

Các mật khẩu trên chỉ dành cho môi trường local của nhóm. Không dùng khi triển khai thật.

## Dữ liệu xác thực trong dump

- `auth_users`: chỉ giữ tài khoản Admin demo; không chứa tài khoản thật của người phát triển.
- `auth_sessions`: giữ cấu trúc và index, không mang session cũ sang máy khác.
- `auth_password_resets`: giữ cấu trúc và index, không mang token reset cũ sang máy khác.

Khi đăng nhập hoặc thử quên mật khẩu, backend sẽ tự tạo document mới trong hai collection tương ứng.

## Dừng database

```powershell
docker compose -f .\database\docker-compose.yml down
```

Lệnh trên dừng container nhưng vẫn giữ volume dữ liệu. Không dùng `down -v` nếu muốn giữ dữ liệu đã test.
