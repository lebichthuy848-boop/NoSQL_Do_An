# Audit Frontend SkillGraph v3.55

Ngày audit: 2026-10-19. Phạm vi: source local trong `NoSQL_Do_An`; không kiểm tra live ArangoDB.

## Đã hoàn thiện và hoạt động

- Local JSONL converter, projection UI và full audit artifact; không sửa dữ liệu nguồn.
- Validation version/count/reference/coverage: 24 collections, 5.718 records, 323/343 Essential direct-topic.
- Repository index theo ID ArangoDB; Careers, Skills, Resources, Providers, ESCO groups và evidence joins.
- Routes catalog, detail pages, pagination/search/filter hiện có, Dark/Light mode và responsive cơ bản.
- Graph bốn chế độ: Career, Skill, Resource và Taxonomy; focused subgraph, search focus, node filters, zoom/pan/fit, minimap, node/edge panel và chuyển focus.
- Career Goal, My Skills, Skill Gap, Learning Path và My Learning dùng Zustand/localStorage, gắn nhãn mô phỏng.
- Statistics dùng dữ liệu thật với Recharts; Data Quality hiển thị release, gaps và giới hạn dữ liệu.
- Unit tests, TypeScript check và production build.

## Đã có giao diện, còn có thể hoàn thiện thêm

- Taxonomy page có membership list; graph taxonomy đã có broader group nhưng breadcrumb đa cấp chưa sâu.
- Resource Detail có evidence scope/limit và metadata lõi; full audit metadata được tách tại `/data/catalog-audit-v355.json` nhưng chưa có drawer lazy-load chuyên sâu.
- Dashboard có số liệu workflow cơ bản; chưa có lịch sử thao tác có timestamp.
- Graph expand hoạt động bằng cách đặt node làm tâm; chưa hỗ trợ mở rộng nhiều tầng đồng thời/collapse từng nhánh.
- Responsive đã có breakpoint; chưa được kiểm tra trên trình duyệt thiết bị thật trong phiên này.

## Chưa triển khai

- Backend Python REST API production và xác thực người dùng (không có trong release).
- Live ArangoDB verification trong frontend.
- Thuật toán cá nhân hóa, đánh giá proficiency, career fit hoặc learning prerequisite (dữ liệu không hỗ trợ).

## Cần tối ưu tiếp

- `App.tsx` vẫn chứa nhiều page component cũ trong một file; nên tách dần theo feature và route lazy loading.
- Main bundle đã giảm từ khoảng 5,17 MB xuống 2,13 MB nhờ tách full audit metadata, nhưng vẫn có cảnh báo trên 500 kB vì catalog projection và thư viện graph/chart.
- Chưa cấu hình ESLint; build TypeScript và Vitest đang PASS.
- Cần browser QA cho routing, touch graph, keyboard flow và console runtime khi có browser automation.
