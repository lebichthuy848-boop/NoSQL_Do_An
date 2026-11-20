# Audit Frontend SkillGraph v3.66

Frontend, Admin API và gói database đã được đồng bộ về release v3.66.

- Catalog công khai được sinh trực tiếp từ `database/arangodb-dump` của release hiện tại.
- Core counts: 12 careers, 420 skills, 149 skill groups, 510 courses, 183 providers.
- Edges: 932 `requires_skill`, 678 `teaches`, 510 `offered_by`, 6 `skill_prerequisite`.
- Validator kiểm tra counts, endpoint mồ côi, coverage và loại trừ collection xác thực khỏi catalog trình duyệt.
- `auth_users`, `auth_sessions`, `auth_password_resets` chỉ được backend truy cập.
- Admin CRUD đọc và ghi trực tiếp database `skill_graph_v366_acceptance`.

Full audit projection được tạo tại `/data/catalog-audit-v366.json` bằng `npm run data:generate`.
