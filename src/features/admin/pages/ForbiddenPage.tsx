import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
export default function ForbiddenPage() { return <div className="admin-forbidden"><span><ShieldX size={32} /></span><div className="admin-eyebrow">403 · FORBIDDEN</div><h1>Bạn chưa có quyền quản trị</h1><p>Khu vực này chỉ dành cho tài khoản có role Admin.</p><Link className="admin-btn primary" to="/">Quay về trang chủ</Link></div>; }
