import { useState } from 'react';
import { AlertTriangle, Bell, Check, CheckCheck, ExternalLink, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAdminStore } from '../store/adminStore';
export default function NotificationsPage() {
  const [read, setRead] = useState<string[]>([]); const markAll = () => setRead(['prereq', 'catalog', 'review']);
  const catalogStatus = useAdminStore((s) => s.catalogStatus);
  const catalogError = useAdminStore((s) => s.catalogError);
  const notices = [
    { id: 'prereq', kind: 'quality', title: 'Chưa có prerequisite edge trong catalog hiện tại', detail: 'Kiểm tra release trước khi xây dựng learning path dựa trên tiên quyết.', to: '/admin/skill-prerequisites', icon: AlertTriangle, tone: 'amber' },
    catalogStatus === 'live'
      ? { id: 'catalog', kind: 'system', title: 'Catalog đã đồng bộ trực tiếp', detail: 'Admin đang đọc dữ liệu mới nhất từ ArangoDB.', to: '/admin/database', icon: Info, tone: 'violet' }
      : { id: 'catalog', kind: 'quality', title: catalogStatus === 'loading' ? 'Đang tải catalog từ ArangoDB' : 'Chưa đồng bộ được catalog live', detail: catalogError || 'Admin tạm hiển thị snapshot dự phòng; hãy kiểm tra Auth API và quyền đọc database.', to: '/admin/database', icon: AlertTriangle, tone: 'amber' },
  ];
  const pending = useAdminStore((s) => (s.records.courses || []).filter((row) => row.review_status === 'pending' || (!row.review_status && row.recommendation_eligible !== true)).length);
  if (pending) notices.unshift({ id: 'review', kind: 'review', title: `${pending} học liệu được đánh dấu chờ duyệt`, detail: 'Mở từng bản ghi để xem, duyệt hoặc từ chối kèm lý do.', to: '/admin/courses', icon: Bell, tone: 'blue' });
  return <div className="admin-page"><div className="admin-page-heading"><div><div className="admin-eyebrow">ADMIN INBOX</div><h1>Thông báo & cảnh báo</h1><p>Các mục cần chú ý về dữ liệu và luồng quản trị.</p></div><button className="admin-btn" onClick={markAll}><CheckCheck size={16} /> Đánh dấu đã xem</button></div><div className="admin-notification-summary"><span><Bell size={17} /> {notices.filter((n) => !read.includes(n.id)).length} mục chưa xem</span><span>{notices.length} mục tổng cộng</span></div><div className="admin-notification-list">{notices.map(({ id, title, detail, to, icon: Icon, tone }) => <article className={`admin-notification ${read.includes(id) ? 'read' : ''}`} key={id}><span className={`admin-notification-icon ${tone}`}><Icon size={18} /></span><div className="admin-notification-copy"><strong>{title}</strong><p>{detail}</p><Link to={to}>Mở mục liên quan <ExternalLink size={13} /></Link></div><button className="admin-icon-button" aria-label="Đánh dấu đã xem" onClick={() => setRead((prev) => [...new Set([...prev, id])])}>{read.includes(id) ? <Check size={15} /> : <span className="admin-unread-dot" />}</button></article>)}</div></div>;
}
