# SkillGraph — Career & Learning Explorer

Frontend React 19 + TypeScript, backend Python và ArangoDB cho dữ liệu **Skill Graph v3.66**.

## Chạy đầy đủ bằng database dùng chung

Yêu cầu: Node.js, Python 3.10+ và Docker Desktop.

```powershell
PowerShell -ExecutionPolicy Bypass -File .\database\restore.ps1
Copy-Item .\server\auth\.env.example .\server\auth\.env
npm install
```

Sau đó chạy `npm run auth:dev` và `npm run dev` ở hai terminal riêng. Mở `http://localhost:5174`.

Tài khoản Website Admin dùng để test: `admin` / `123456`.

Chi tiết database và các tài khoản local nằm tại [database/README.md](database/README.md).

## Chạy frontend

```bash
npm install
npm run data:generate
npm run dev
```

Build và kiểm thử:

```bash
npm run data:validate
npm test
npm run build
```

## Nguồn dữ liệu

`scripts/generate-catalog.mjs` đọc logical dump v3.66 trong `database/arangodb-dump`, tạo projection cho các trang công khai tại `src/data/generated/catalog-v366.json` và metadata audit tại `public/data/catalog-audit-v366.json`.

Admin và Auth làm việc với ArangoDB thông qua Python API. Các trang công khai dùng catalog v3.66 được sinh từ cùng logical dump để có dữ liệu ngay khi frontend khởi động.

## Phân biệt dữ liệu

- Catalog, taxonomy, graph, coverage và data quality dùng dữ liệu v3.66.
- Career Goal, My Skills, Skill Gap, Learning Path và My Learning là **MÔ PHỎNG**, lưu localStorage.
- `direct_topic` chỉ là liên quan chủ đề; không chứng minh thành thạo hay khuyến nghị được phê duyệt.
- Release có 6 quan hệ `skill_prerequisite`; thuật toán cá nhân hóa vẫn là mô phỏng phía trình duyệt.
- Validator kiểm tra catalog v3.66 được sinh từ logical dump của database live.

Xem thêm [Data version](docs/DATA_VERSION.md) và [API contract đề xuất](docs/PROPOSED_API_CONTRACT.md).

## Đăng ký, đăng nhập, quên mật khẩu

Đã bổ sung module frontend trong src/features/auth và backend Python trong server/auth. Xem hướng dẫn cấu hình ArangoDB, SMTP và cách chạy tại server/auth/README.md. Backend không tự tạo collection/index. Chạy npm run auth:dev ở terminal riêng trước khi dùng các trang xác thực.
