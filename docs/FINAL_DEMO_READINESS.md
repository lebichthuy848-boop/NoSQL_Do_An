# SkillGraph — biên bản sẵn sàng demo cuối

Ngày: 21/11/2026

Branch: `integration/skillgraph-stagec-20261121`
Database kiểm chứng: `skill_graph_v366_acceptance` trên ArangoDB 3.12.11, loopback `127.0.0.1:39531`.

## Task / verification contract

- **Mục tiêu:** hoàn thiện các thiếu sót ảnh hưởng demo, kiểm tra read-only core integrity, gom bằng chứng và bàn giao trên đúng branch được chỉ định.
- **Phạm vi:** prerequisite read API/UI, Database Status, xác nhận hành động UI, sửa tên hiển thị User, kiểm thử, tài liệu và bằng chứng E2E.
- **Ngoài phạm vi:** sửa dữ liệu/edges lõi, đổi recommendation gates hoặc thuật toán learning path, restore dữ liệu, chỉnh workspace gốc, merge/force-push/deploy.
- **Bất biến:** core catalog chỉ đọc; recommendation yêu cầu đồng thời `courses.recommendation_eligible === true` và `teaches.auto_recommendation_allowed === true`; thao tác thử chỉ nhắm DB/collection `app_*` của E2E cô lập.
- **Tiêu chí:** toàn bộ kiểm tra tự động đã chạy đạt; audit đối chiếu source với DB đích; không đưa credential/backup vào Git; trạng thái GUI/browser chưa chạy phải ghi rõ.
- **Rủi ro:** cao ở provenance và bảo vệ dữ liệu. Cách giảm thiểu: runtime principal E2E, kiểm tra target trong script, không dùng restore, xác nhận các thao tác đọc/ghi và cleanup.

## Kết luận

**READY WITH LIMITATIONS.** Không có P0/P1 về core integrity hoặc phân quyền trong các kiểm tra đã chạy. Có thể demo User/Admin và trình bày kết quả audit. Cần ghi rõ Browser E2E của bản UI cuối chưa được chạy lại; ảnh AQL/website chưa được chụp trong lượt này; archive backup cũ không còn tại workspace để re-hash; và ba fingerprint ghi trong hồ sơ cũ không tái tạo được bằng canonicalization hiện tại. Các giới hạn này không được trình bày như PASS mới.

## Đối chiếu rubric NoSQL

| Tiêu chí | Kết quả hiện tại | Bằng chứng / giới hạn |
|---|---|---|
| ArangoDB, graph model, core collections | PASS | 25 core collections, 5,990 documents/edges, 3,099 edges, 13 graph edge definitions; danh sách và số lượng so khớp source dump Batch 2. |
| Database integrity và graph constraints | PASS | 0 thiếu/thừa collection; 0 count/content mismatch; 0 dangling endpoint, endpoint sai graph definition, self-loop hoặc edge pair trùng. Chi tiết trong [audit JSON](evidence/integrity-audit-e2e-2026-11-21.json). |
| Recommendation gates | PASS | 173 eligible courses, 245 mappings được phép; 0 mapping vi phạm gate, 0 eligible course thiếu mapping được phép. |
| Career, skill, requirement, course, provider, mapping | PASS | 12 careers, 420 skills, 932 `requires_skill`, 510 courses, 183 providers, 678 `teaches`. |
| Coverage | PASS | Overall 227/420; Essential 143/221; Optional 136/267. |
| Prerequisite có chứng cứ | PASS | 6 cạnh đã duyệt, lọc `is_demo !== true`, hướng `dependent → foundation`, tên kỹ năng và nguồn chứng cứ được trả qua Admin read-only API. |
| AQL cơ bản/nâng cao | PASS WITH LIMITS | Stage C receipt ghi nhận 12 truy vấn read-only chạy trực tiếp trong Web Interface. Query 13 hiện có trong file nhưng không được xác nhận chạy GUI trong lượt này; không có ảnh mới. API integration và integrity audit đã kiểm tra các logic liên quan. |
| Kết nối ứng dụng đến ArangoDB | PASS | Backend integration chạy bằng runtime principal giới hạn trên ArangoDB 3.12.11; endpoint database status phân loại 25 core + 8 `app_*` + 8 system = 41. |
| Import/Export | PASS | Một record test được import bằng ArangoDB `/_api/import` vào `app_audit_log`, export bằng AQL cursor, field khớp, SHA-256 `5c30d38fe4d060df1188630291529ff62da8b5611f15bd67efba11f391a73e14`, cleanup thành công. Không ghi collection lõi; receipt: [Import/Export JSON](evidence/import-export-e2e-2026-11-21.json). |
| Backup/Restore | HISTORICAL PASS; NOT REVERIFIED | Stage C receipt ghi archive SHA-256 `D16E04F5DC76861524259510AA1789432EE9B8E51F0E4721EBC0E168C736E17B`, verify 85 file và restore vào clone riêng thành công. Archive không có trong workspace hiện tại nên lượt này không thể re-hash. Không chạy restore mới hoặc restore đè. Backend-generated archive chưa được restore riêng. |
| Phân quyền và bảo vệ Admin cuối | PASS | Backend unit/integration pass; bài kiểm tra Admin cuối chạy riêng trên DB cô lập và cleanup pass. Integration harness chính bỏ qua nhánh đó vì đã tồn tại Admin hoạt động, nên trạng thái skip không được gọi là pass; kết quả riêng có trong receipt kiểm thử. |
| Frontend / Backend build và tests | PASS | Kết quả cuối bên dưới. Bundle Frontend vẫn có cảnh báo chunk lớn hơn 500 kB (P3). |
| Browser E2E bản cuối | NOT RUN | Không có browser automation khả dụng cho lượt này. Stage C receipt là bằng chứng lịch sử cho các lượt trước, không xác nhận UI mới trong release này. |

## Integrity và provenance

Audit cuối chạy lúc `2026-11-21T04:39:47.636Z` (11:39 giờ Việt Nam), bằng `backend/scripts/audit-e2e-integrity.mjs`, sau Import/Export và cleanup. Script từ chối chạy nếu URL, database hoặc runtime principal không đúng E2E đã chỉ định; nó chỉ đọc, đối chiếu toàn bộ 25 core collections với `database/arangodb-dump`, bỏ `_rev` do ArangoDB sinh lại khi tính canonical SHA-256, kiểm graph endpoints, coverage, prerequisite evidence và hai recommendation gates.

Ba hash được lưu trong `backend/docs/DATABASE_CONNECTION.md` **không khớp** với canonical hash của script mới: `careers` stored `93a4…4e58`, source/live `ef9d…2f20`; `skills` stored `c3b5…9288`, source/live `18e5…6194`; `requires_skill` stored `7020…9e26`, source/live `cc43…670a`. Cả 25 collection có nội dung source/live khớp dưới cùng một phương pháp chuẩn hóa, nhưng phương pháp tạo fingerprint lịch sử không có trong repository để tái tạo. Không sửa hash cũ hoặc đổi script để ép PASS. Xem đầy đủ hash trong audit JSON.

41 collection không phải lỗi: audit hiện thấy **25 core + 8 `app_*` + 8 system**. App collections chứa dữ liệu ứng dụng; chúng không thuộc baseline core.

## Files đã thay đổi

- Backend: `backend/src/admin.mjs`, `backend/src/server.mjs`; API contract; `backend/tests/http.test.mjs`, `backend/tests/integration.mjs`, test read-only mới; hai script audit và Import/Export.
- Frontend: trang prerequisite/database, kiểu/store admin, dialog xác nhận dùng chung, trang Admin draft, trang My Learning, User account, CSS và audit snapshot có nhãn thời gian.
- Tài liệu: biên bản này, handoff, rubric/runbooks và audit JSON đã lọc. Không đưa env, credential, backup hay volume vào commit.

## Kiểm thử đã chạy

| Lệnh / hành động | Kết quả |
|---|---|
| `npm test --prefix backend` | PASS, 32/32 tests. |
| `npm run build --prefix backend` | PASS, 23 source files. |
| `npm test -- --configLoader runner` | PASS, 7 files / 28 tests. |
| `npm run build -- --configLoader runner` | PASS, TypeScript + Vite, 3,074 modules; cảnh báo bundle 1,164.72 kB. |
| `node --env-file=backend/.env.e2e-20261121-runtime backend/tests/integration.mjs` | PASS, real-DB API integration; last-admin branch trong harness chính được skip do precondition có Admin hoạt động. |
| `STAGE_C_RUN_ISOLATED_ADMIN_TEST=YES` + bootstrap env cục bộ, chạy `backend/tests/last-admin-isolated.integration.mjs` | PASS riêng: disable/demotion cuối, concurrency, revoke session và cleanup. Không ghi credential vào log. |
| `node --env-file=backend/.env.e2e-20261121-runtime backend/scripts/import-export-e2e-test.mjs` | PASS: import 1, export 1, fields/SHA khớp, cleanup `PASS_AND_CLEANED`; [receipt](evidence/import-export-e2e-2026-11-21.json). |
| `node --env-file=backend/.env.e2e-20261121-runtime backend/scripts/audit-e2e-integrity.mjs` | PASS sau Import/Export; báo cáo lưu trong `docs/evidence/integrity-audit-e2e-2026-11-21.json`. |

Các lệnh Node cần đọc file runtime ACL-protected; file chỉ được đọc cục bộ và không in nội dung. Không chạy GUI/browser test hoặc cài thêm browser dependency.

## Giới hạn và lỗi còn lại

| Mức | Tình trạng |
|---|---|
| P0 | Không phát hiện trong phạm vi kiểm tra. |
| P1 | Không phát hiện lỗi integrity/gate hoặc quyền ghi vào core. Browser E2E toàn luồng bản cuối chưa chạy nên đây vẫn là giới hạn xác nhận demo, không phải lỗi đã chứng minh. |
| P2 | Fingerprint lịch sử không tái lập được do thiếu phương pháp gốc; archive backup lịch sử vắng mặt nên chưa re-hash; Query 13 chưa có ảnh GUI. Forgot-password vẫn cần email adapter. |
| P3 | Bundle Frontend 1,164.72 kB vượt cảnh báo 500 kB; chưa tối ưu vì không ảnh hưởng chức năng demo được kiểm tra. |

## Mở demo User/Admin

Đọc hướng dẫn đầy đủ tại [DEMO_HANDOFF_FOR_TEAM.md](DEMO_HANDOFF_FOR_TEAM.md) và [Integration Runbook](INTEGRATION_RUNBOOK.md). Demo dùng frontend `http://127.0.0.1:5174`, backend `http://127.0.0.1:39530`, ArangoDB loopback `http://127.0.0.1:39531`; chỉ dùng tài khoản cục bộ E2E. Không đưa credential vào URL, ảnh chụp hoặc báo cáo.

## Ảnh/minh chứng cần giao nhóm Word/PowerPoint

Trong lượt release này không có ảnh GUI/browser mới. Nhóm cần chụp trên môi trường demo đã xác minh: (1) User Career Goal/Skills và Skill Gap/Career Fit, (2) Recommendation/Learning Path thể hiện hai gate và prerequisite, (3) My Learning lưu trạng thái/ghi chú sau reload, (4) Admin draft approve/reject và Audit Log, (5) Database Status với 25/8/8 và audit snapshot được ghi rõ mốc giờ, (6) ArangoDB Web Interface Query 1–12 và Query 13 kèm kết quả, (7) màn hình Import/Export với record test đã cleanup. Ảnh backup/restore phải dùng receipt/archive thật; không tạo ảnh minh chứng thay cho thao tác.

## Git / phê duyệt reviewer

Default branch đã xác minh là `main`; làm trên branch được yêu cầu `integration/skillgraph-stagec-20261121`, không merge. Reviewer độc lập: **PASS**, không có finding blocker/high; góp ý MEDIUM về hiển thị giới hạn fingerprint đã được bổ sung trực tiếp dưới snapshot. Commit SHA sẽ được trả trong thông báo bàn giao.
