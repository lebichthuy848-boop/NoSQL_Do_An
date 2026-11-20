# Data version

Toàn bộ frontend sử dụng **Skill Graph v3.66 — coverage50 batch 2** từ database `skill_graph_v366_acceptance`.

- Nguồn gốc: logical dump trong `database/arangodb-dump`
- 25 collection dữ liệu công khai, 5.990 records
- 12 careers, 420 skills, 149 skill groups
- 510 resources, 183 providers
- 932 quan hệ nghề–kỹ năng, 678 quan hệ học liệu–kỹ năng
- 6 quan hệ tiên quyết kỹ năng
- Essential direct-topic coverage: 305/343; còn thiếu 38
- Dữ liệu xác thực không được đóng vào catalog công khai của frontend

`npm run data:generate` tạo `src/data/generated/catalog-v366.json` trực tiếp từ logical dump. Admin đọc và ghi dữ liệu live qua backend ArangoDB; catalog tĩnh v3.66 là nguồn khởi động cho các trang công khai.
