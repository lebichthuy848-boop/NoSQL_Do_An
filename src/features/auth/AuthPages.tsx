import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Network, ShieldCheck } from 'lucide-react';
import { authRequest, useAuth } from './AuthProvider';
import './auth.css';
import './auth-motion.css';

function Frame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className="auth-layout">
    <aside className="auth-story"><div className="auth-sparkles" aria-hidden="true"><i /><i /><i /><i /><i /></div><Link to="/" className="auth-logo"><Network size={30} /><span>Skill<em>Graph</em></span></Link>
      <span className="auth-kicker">HỌC TẬP CÓ ĐỊNH HƯỚNG</span>
      <h1>Kết nối kỹ năng.<br /><span>Mở lối tương lai.</span></h1>
      <p>Khám phá nghề nghiệp, tìm hiểu kỹ năng và xây dựng lộ trình học tập của bạn.</p>
      <div className="auth-orbit" aria-hidden="true"><Network size={100} /><span className="auth-node auth-node-career">Nghề nghiệp</span><span className="auth-node auth-node-skill">Kỹ năng</span><span className="auth-node auth-node-resource">Học liệu</span></div>
      <div className="auth-trust"><ShieldCheck size={20} /> Một tài khoản, nhiều cơ hội khám phá.</div>
    </aside>
    <div className="auth-card"><span className="auth-card-icon"><LockKeyhole /></span>
      <h2>{title}</h2><p className="auth-subtitle">{subtitle}</p>{children}
      <Link className="auth-home" to="/">← Về trang chủ</Link>
    </div>
  </section>;
}

function Password({ label = 'Mật khẩu', name = 'password', newPassword = false }: { label?: string; name?: string; newPassword?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <label className="auth-field">{label}<span className="auth-password">
    <input name={name} type={visible ? 'text' : 'password'} required minLength={newPassword ? 10 : 1} maxLength={128}
      autoComplete={newPassword ? 'new-password' : 'current-password'} placeholder={newPassword ? 'Ít nhất 10 ký tự' : 'Nhập mật khẩu của bạn'} />
    <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible}>
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>;
}

function Notice({ error, success }: { error: string; success?: string }) {
  return <>{error && <div className="auth-notice auth-error" role="alert">{error}</div>}
    {success && <div className="auth-notice auth-success" role="status">{success}</div>}</>;
}
function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <button className="auth-submit" disabled={busy} type="submit">{busy ? 'Đang xử lý…' : children}{!busy && <ArrowRight size={18} />}</button>;
}
const value = (data: FormData, key: string) => String(data.get(key) || '');
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
export function safeReturnPath(path: unknown) {
  return typeof path === 'string' && /^\/(?!\/)/.test(path) && !/[\\\r\n]/.test(path) && !/^\/(login|register|forgot-password|reset-password)(\/|\?|$)/.test(path) ? path : '/account';
}
export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 10 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
    throw new Error('Mật khẩu cần 10–128 ký tự, gồm chữ hoa, chữ thường và số.');
  if (password !== confirmation) throw new Error('Mật khẩu xác nhận chưa khớp.');
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate(), location = useLocation();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const target = safeReturnPath(location.state?.from);
  if (user) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : target} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const loggedInUser = await login(value(data, 'email'), value(data, 'password'));
      const destination = loggedInUser.role === 'admin'
        ? target.startsWith('/admin') ? target : '/admin/dashboard'
        : target;
      navigate(destination, { replace: true });
    }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Frame title="Chào mừng trở lại" subtitle="Đăng nhập để tiếp tục khám phá cùng SkillGraph.">
    <Notice error={error} success={location.state?.registered ? 'Đăng ký thành công! Hãy đăng nhập tài khoản mới.' : undefined} />
    <form onSubmit={submit} className="auth-form"><fieldset disabled={busy}>
      <label className="auth-field">Tên đăng nhập hoặc email<input type="text" name="email" autoComplete="username" required maxLength={254} placeholder="admin hoặc ban@example.com" /></label>
      <Password /><Link className="auth-forgot" to="/forgot-password">Quên mật khẩu?</Link>
      <Submit busy={busy}>Đăng nhập</Submit></fieldset></form>
    <p className="auth-switch">Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link></p>
  </Frame>;
}

export function RegisterPage() {
  const { user } = useAuth(); const navigate = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (user) return <Navigate to="/account" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setError('');
    try {
      validateNewPassword(value(data, 'password'), value(data, 'confirmation')); setBusy(true);
      await authRequest('register', { name: value(data, 'name').trim(), email: value(data, 'email'), password: value(data, 'password') });
      navigate('/login', { replace: true, state: { registered: true } });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Frame title="Tạo tài khoản mới" subtitle="Bắt đầu hành trình khám phá nghề nghiệp của bạn.">
    <Notice error={error} /><form onSubmit={submit} className="auth-form"><fieldset disabled={busy}>
      <label className="auth-field">Họ và tên<input name="name" required minLength={2} maxLength={80} autoComplete="name" placeholder="Nguyễn Văn An" /></label>
      <label className="auth-field">Email<input type="email" name="email" required maxLength={254} autoComplete="email" placeholder="ban@example.com" /></label>
      <Password newPassword /><p className="auth-hint">10–128 ký tự, gồm chữ hoa, chữ thường và số.</p>
      <Password name="confirmation" label="Xác nhận mật khẩu" newPassword />
      <Submit busy={busy}>Tạo tài khoản</Submit></fieldset></form>
    <p className="auth-switch">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
  </Frame>;
}

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(''); setSuccess('');
    try { const result = await authRequest<{ message: string }>('forgot-password', { email: value(data, 'email') }); setSuccess(result.message); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Frame title="Quên mật khẩu?" subtitle="Nhập email đăng ký. Chúng tôi sẽ gửi liên kết để bạn tạo mật khẩu mới.">
    <Notice error={error} success={success} /><form onSubmit={submit} className="auth-form"><fieldset disabled={busy}>
      <label className="auth-field">Email đăng ký<input type="email" name="email" autoComplete="email" required maxLength={254} placeholder="ban@example.com" /></label>
      <Submit busy={busy}>Gửi liên kết đặt lại</Submit></fieldset></form>
    <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
  </Frame>;
}

export function ResetPasswordPage() {
  // Fragment stays out of server access logs and Referer headers. Remove from address bar after capture.
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const { refresh } = useAuth();
  useEffect(() => { window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setError('');
    try {
      validateNewPassword(value(data, 'password'), value(data, 'confirmation')); setBusy(true);
      const result = await authRequest<{ message: string }>('reset-password', { token, password: value(data, 'password') });
      setSuccess(result.message); await refresh();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Frame title="Đặt lại mật khẩu" subtitle="Tạo mật khẩu mới để bảo vệ tài khoản SkillGraph của bạn.">
    <Notice error={error || (!token ? 'Liên kết thiếu mã xác nhận. Hãy yêu cầu liên kết mới.' : '')} success={success} />
    {token && !success && <form onSubmit={submit} className="auth-form"><fieldset disabled={busy}>
      <Password newPassword label="Mật khẩu mới" /><p className="auth-hint">10–128 ký tự, gồm chữ hoa, chữ thường và số.</p>
      <Password newPassword name="confirmation" label="Xác nhận mật khẩu mới" /><Submit busy={busy}>Lưu mật khẩu mới</Submit>
    </fieldset></form>}
    <p className="auth-switch"><Link to={success ? '/login' : '/forgot-password'}>{success ? 'Đăng nhập ngay' : 'Yêu cầu liên kết mới'}</Link></p>
  </Frame>;
}

export function AccountPage() {
  const { user, loading, error, refresh, logout } = useAuth(); const location = useLocation();
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState('');
  if (loading) return <div className="auth-loading" role="status">Đang kiểm tra phiên đăng nhập…</div>;
  if (error) return <Frame title="Chưa tải được tài khoản" subtitle="Kiểm tra kết nối rồi thử lại."><Notice error={error} /><button className="auth-submit" onClick={() => void refresh()}>Thử lại</button></Frame>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  return <Frame title={`Xin chào, ${user.name}`} subtitle="Bạn đã đăng nhập vào SkillGraph.">
    <dl className="auth-profile"><dt>Họ tên</dt><dd>{user.name}</dd>{user.username && <><dt>Tên đăng nhập</dt><dd>{user.username}</dd></>}{user.email && <><dt>Email</dt><dd>{user.email}</dd></>}<dt>Vai trò</dt><dd>Người dùng</dd></dl>
    <Notice error={actionError} /><Link className="auth-submit" to="/careers">Khám phá nghề nghiệp <ArrowRight size={18} /></Link>
    <p className="auth-switch"><Link to="/forgot-password">Đặt lại mật khẩu qua email</Link></p>
    <button className="auth-logout" disabled={busy} onClick={async () => { setBusy(true); setActionError(''); try { await logout(); } catch (e) { setActionError(errorMessage(e)); } finally { setBusy(false); } }}>{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
  </Frame>;
}

export function AuthHeader() {
  const { user, loading } = useAuth();
  const destination = user?.role === 'admin' ? '/admin/dashboard' : user ? '/account' : '/login';
  const label = loading ? 'Tài khoản' : user?.role === 'admin' ? 'Bảng quản trị' : user ? 'Tài khoản của tôi' : 'Đăng nhập';
  return <Link className="auth-header-link" to={destination}>{label}</Link>;
}
