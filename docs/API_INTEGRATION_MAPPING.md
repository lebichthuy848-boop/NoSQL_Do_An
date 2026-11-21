# Mapping Frontend – Backend Node.js

Bảng này mô tả commit Frontend `68ef12b8ae58d6d43b46195e6cefae6c4be3ec12` sau khi tích hợp với Backend `/api/v1`. Catalog được truy vấn qua Backend; không đọc `src/data/generated/*.json` hoặc `public/data/*.json` làm nguồn runtime.

## User và Catalog công khai

| Trang/route | API Node.js | Hành vi / giới hạn |
|---|---|---|
| `/` | `GET /meta/release`, `GET /statistics/coverage`, các catalog API | Hiển thị số liệu từ DB; lỗi API hiển thị lỗi, không dùng snapshot tĩnh. |
| `/dashboard` | `GET /auth/me`, `GET /me`, `GET /me/progress` | Cần phiên User; trạng thái cá nhân lấy từ `app_profiles`. |
| `/careers`, `/careers/:id` | `GET /careers`, `GET /careers/:id`, `GET /careers/:id/skills` | Hỗ trợ tìm kiếm, phân trang và yêu cầu Essential/Optional. |
| `/skills`, `/skills/:id` | `GET /skills`, `GET /skills/:id`, `GET /skills/:id/resources` | Chi tiết liên quan lấy từ API; không suy diễn mastery. |
| `/skill-taxonomy` | `GET /skill-groups`, `GET /skill-groups/:id/skills` | Nhóm ESCO và thành viên đọc từ graph collections. |
| `/resources`, `/resources/:id` | `GET /resources`, `GET /resources/:id` | Chỉ Catalog chính thức và draft đã đủ điều kiện hiển thị theo Backend. |
| `/providers` | `GET /providers`, tùy trang `GET /providers/:id/resources` | Đọc provider và số lượng tài nguyên từ DB. |
| `/graph` | `GET /graph/neighborhood` | Giữ hướng `_from → _to`; không tạo edge mới ở Client. |
| `/statistics`, `/data-quality` | `GET /statistics/coverage`, `GET /meta/release` | Số liệu coverage là live; Backend chưa có API chẩn đoán chất lượng từng bản ghi. |
| `/career-goal` | `GET /me`, `PUT /me/career-goal` | Thay đổi mục tiêu không xóa danh sách kỹ năng. |
| `/my-skills` | `GET /me/skills`, `POST /me/skills`, `DELETE /me/skills/:skillId` | Là khai báo User, không phải đo lường năng lực. |
| `/skill-gap` | `GET /me/skill-gap` | Tính hiện diện kỹ năng, không khẳng định proficiency. |
| Career Fit | `GET /me/career-fit` | Xếp hạng theo tỷ lệ hiện diện Essential/Optional từ Backend. |
| `/learning-path` | `GET /me/learning-path`, `GET /me/recommendations` | Backend dùng prerequisite đã duyệt và hai recommendation gates. |
| `/my-learning` | `PUT /me/resources/:resourceId/state`, `POST/DELETE /me/completed-resources` | Saved/planned/viewed/note riêng với completed; không tự ghi kỹ năng. |

## Authentication

| Hành động | API | Ghi chú |
|---|---|---|
| Đăng ký | `POST /auth/register` | `{email,password,displayName}`; role luôn là `user`. |
| Đăng nhập / đăng xuất | `POST /auth/login`, `POST /auth/logout` | Backend đặt/xóa cookie `sg_session` HttpOnly. |
| Kiểm tra phiên | `GET /auth/me` | Response là user safe projection trực tiếp; phiên hết hạn trả 401. |
| Hồ sơ tài khoản | PATCH /auth/me | Chỉ cập nhật tên hiển thị; email giữ chỉ đọc do chưa có xác minh thay đổi. |
| Đổi mật khẩu | `POST /auth/change-password` | Cần mật khẩu hiện tại; Backend thu hồi phiên và xóa cookie. |
| Quên / đặt lại | `POST /auth/forgot-password`, `POST /auth/reset-password` | Khi email adapter chưa cấu hình, API trả `503 EMAIL_DELIVERY_NOT_CONFIGURED`. |

Mọi request dùng `credentials: include`. Lỗi có dạng `{error:{code,message}}`. Vite proxy giữ request cùng origin tại `127.0.0.1:5174`.

## Admin

| Khu vực | API | Chính sách |
|---|---|---|
| Dashboard | `GET /admin/statistics`, `GET /admin/audit-log` | Số liệu live; coverage chỉ tính đủ hai gates. |
| User | GET/POST /admin/users, GET/PATCH /admin/users/:id | Search, role/status filters and pagination are server-side; detail is a safe projection; allowed displayName/role/status updates are audited and role/status changes revoke sessions. |
| Nghề, kỹ năng | `GET /careers`, `GET /skills` | Chỉ đọc; Backend không có CRUD catalog lõi. |
| Career–Skill | `GET /careers`, `GET /careers/:id/skills` | Chỉ đọc; không ghi vào `requires_skill`. |
| Học liệu draft | `GET/POST /admin/resources`, `GET/PATCH/DELETE /admin/resources/:id`, `POST .../:id/review` | Chỉ `app_resource_drafts`; phê duyệt cần bằng chứng. |
| Provider draft | `GET/POST /admin/providers`, `GET/PATCH/DELETE /admin/providers/:id`, `POST .../:id/review` | Provider chính thức không bị sửa; draft cần bằng chứng duyệt. |
| Mapping draft | `GET/POST /admin/mappings`, `GET/PATCH/DELETE /admin/mappings/:id`, `POST .../:id/review` | Chỉ `app_mapping_drafts`; duyệt mapping riêng sau resource gate. |
| Prerequisite | Chưa có API list/CRUD Admin | Trang hiển thị rõ chưa hỗ trợ; không dùng snapshot hoặc ghi trực tiếp. |
| Nhật ký / DB | `GET /admin/audit-log`, `GET /admin/database/status` | Chỉ đọc. |
| Backup / Restore | Không có HTTP endpoint | Dùng quy trình CLI offline đã được phê duyệt; UI không giả lập export/restore. |

### Các kiểm tra tương thích quan trọng

- `GET /admin/users` trả array phân trang với header `X-Total-Count`, `X-Page`, `X-Page-Size`; các trường hiện tại từ service gồm `_key`, `display_name`, `created_at`.
- Catalog collection APIs cũng trả array; Client đọc pagination headers.
- Core CRUD nghề/kỹ năng/quan hệ chưa được Backend hỗ trợ, do đó giao diện chỉ đọc.
- Resource/mapping recommendation cần đồng thời `courses.recommendation_eligible === true` và `teaches.auto_recommendation_allowed === true`.
