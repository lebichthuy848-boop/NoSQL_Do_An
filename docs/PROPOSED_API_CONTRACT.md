# Proposed API contract

Đây là đề xuất, chưa phải API đang chạy: `GET /api/v1/meta/release`, `/careers`, `/careers/:id`, `/careers/:id/skills`, `/skills`, `/skills/:id`, `/skills/:id/resources`, `/resources`, `/resources/:id`, `/providers`, `/graph/neighborhood`, `/statistics/coverage`.

Frontend chỉ gọi API Python qua `VITE_API_BASE_URL` khi `VITE_DATA_SOURCE=api`; không kết nối trực tiếp ArangoDB.

Response nên dùng JSON UTF-8 và lỗi chuẩn `{ "error": { "code": string, "message": string } }`. Endpoint graph nhận `focusId`, `mode`, `nodeTypes`, `edgeTypes`, `limit`; server phải giữ nguyên chiều `_from → _to` và không tạo prerequisite. Client dự phòng nằm tại `src/repositories/HttpCatalogClient.ts`; local adapter vẫn là mặc định đến khi API contract được duyệt và backend hoạt động.
