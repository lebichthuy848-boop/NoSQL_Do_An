# SkillGraph — hướng dẫn nhanh cho nhóm demo

## Mã nguồn và môi trường

- Workspace: `C:\Users\tuhaovan\Desktop\do_an\Du_lieu_NoSQL\NoSQL_Do_An_Integration`
- Branch bàn giao: `integration/skillgraph-stagec-20261121`
- Frontend: `http://127.0.0.1:5174`
- Backend: `http://127.0.0.1:39530`
- ArangoDB E2E: `127.0.0.1:39531`, database `skill_graph_v366_acceptance` (ArangoDB 3.12.11)
- Không lấy hoặc chia sẻ `.env.e2e-*`; đăng nhập bằng tài khoản E2E được bàn giao trực tiếp, không đưa credential vào URL/ảnh.

## Chạy local

Mở ba terminal từ workspace này. Khởi động DB đã duyệt:

```powershell
docker start skillgraph-v366-e2e-20261121-db-loopback
```

Terminal Backend:

```powershell
cd backend
node --env-file=.env.e2e-20261121-runtime src/server.mjs
```

Terminal Frontend:

```powershell
npm run dev -- --host 127.0.0.1 --port 5174
```

Mở `http://127.0.0.1:5174`. Dừng bằng Ctrl+C ở hai terminal; container E2E có thể dừng bằng `docker stop skillgraph-v366-e2e-20261121-db-loopback`. Không dùng restore, reset hoặc volume khác.

## Luồng demo nổi bật

1. User chọn career goal, khai báo skills, xem Skill Gap/Career Fit.
2. Xem Recommendation và Learning Path; giải thích recommendation chỉ được phép khi cả course và mapping qua gate; prerequisite hiển thị `dependent → foundation` cùng nguồn.
3. Lưu học liệu, đổi trạng thái/ghi chú, reload và xác nhận dữ liệu cá nhân vẫn thuộc đúng User.
4. Admin mở Dashboard, Users, Provider/Resource/Mapping draft, duyệt/từ chối, Audit Log và Database Status.
5. Database page phân nhóm 25 core + 8 `app_*` + 8 system; snapshot integrity là kết quả có thời điểm, không phải health check realtime.

## Tài liệu và bằng chứng

- [Biên bản sẵn sàng demo](FINAL_DEMO_READINESS.md)
- [Audit JSON đầy đủ](evidence/integrity-audit-e2e-2026-11-21.json)
- [Import/Export receipt](evidence/import-export-e2e-2026-11-21.json)
- [Stage C historical receipt](STAGE_C_FINAL_VERIFICATION.md)
- [Integration Runbook](INTEGRATION_RUNBOOK.md)
- AQL: `backend/scripts/demo-queries.aql`; bind variables trong `backend/docs/BACKEND_RUNBOOK.md`.

## Ảnh cần chụp

Chụp các luồng User (goal/skills, gap/fit, recommendation/path, My Learning sau reload), Admin (draft + audit log, database groups/integrity), và từng query AQL trên ArangoDB Web Interface. Query 13 chưa được xác nhận chạy GUI ở release này; Import/Export đã được thử trên một record `app_audit_log` test và cleanup; receipt backup/restore là bằng chứng lịch sử. Không dùng ảnh giả lập hoặc che mất DB đích/thời điểm.

## Giới hạn cần trình bày đúng

- Quyết định release: **READY WITH LIMITATIONS**; Browser E2E bản UI cuối chưa chạy lại.
- Fingerprint source/live khớp theo phương pháp canonical hiện hành; ba fingerprint ghi trong hồ sơ cũ không tái lập được bằng phương pháp này.
- Archive backup lịch sử không có trong workspace hiện tại nên chưa re-hash trong lượt cuối; không có restore mới.
- Forgot-password chưa có cấu hình gửi email; email tài khoản chỉ đọc.
- Catalog lõi chỉ đọc; không nói ứng dụng có CRUD/restore trực tiếp cho dữ liệu lõi.
- Frontend build còn cảnh báo bundle lớn hơn 500 kB.
