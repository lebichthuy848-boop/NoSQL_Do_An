import { useAdminStore } from '../store/adminStore';
import { Database, HardDrive, RefreshCw, Server } from 'lucide-react';

export default function DatabasePage() {
  const status = useAdminStore((state) => state.databaseStatus);
  const state = useAdminStore((store) => store.catalogStatus);
  const error = useAdminStore((store) => store.catalogError);
  const load = useAdminStore((store) => store.loadLiveCatalog);
  const live = state === 'live' && status?.status === 'available';
  return <div className="admin-page"><div className="admin-page-heading"><div><div className="admin-eyebrow">DATABASE STATUS</div><h1>Trạng thái Database</h1><p>Thông tin kết nối chỉ đọc do Backend cung cấp. Catalog lõi không thể sửa hoặc export từ giao diện này.</p></div><button className="admin-btn" onClick={() => void load()} disabled={state === 'loading'}><RefreshCw size={15} /> {state === 'loading' ? 'Đang kiểm tra…' : 'Kiểm tra lại'}</button></div>
    {error && <div className="admin-form-error" role="alert">{error}</div>}
    <div className="admin-db-summary"><div><span><Server size={18} /></span><small>Kết nối</small><strong>{live ? 'ArangoDB · sẵn sàng' : state === 'loading' ? 'Đang kiểm tra…' : 'Chưa kết nối'}</strong><i className="admin-db-note">{live ? `Phiên bản ${status.version}` : 'Trạng thái từ API /admin/database/status'}</i></div><div><span><Database size={18} /></span><small>Database</small><strong>{status?.database || '—'}</strong><i className="admin-db-note">Tên database không bao gồm thông tin xác thực</i></div><div><span><HardDrive size={18} /></span><small>Collections</small><strong>{status ? status.collectionCount.toLocaleString('vi-VN') : '—'}</strong><i className="admin-db-note">Backend chỉ trả tổng số collection, không trả toàn bộ bản ghi</i></div></div>
    <section className="admin-panel"><div className="admin-panel-head"><div><h2>Backup và Restore</h2><p>Backend không cung cấp endpoint mạng cho export hoặc restore.</p></div></div><div className="admin-inline-empty"><span><HardDrive size={18} /></span><div><strong>Quy trình offline</strong><small>Dùng quy trình backup/restore đã được phê duyệt trong backend runbook. Không có nút restore trực tiếp để tránh thay đổi database vận hành.</small></div></div></section>
    {status?.checkedAt && <small>Kiểm tra lúc {new Date(status.checkedAt).toLocaleString('vi-VN')}</small>}
  </div>;
}
