# SkillGraph — bản tích hợp

Bản này chạy Frontend React + TypeScript với Backend Node.js, đọc Skill Graph v3.66 Coverage 50% Batch 2 từ ArangoDB 3.12.11. Backend Python trong `server/auth/` và workflow cũ trong `database/` chỉ được giữ lại ở trạng thái legacy; chúng không phải runtime của ứng dụng tích hợp.

## Yêu cầu

- Windows PowerShell, Node.js 22+, npm và Docker Desktop.
- Backup Batch 2 và thông tin cần thiết để cấp quyền DB phải được cung cấp riêng. GitHub không phải nơi lấy backup hay credential.
- Không dùng database vận hành hoặc đã nghiệm thu để dựng bản demo. Tạo một ArangoDB test mới với volume riêng theo [runbook dựng máy mới](docs/INTEGRATION_RUNBOOK.md).

## Clone và chạy

~~~powershell
git clone --branch integration/skillgraph-stagec-20261121 --single-branch https://github.com/lebichthuy848-boop/NoSQL_Do_An.git
Set-Location .\NoSQL_Do_An
npm ci
~~~

Làm theo runbook để xác minh backup, tạo DB test mới, tạo runtime user có quyền giới hạn và cấu hình `backend/.env`. Không chạy `database/restore.ps1` cũ.

Khởi động Backend trong terminal thứ nhất:

~~~powershell
Set-Location .\backend
npm start
~~~

Kiểm tra API health và số liệu release:

~~~powershell
Invoke-RestMethod http://127.0.0.1:39530/api/v1/health | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:39530/api/v1/meta/release | ConvertTo-Json -Depth 5
~~~

Khởi động Frontend từ terminal thứ hai tại thư mục gốc:

~~~powershell
npm run dev -- --host 127.0.0.1 --port 5174
~~~

Mở `http://127.0.0.1:5174`. Tạo Admin ban đầu và User demo an toàn theo runbook; không dùng mật khẩu mẫu dùng chung.

## Tài nguyên và thông tin nhạy cảm

GitHub chứa source, `package-lock.json`, tests, scripts và hướng dẫn. Backup Batch 2, Docker volumes, `.env`, `.secrets`, mật khẩu DB và mật khẩu tài khoản cục bộ phải được cung cấp hoặc tạo riêng trên từng máy; không đưa chúng vào commit.

Branch này loại bản dump legacy khỏi working tree ở HEAD và thay các giá trị mẫu cũ bằng placeholder. Các commit tổ tiên trên GitHub vẫn giữ artifact/credential legacy trước đó; xem mục bảo mật trong runbook và xử lý rotation riêng. Branch này không xóa hoặc viết lại lịch sử GitHub.

## Kiểm thử

~~~powershell
npm test
npm run build
npm test --prefix backend
npm run build --prefix backend
~~~

Không chạy Backend integration suite hoặc thao tác đăng ký/Admin trên database chính thức hay đã nghiệm thu. Chỉ chạy mutation test trên DB test riêng.

## Giới hạn đã biết

- Quên mật khẩu chưa gửi email và trả `EMAIL_DELIVERY_NOT_CONFIGURED`.
- Catalog nghề, kỹ năng và các edge lõi chỉ đọc; Admin CRUD hiện tập trung vào User và các draft trong `app_*`.
- Lượt Admin Browser E2E đầy đủ chưa được chạy lại sau sửa cuối; một số thao tác hồ sơ/Admin chưa có bằng chứng E2E hoàn chỉnh.
- Chưa dựng lại trên máy sạch trong lượt bàn giao này; kết quả build/test hiện có không thay thế kiểm chứng đó.

## Tài liệu

- [Runbook clone, restore DB test, bootstrap quyền và chạy website](docs/INTEGRATION_RUNBOOK.md)
- [Mapping Frontend–Backend](docs/API_INTEGRATION_MAPPING.md)
- [API contract](backend/docs/API_CONTRACT.md)
- [Stage B verification receipt](docs/E2E_STAGE_B_VERIFICATION_RECEIPT_2026-11-21.md)
- [Stage C final verification](docs/STAGE_C_FINAL_VERIFICATION.md)
- [NoSQL assessment](docs/NOSQL_RUBRIC_ASSESSMENT.md)