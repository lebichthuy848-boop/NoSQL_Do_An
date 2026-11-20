import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
export default function ForbiddenPage() {
  return (
    <section className="container forbidden-page" role="alert">
      <div className="forbidden-card">
        <span className="forbidden-icon" aria-hidden="true"><ShieldX size={28} /></span>
        <div className="eyebrow"><span />403 · FORBIDDEN</div>
        <h1>Bạn chưa có quyền quản trị</h1>
        <p>Khu vực này chỉ dành cho tài khoản Admin. Bạn vẫn có thể tiếp tục khám phá nghề nghiệp và học liệu.</p>
        <div className="forbidden-actions">
          <Link className="btn primary" to="/dashboard">Về trang tổng quan</Link>
          <Link className="btn secondary" to="/">Trang chủ</Link>
        </div>
      </div>
    </section>
  );
}
