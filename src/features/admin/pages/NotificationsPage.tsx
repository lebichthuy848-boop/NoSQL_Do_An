import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, Check, CheckCheck, ExternalLink, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../../api/http';
import { useAdminStore } from '../store/adminStore';

type AdminStatistics = { pendingReview: { resources: number; mappings: number } };
type Notice = { id: string; title: string; detail: string; to: string; icon: typeof Bell; tone: string };
export default function NotificationsPage() {
  const [read, setRead] = useState<string[]>([]);
  const [pending, setPending] = useState<AdminStatistics['pendingReview'] | null>(null);
  const [error, setError] = useState('');
  const catalogStatus = useAdminStore((state) => state.catalogStatus);
  const catalogError = useAdminStore((state) => state.catalogError);
  useEffect(() => {
    apiRequest<AdminStatistics>('/admin/statistics').then((result) => setPending(result.pendingReview)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Không tải được thông báo từ Backend.'));
  }, []);
  const notices: Notice[] = [];
  if (pending && pending.resources + pending.mappings > 0) notices.push({ id: 'review', title: `${pending.resources} học liệu và ${pending.mappings} mapping đang chờ duyệt`, detail: 'Các draft được lưu trong app_*; mỗi quyết định cần URL và tóm tắt chứng cứ.', to: '/admin/courses', icon: Bell, tone: 'blue' });
  if (catalogStatus === 'live') notices.push({ id: 'catalog', title: 'Backend kết nối Database', detail: 'Trạng thái đọc được từ API /admin/database/status.', to: '/admin/database', icon: Info, tone: 'violet' });
  else notices.push({ id: 'catalog', title: catalogStatus === 'loading' ? 'Đang kiểm tra kết nối Backend' : 'Không tải được trạng thái Database', detail: catalogError || 'Chưa nhận được kết quả từ Backend.', to: '/admin/database', icon: AlertTriangle, tone: 'amber' });
  if (error) notices.unshift({ id: 'statistics', title: 'Không tải được hàng chờ duyệt', detail: error, to: '/admin/dashboard', icon: AlertTriangle, tone: 'amber' });
  const markAll = () => setRead(notices.map((notice) => notice.id));
  return <div className="admin-page"><div className="admin-page-heading"><div><div className="admin-eyebrow">ADMIN INBOX</div><h1>Thông báo & cảnh báo</h1><p>Trạng thái được tổng hợp từ các API quản trị đang hỗ trợ.</p></div><button className="admin-btn" onClick={markAll}><CheckCheck size={16} /> Đánh dấu đã xem</button></div><div className="admin-notification-summary"><span><Bell size={17} /> {notices.filter((notice) => !read.includes(notice.id)).length} mục chưa xem</span><span>{notices.length} mục</span></div><div className="admin-notification-list">{notices.map(({ id, title, detail, to, icon: Icon, tone }) => <article className={`admin-notification ${read.includes(id) ? 'read' : ''}`} key={id}><span className={`admin-notification-icon ${tone}`}><Icon size={18} /></span><div className="admin-notification-copy"><strong>{title}</strong><p>{detail}</p><Link to={to}>Mở mục liên quan <ExternalLink size={13} /></Link></div><button className="admin-icon-button" aria-label="Đánh dấu đã xem" onClick={() => setRead((previous) => [...new Set([...previous, id])])}>{read.includes(id) ? <Check size={15} /> : <span className="admin-unread-dot" />}</button></article>)}</div></div>;
}
