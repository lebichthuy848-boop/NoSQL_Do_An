# API contract đang sử dụng

Tài liệu đề xuất cũ đã được thay bằng Backend Node.js API v1. Contract có thẩm quyền nằm tại [backend/docs/API_CONTRACT.md](../backend/docs/API_CONTRACT.md); mapping màn hình và các giới hạn tích hợp nằm ở [API_INTEGRATION_MAPPING.md](./API_INTEGRATION_MAPPING.md).

Frontend gọi `/api/v1` qua proxy Vite, dùng cookie session `sg_session` và `credentials: include`. Backend trả lỗi theo `{ "error": { "code": "...", "message": "..." } }`. Core catalog chỉ đọc; Admin draft APIs chỉ thao tác `app_*`.
