# Đánh giá hạng mục NoSQL cho bản tích hợp

Đây là đánh giá đáp ứng kỹ thuật dựa trên API contract và các báo cáo Backend kèm theo. Repository không cung cấp rubric chấm điểm có trọng số, vì vậy tài liệu không tự gán tổng điểm số.

| Hạng mục | Mức đáp ứng trong bản tích hợp | Bằng chứng / giới hạn |
|---|---|---|
| Dữ liệu và provenance Batch 2 | Đạt về đường đọc | Frontend gọi API Node; Backend query ArangoDB. Baseline counts/fingerprints nằm trong `backend/docs/DATABASE_CONNECTION.md`. Runtime DB chưa được mutation-test trong bản tích hợp. |
| Graph model và hướng edge | Đạt theo API | Neighborhood API giữ `_from → _to`; Client không tạo relation. Prerequisite chỉ dùng record được duyệt. |
| AQL/NoSQL business queries | Backend đã có bằng chứng kiểm thử trước | `backend/docs/RUBRIC_CHECKLIST.md` ghi API query, career fit, gaps, recommendation, path; bản tích hợp hiện chạy unit/build tests và chỉ thực hiện live GET nếu DB đang sẵn sàng. |
| Integrity, gates, recommendation | Đạt theo contract | Coverage/recommendation dùng đồng thời hai flags. Không suy kỹ năng từ viewed/completed. |
| CRUD và an toàn lõi | Đạt giới hạn an toàn | User và draft CRUD chạy qua API; official careers/skills/edges chỉ đọc. Backend không có endpoint restore mạng. |
| Multi-user/auth boundaries | Backend có test evidence; UI nối cookie session | Unit suite có thể chạy cô lập. Không chạy đăng ký/Admin CRUD lên operational DB đã nghiệm thu. |
| Import/export/restore | Một phần | CLI backup/verify và restore thử độc lập có báo cáo trước đó; không có restore HTTP. UI không giả lập export/restore. |
| Giao diện/E2E trình duyệt | Chưa chứng nhận E2E | Cần chạy browser flow với DB test riêng và tài khoản thử nghiệm. Live GET smoke không chứng minh đăng ký/login/CRUD E2E. |
| ArangoDB GUI evidence | Đã xác nhận | Biên bản Stage C ghi nhận 12 truy vấn AQL chỉ đọc đã chạy trong ArangoDB Web Interface. |

Trước khi quy đổi sang điểm học phần, cần đối chiếu rubric chính thức có trọng số, thực hiện browser E2E trên môi trường DB test cô lập và bổ sung bằng chứng GUI nếu rubric yêu cầu.
