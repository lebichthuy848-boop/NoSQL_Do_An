# Data version

Frontend sử dụng duy nhất **Skill Graph v3.55 / Sprint 92 — TEAM PREVIEW**, tạo từ các JSONL trong `data-source-v355` bằng `npm run data:generate`.

- 24 collections, 5.718 records
- 12 careers, 420 skills, 149 skill groups
- 504 resources, 179 providers
- Essential direct-topic coverage: 323/343; còn thiếu 20
- Offline validation đã chạy; chưa phải xác minh database live
- Không có prerequisite edge và không có automatic recommendation approval

Fixture frontend v3.49 không được dùng làm nguồn hiển thị trong bản này.
