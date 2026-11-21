# Biên bản nghiệm thu Stage C

> Đây là receipt lịch sử của Stage C, không phải xác nhận các thay đổi UI trong final release. Xem `FINAL_DEMO_READINESS.md` để biết audit, tests, giới hạn và trạng thái bàn giao mới nhất.

Ngày: 21/11/2026
Branch: agent/skill-graph-integration
Commit nền lúc bắt đầu: 68ef12b8ae58d6d43b46195e6cefae6c4be3ec12 (cùng commit với main)
Môi trường ghi dữ liệu: chỉ ArangoDB E2E cô lập skill_graph_v366_acceptance tại loopback 127.0.0.1:39531. Workspace gốc và Database vận hành không được dùng cho các bài test ghi.

## 1. Kết luận

Các luồng User, API tích hợp, thao tác Admin trên draft thuộc app_* và kiểm tra bảo vệ dữ liệu lõi đã chạy. Backup được xác minh và restore trên clone mới. 12 truy vấn AQL read-only đã chạy trong ArangoDB Web Interface.

Không có thay đổi dữ liệu ở 25 collection lõi. Bằng chứng toàn vẹn đạt đầy đủ. Hai phép thử Admin cuối cùng bị bỏ qua trong integration harness chính do DB đang có Admin hoạt động; chúng đã chạy riêng trên database cô lập và đều đạt. Không đánh dấu các cờ SKIPPED trong harness chính là PASS.

Checkout chưa commit/push. Working tree vốn đã có các thay đổi Stage B; danh sách bên dưới chỉ nêu phạm vi Stage C liên quan.

## 2. Chức năng và API

- Auth/phân quyền: User bị từ chối Admin API (403); User không thể tự nâng quyền; thay đổi role/status thu hồi session cũ.
- Tài khoản: Admin chỉnh sửa tên hiển thị và đổi mật khẩu có xác thực lại; phiên cũ bị thu hồi. Email giữ chỉ đọc do chưa có quy trình xác minh email.
- User data: lưu hồ sơ nghề/kỹ năng, trạng thái học liệu và ghi chú theo từng tài khoản. Đổi nghề không xóa kỹ năng sở hữu. User A không đọc được dữ liệu User B. Completed không tự cấp kỹ năng; Viewed không bị coi là Completed.
- Recommendation và learning path: chỉ chọn Resource khi resource.recommendation_eligible == true VÀ mapping.autoRecommendationAllowed == true. Bài test còn kiểm tra prerequisite được duyệt và tình huống không có Resource.
- Admin drafts: Browser E2E đã thực hiện các luồng người dùng, Provider, Resource và Mapping draft, gồm tạo, xem, sửa/tải lại, duyệt/từ chối có bằng chứng, liên kết Resource, xác minh hai approval gates. Đây là thao tác trên app_* drafts, không phải CRUD collection lõi.
- Các trang quản lý nghề, kỹ năng, Career–Skill, prerequisite và Database giữ read-only. Không thêm endpoint ghi vào dữ liệu lõi. Các thao tác chưa được Backend hỗ trợ không được báo thành công giả.
- Nhật ký audit được lưu. Luồng đổi quyền/trạng thái và quản trị được kiểm tra qua API/UI.

## 3. Kiểm thử

| Phạm vi | Kết quả thực tế |
|---|---|
| Backend unit | npm test --prefix backend: 29/29 pass, gồm các kiểm tra atomicity mới |
| Backend build | npm run build --prefix backend: 22 file được kiểm tra, pass |
| API integration | node --env-file=.env.e2e-20261121-runtime tests/integration.mjs trong backend: exit 0; authz/User/Admin, draft gates, career fit, graph privacy, học liệu/learning path và multi-user pass. Mapping trùng create/edit được chặn; hai POST đồng thời cho kết quả 201/409. PASSWORD_CHANGE_TRANSACTION_PASS: session/mật khẩu cũ bị từ chối, đăng nhập mật khẩu mới trả 200. |
| Bảo vệ Admin cuối cùng | Hai cờ trong integration harness chính là SKIPPED_EXISTING_ACTIVE_ADMINS. Bài test riêng trên DB cô lập xác nhận disable Admin cuối, hạ role Admin cuối, bảo vệ khi hai thao tác đồng thời, thu hồi session và cleanup đều pass |
| Frontend unit | npm test: 5/5 file, 12/12 test pass |
| Frontend production build | npm run build: pass, 3.070 module. Vite còn cảnh báo bundle JS khoảng 1.147 kB vượt 500 kB |
| User Browser E2E | Đăng ký/đăng nhập/đăng xuất, giữ session, đổi mật khẩu, từ chối mật khẩu cũ, đăng nhập mật khẩu mới, nghề/kỹ năng, Skill Gap, Career Fit, Recommendation, Learning Path, lưu/trạng thái/ghi chú Resource, phân quyền và cách ly User A/B, privacy của graph: tất cả cờ pass; 0 JS exception, 0 HTTP 5xx, 0 console error. Cleanup: xóa 2 fixture user, 3 session, 2 profile và 9 audit row thuộc fixture |
| Admin Browser E2E | Lượt đầy đủ trước repair đã kiểm danh sách/tìm kiếm/lọc/chi tiết/trạng thái người dùng; Provider, Resource, Mapping; hai gates; responsive 390/768 px và cleanup. Lượt rerun sau repair dừng ở precondition admin-session vì profile E2E không có cookie Admin hợp lệ; không chạy thao tác Admin, cleanup pass. API integration sau repair kiểm các thay đổi Backend. |
| Stage B Browser | Receipt Stage B ghi nhận các luồng User và 13 route Admin; dùng làm bằng chứng nền, không tính là lần chạy Stage C |

Ghi chú hồ sơ Admin: luồng sửa và lưu/tải lại hồ sơ được đánh dấu pass. Cờ phụ adminProfileRestored của harness cuối là false, dù bước độc lập mở lại /admin/account không còn hậu tố Stage C. Vì giá trị khôi phục cuối không được ghi thành bằng chứng đối chiếu chính xác, trạng thái khôi phục về chuỗi ban đầu được xem là chưa kết luận hoàn toàn.

## 4. Toàn vẹn Database

So sánh trước/sau trên E2E cho kết quả coreUnchanged=true:

- 25 collection lõi; tổng 5.990 document/edge; 3.099 edge; 13 edge definition.
- Fingerprint các collection được bảo vệ khớp; không có fingerprint mismatch.
- 0 dangling endpoint, 0 endpoint sai graph definition, 0 self-loop, 0 cặp edge trùng.
- Recommendation gates: 173 Resource đủ điều kiện; 245 mapping được cho phép; 0 mapping được phép trỏ tới Resource không đủ điều kiện; 0 Resource eligible thiếu mapping được phép.

app_* được đánh giá riêng. So với snapshot trước kiểm thử: app_users và app_profiles không đổi; app_sessions tăng 2; app_audit_log tăng 29; password reset và cả ba nhóm draft cuối cùng đều 0. Trạng thái cuối có 1 Admin active và 2 User active, tất cả is_test=false; 5 session (2 Admin còn hạn, 1 Admin đã revoke, 2 User đã revoke), 0 orphan session và 37 audit row. Audit được giữ lại; không xóa session Admin đang hoạt động hoặc tài khoản không thuộc fixture.

Script audit nghiệm thu gốc không bị sửa. Kết quả thô của script không thể PASS khi áp dụng lên E2E/restore vì nó tính các collection app_* ngoài baseline lõi; restore còn tái sinh _rev. Kiểm tra riêng cho thấy nội dung logic source/restore khớp khi bỏ qua duy nhất trường _rev do ArangoDB sinh lại. Đây là khác biệt kiểm toán đã ghi nhận, không phải thay đổi dữ liệu nghiệp vụ.

## 5. Backup và Restore

- Archive backend backup: sgbackup_20261120-213545643-891ab786.tar.gz; 714.455 byte; SHA-256 D16E04F5DC76861524259510AA1789432EE9B8E51F0E4721EBC0E168C736E17B.
- Lệnh verify xác nhận archive hợp lệ, 85 file.
- Restore thoát mã 0 trên container/volume riêng skillgraph-v366-stagec-restore-20261121 (ArangoDB 3.12.11, loopback port 39533). Không restore đè DB nguồn. API trước restore trả 401; sau restore, xác thực và endpoint version trả 200.
- Đối chiếu logic các collection careers, skills, requires_skill khớp source sau khi loại _rev. Script audit gốc giữ nguyên.

## 6. AQL trên ArangoDB Web Interface

Đã chạy trực tiếp 12 truy vấn trong backend/scripts/demo-queries.aql; toàn bộ là read-only. Số dòng theo thứ tự query:

| # | Nội dung | Dòng |
|---|---|---:|
| 1 | Danh sách nghề | 12 |
| 2 | Kỹ năng yêu cầu và quan hệ của nghề chọn | 89 |
| 3 | Coverage Essential theo hai điều kiện đề xuất | 12 |
| 4 | Career Fit theo hiện diện kỹ năng | 12 |
| 5 | Resource cho một kỹ năng, áp dụng đồng thời hai gates | 1 |
| 6 | Prerequisite đã duyệt | 1 |
| 7 | Danh sách kỹ năng | 420 |
| 8 | Tìm kiếm/lọc kỹ năng | 73 |
| 9 | Skill Gap cho nghề chọn với danh sách kỹ năng rỗng | 1 |
| 10 | Learning path/prerequisite chain | 4 |
| 11 | Coverage Overall/Essential/Optional | 12 |
| 12 | Traversal graph công khai nhiều bước, giới hạn 100 dòng | 100 |

Bind variables và hướng dẫn chọn ID nằm trong backend/docs/BACKEND_RUNBOOK.md. Không dùng truy vấn ghi.

## 7. Hạn chế và việc chưa hỗ trợ

- Forgot-password trả 503 EMAIL_DELIVERY_NOT_CONFIGURED vì chưa có dịch vụ gửi email; chưa thể xác minh luồng đặt lại qua email.
- Email tài khoản chỉ đọc đến khi có quy trình xác minh an toàn.
- Backend không cung cấp CRUD cho collection dữ liệu lõi; đây là ranh giới chủ ý để giữ nguyên graph đã nghiệm thu.
- Phép thử xóa theo mọi trạng thái Resource/Provider/Mapping không có bằng chứng riêng cho từng trạng thái trong bộ receipt này; chỉ xem là được hỗ trợ khi API/UI hiện hành cho phép và có kết quả cụ thể.
- Bundle JS lớn hơn ngưỡng Vite 500 kB; code splitting là việc tối ưu thấp, chưa làm trong Stage C.
- Chưa có bằng chứng E2E riêng cho danh sách backup, import/export, API mất kết nối và responsive trên toàn bộ route User; các luồng này không được đánh dấu hoàn tất.
- Kiểm thử xóa theo từng trạng thái của mọi loại draft chưa có ma trận bằng chứng đầy đủ; chỉ xem thao tác nào được hỗ trợ khi API/UI trả kết quả đã kiểm chứng.
- Raw audit đối với restore cần được đọc theo khác biệt app_* và _rev đã nêu, không thay đổi script chuẩn để ép PASS.
- Trong quá trình dùng Aardvark, một form đăng nhập cũ đã đưa credential E2E vào query URL. Theo phê duyệt của người dùng, root password của container E2E và các bản sao được ACL bảo vệ đã được xoay vòng; credential cũ trả 401, credential mới xác thực được. Không có giá trị secret nào được ghi vào báo cáo. Docker container chưa được tạo lại nên metadata môi trường của container có thể còn chứa chuỗi cũ; chuỗi đó không còn xác thực được.

## 8. File thuộc phạm vi Stage C

- backend/src/admin.mjs
- backend/src/user-data.mjs
- backend/src/server.mjs
- backend/src/auth.mjs
- backend/tests/http.test.mjs
- backend/tests/auth-admin.test.mjs
- backend/tests/admin-atomicity.test.mjs
- backend/tests/integration.mjs
- backend/tests/last-admin-isolated.integration.mjs
- backend/scripts/demo-queries.aql
- backend/docs/API_CONTRACT.md
- backend/docs/BACKEND_RUNBOOK.md
- docs/API_INTEGRATION_MAPPING.md
- src/features/auth/AuthProvider.tsx
- src/features/auth/AuthPages.tsx
- src/features/admin/pages/AdminAccountPage.tsx
- src/features/admin/pages/UsersPage.tsx
- docs/STAGE_C_FINAL_VERIFICATION.md

Working tree còn các file Stage B/Integration khác được ghi nhận trong receipt Stage B; không coi toàn bộ trạng thái Git hiện tại là thay đổi mới của Stage C.

## 9. Hướng dẫn chạy và demo

Chỉ chạy trên E2E cô lập, không đổi cấu hình sang Database vận hành.

1. Từ PowerShell, khởi động container E2E đã giữ lại:

~~~powershell
docker start skillgraph-v366-e2e-20261121-db-loopback
~~~

2. Terminal Backend:

~~~powershell
cd C:\Users\tuhaovan\Desktop\do_an\Du_lieu_NoSQL\NoSQL_Do_An_Integration\backend
node --env-file=.env.e2e-20261121-runtime src/server.mjs
~~~

3. Terminal Frontend tại thư mục gốc:

~~~powershell
cd C:\Users\tuhaovan\Desktop\do_an\Du_lieu_NoSQL\NoSQL_Do_An_Integration
npm run dev -- --host 127.0.0.1 --port 5174
~~~

Mở http://127.0.0.1:5174. API health/release: http://127.0.0.1:39530/api/v1/health và /api/v1/meta/release. Aardvark: http://127.0.0.1:39531/_admin/aardvark/index.html; đăng nhập bằng quy trình form bình thường, không đặt credential trong URL. Chạy các query 1–12 trong demo-queries.aql và lấy bind ID từ runbook. Không bật HTTP restore.

Để dừng sau demo: Ctrl+C ở hai terminal rồi docker stop skillgraph-v366-e2e-20261121-db-loopback. Container restore ở port 39533 được giữ riêng và hiện dừng; không xóa volume.

## 10. Trạng thái Git

Branch dùng: agent/skill-graph-integration. Không commit hoặc push. Các tiến trình kiểm thử và container E2E đã được dừng sau khi thu bằng chứng; cả hai container ở trạng thái exited, volume được giữ để có thể mở lại theo hướng dẫn trên.

Kết quả Reviewer độc lập: PASS sau khi đồng bộ số test/build, trạng thái Admin Browser và attribution mapping duplicate vào API integration.
