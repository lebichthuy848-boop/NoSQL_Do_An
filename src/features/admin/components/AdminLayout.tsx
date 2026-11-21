import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Activity, Bell, BookOpen, BriefcaseBusiness, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Database, FileStack, LayoutDashboard, LogOut, Menu, Network, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import { useAuth, type AuthUser } from '../../auth/AuthProvider';
import { useAdminStore } from '../store/adminStore';

export type AdminGateState = 'loading' | 'retry' | 'login' | 'forbidden' | 'allow';

export function resolveAdminGateState(user: AuthUser | null, loading: boolean, error: string): AdminGateState {
  if (!user && loading) return 'loading';
  if (!user && error) return 'retry';
  if (!user) return 'login';
  return user.role === 'admin' ? 'allow' : 'forbidden';
}

export function AdminGate() {
  const { user, loading, error, refresh } = useAuth();
  const location = useLocation();
  const state = resolveAdminGateState(user, loading, error);
  if (state === 'loading') return <div className="admin-gate-loading" role="status">Đang xác thực quyền quản trị…</div>;
  if (state === 'retry') return <div className="admin-gate-loading" role="alert"><strong>Không xác minh được phiên.</strong><p>{error}</p><button className="admin-btn" onClick={() => void refresh()}>Thử lại</button></div>;
  if (state === 'login') return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (state === 'forbidden') return <Navigate to="/403" replace />;
  return <>{error && <div className="admin-db-sync error" role="status"><span>Không thể xác minh lại phiên Admin; vẫn giữ phiên hiện tại. {error}</span><button onClick={() => void refresh()}><RefreshCw size={14} /> Thử lại</button></div>}<Outlet /></>;
}

const nav = [
  { label: 'Tổng quan', path: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Người dùng', path: '/admin/users', icon: Users },
  { label: 'Nghề nghiệp', path: '/admin/careers', icon: BriefcaseBusiness },
  { label: 'Kỹ năng', path: '/admin/skills', icon: Network },
  { label: 'Nhà cung cấp', path: '/admin/providers', icon: ShieldCheck },
  { label: 'Học liệu', path: '/admin/courses', icon: BookOpen },
  { label: 'Course–Skill', path: '/admin/course-skill-mappings', icon: FileStack },
  { label: 'Career–Skill', path: '/admin/career-skills', icon: BriefcaseBusiness },
  { label: 'Tiên quyết kỹ năng', path: '/admin/skill-prerequisites', icon: Network },
  { label: 'Database', path: '/admin/database', icon: Database },
  { label: 'Nhật ký hoạt động', path: '/admin/logs', icon: Activity },
  { label: 'Thông báo', path: '/admin/notifications', icon: Bell },
  { label: 'Tài khoản Admin', path: '/admin/account', icon: SlidersHorizontal },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const catalogStatus = useAdminStore((s) => s.catalogStatus);
  const catalogFetchedAt = useAdminStore((s) => s.catalogFetchedAt);
  const catalogError = useAdminStore((s) => s.catalogError);
  const loadLiveCatalog = useAdminStore((s) => s.loadLiveCatalog);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const location = useLocation();
  const active = nav.find((item) => location.pathname === item.path) || nav[0];
  useEffect(() => { if (user?.role === 'admin') void loadLiveCatalog(); }, [user?.id, user?.role, loadLiveCatalog]);
  const sidebarClass = `admin-sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`;
  return <div className="admin-shell">
    {mobileOpen && <button className="admin-mobile-scrim" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} />}
    <aside className={sidebarClass}>
      <Link to="/admin/dashboard" className="admin-brand"><span className="admin-brand-mark"><Network size={21} /></span><span>Skill<span>Graph</span><small>ADMIN CONSOLE</small></span></Link>
      <div className="admin-nav-caption">WORKSPACE</div>
      <nav className="admin-nav" aria-label="Điều hướng quản trị">
        {nav.map(({ label, path, icon: Icon }) => <NavLink key={path} to={path} onClick={() => setMobileOpen(false)} className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`} title={collapsed ? label : undefined}><Icon size={18} /><span>{label}</span>{label === 'Thông báo' && <i className="admin-nav-dot" />}</NavLink>)}
      </nav>
      <div className="admin-sidebar-bottom">
        <Link to="/" className="admin-nav-link"><CircleHelp size={18} /><span>Về website</span></Link>
        <div className="admin-sidebar-version"><span className={`admin-status-dot ${catalogStatus}`} /> {catalogStatus === 'live' ? 'Live · ArangoDB' : catalogStatus === 'loading' ? 'Đang tải ArangoDB…' : 'API chưa kết nối'}</div>
        <button className="admin-collapse" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={17} /> : <><ChevronLeft size={17} /> Thu gọn menu</>}</button>
      </div>
    </aside>
    <section className="admin-main">
      <header className="admin-topbar">
        <button className="admin-mobile-menu" aria-label="Mở menu" onClick={() => setMobileOpen(true)}><Menu /></button>
        <div className="admin-breadcrumb"><span>Admin</span><ChevronRight size={15} /><strong>{active.label}</strong></div>
        <label className="admin-global-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm trong bảng hiện tại…" /><kbd>⌘ K</kbd></label>
        <Link to="/admin/notifications" className="admin-top-icon" aria-label="Thông báo"><Bell size={18} /><i /></Link>
        <div className="admin-user-menu"><span className="admin-avatar">{(user?.name || 'A').slice(0, 1).toUpperCase()}</span><span className="admin-user-copy"><strong>{user?.name || 'Admin'}</strong><small>Quản trị viên</small></span><ChevronDown size={15} /><button title="Đăng xuất" onClick={() => void logout()}><LogOut size={16} /></button></div>
      </header>
      <main className="admin-content" data-admin-search={search}>
        <div className={`admin-db-sync ${catalogStatus}`} role="status">{catalogStatus === 'live' ? <><CheckCircle2 size={15} /><span><strong>Dữ liệu mới nhất</strong> · Đọc trực tiếp từ <b>ArangoDB</b>{catalogFetchedAt ? ` · ${new Date(catalogFetchedAt * 1000).toLocaleTimeString('vi-VN')}` : ''}</span><button onClick={() => void loadLiveCatalog()} title="Tải lại từ ArangoDB"><RefreshCw size={14} /> Làm mới</button></> : catalogStatus === 'loading' ? <><RefreshCw className="admin-spin" size={15} /><span>Đang tải dữ liệu mới nhất từ ArangoDB…</span></> : <><span className="admin-sync-warn">!</span><span><strong>Chưa tải được dữ liệu live.</strong> {catalogError || 'Không hiển thị snapshot cục bộ.'}</span><button onClick={() => void loadLiveCatalog()}><RefreshCw size={14} /> Thử lại</button></>}</div>
        <Outlet context={{ search }} /></main>
    </section>
  </div>;
}

export type AdminOutlet = { search: string };
