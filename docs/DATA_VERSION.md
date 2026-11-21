# Phiên bản và nguồn dữ liệu

Ứng dụng tích hợp đọc Skill Graph **v3.66 — Coverage 50% Batch 2** qua Backend Node.js `/api/v1`, từ ArangoDB `skill_graph_v366_acceptance`. Frontend không dùng JSON đóng gói làm kết quả Catalog, không fallback sang v3.55/v3.66 snapshot khi API lỗi.

Các số lượng trong `backend/docs/DATABASE_CONNECTION.md` và báo cáo Batch 2 là baseline kiểm chứng của nguồn dữ liệu: 12 careers, 420 skills, 149 skill groups, 510 resources, 183 providers; 5.990 documents/edges; 3.099 edges; 13 edge definitions. Chúng không thay thế kết quả truy vấn live của ứng dụng.

Coverage recommendation chỉ tính resource khi cả `courses.recommendation_eligible === true` và edge `teaches.auto_recommendation_allowed === true`. `viewed`, `completed` và skill self-declaration là trạng thái riêng; không đại diện proficiency. Graph giữ hướng `_from → _to`; prerequisite chỉ lấy từ edge có phê duyệt và chứng cứ theo Backend.

Frontend còn có generated JSON cũ trong repo cho kiểm tra lịch sử, nhưng các route runtime dùng API. File audit JSON trong `public/` đã được gỡ khỏi bản tích hợp để không phục vụ như nguồn tĩnh.
