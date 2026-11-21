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
    <input name={name} type={visible ? 'text' : 'password'} required minLength={newPassword ? 12 : 1} maxLength={256}
      autoComplete={newPassword ? 'new-password' : 'current-password'} placeholder={newPassword ? 'Ít nhất 12 ký tự' : 'Nhập mật khẩu của bạn'} />
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
function destinationAfterLogin(role: 'admin' | 'user', target: string) {
  if (role === 'admin') return target.startsWith('/admin') ? target : '/admin/dashboard';
  return target.startsWith('/admin') || target === '/403' ? '/account' : target;
}
export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 12 || password.length > 256 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
    throw new Error('Mật khẩu cần 12–256 ký tự, gồm chữ hoa, chữ thường và số.');
  if (password !== confirmation) throw new Error('Mật khẩu xác nhận chưa khớp.');
}

export function PasswordChangeForm() {
  const { completePasswordChange } = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    try {
      validateNewPassword(value(data, 'newPassword'), value(data, 'confirmation'));
      setBusy(true);
      await authRequest('/auth/change-password', { currentPassword: value(data, 'currentPassword'), newPassword: value(data, 'newPassword') });
      completePasswordChange();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="auth-form">
    <h3>Đổi mật khẩu</h3><Notice error={error} />
    <fieldset disabled={busy}>
      <Password name="currentPassword" label="Mật khẩu hiện tại" />
      <Password name="newPassword" label="Mật khẩu mới" newPassword />
      <Password name="confirmation" label="Xác nhận mật khẩu mới" newPassword />
      <Submit busy={busy}>Cập nhật mật khẩu</Submit>
    </fieldset>
  </form>;
}

export function LoginPage() {
  const { user, login, passwordChangedNotice, clearPasswordChangedNotice } = useAuth();
  const navigate = useNavigate(), location = useLocation();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(Boolean(location.state?.passwordChanged));
  useEffect(() => {
    if (passwordChangedNotice) {
      setPasswordChanged(true);
      clearPasswordChangedNotice();
    }
  }, [passwordChangedNotice, clearPasswordChangedNotice]);
  const target = safeReturnPath(location.state?.from);
  if (user && !location.state?.passwordChanged && !passwordChangedNotice) return <Navigate to={destinationAfterLogin(user.role, target)} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const loggedInUser = await login(value(data, 'email'), value(data, 'password'));
      const destination = destinationAfterLogin(loggedInUser.role, target);
      navigate(destination, { replace: true });
    }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Frame title="Chào mừng trở lại" subtitle="Đăng nhập để tiếp tục khám phá cùng SkillGraph.">
    <Notice error={error} success={passwordChanged ? 'Mật khẩu đã đổi. Hãy đăng nhập lại.' : location.state?.registered ? 'Đăng ký thành công! Hãy đăng nhập tài khoản mới.' : undefined} />
    <form onSubmit={submit} className="auth-form"><fieldset disabled={busy}>
      <label className="auth-field">Email<input type="email" name="email" autoComplete="username" required maxLength={254} placeholder="ban@example.com" /></label>
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
      await authRequest('/auth/register', { displayName: value(data, 'name').trim(), email: value(data, 'email'), password: value(data, 'password') });
      navigate('/login', { replace: true, state: { registered: true } });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Frame title="Tạo tài khoản mới" subtitle="Bắt đầu hành trình khám phá nghề nghiệp của bạn.">
    <Notice error={error} /><form onSubmit={submit} className="auth-form"><fieldset disabled={busy}>
      <label className="auth-field">Họ và tên<input name="name" required minLength={2} maxLength={80} autoComplete="name" placeholder="Nguyễn Văn An" /></label>
      <label className="auth-field">Email<input type="email" name="email" required maxLength={254} autoComplete="email" placeholder="ban@example.com" /></label>
      <Password newPassword /><p className="auth-hint">12–256 ký tự, gồm chữ hoa, chữ thường và số.</p>
      <Password name="confirmation" label="Xác nhận mật khẩu" newPassword />
      <Submit busy={busy}>Tạo tài khoản</Submit></fieldset></form>
    <p className="auth-switch">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
  </Frame>;
}

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(''); setSuccess('');
    try { const result = await authRequest<{ accepted: boolean }>('/auth/forgot-password', { email: value(data, 'email') }); setSuccess(result.accepted ? 'Nếu địa chỉ email có tài khoản, hướng dẫn đặt lại sẽ được gửi khi dịch vụ email được cấu hình.' : 'Không thể tiếp nhận yêu cầu đặt lại mật khẩu.'); }
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
      await authRequest<{ changed: boolean }>('/auth/reset-password', { token, newPassword: value(data, 'password') });
      setSuccess('Mật khẩu đã được đặt lại. Hãy đăng nhập lại bằng mật khẩu mới.'); await refresh();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Frame title="Đặt lại mật khẩu" subtitle="Tạo mật khẩu mới để bảo vệ tài khoản SkillGraph của bạn.">
    <Notice error={error || (!token ? 'Liên kết thiếu mã xác nhận. Hãy yêu cầu liên kết mới.' : '')} success={success} />
    {token && !success && <form onSubmit={submit} className="auth-form"><fieldset disabled={busy}>
      <Password newPassword label="Mật khẩu mới" /><p className="auth-hint">12–256 ký tự, gồm chữ hoa, chữ thường và số.</p>
      <Password newPassword name="confirmation" label="Xác nhận mật khẩu mới" /><Submit busy={busy}>Lưu mật khẩu mới</Submit>
    </fieldset></form>}
    <p className="auth-switch"><Link to={success ? '/login' : '/forgot-password'}>{success ? 'Đăng nhập ngay' : 'Yêu cầu liên kết mới'}</Link></p>
  </Frame>;
}

export function AccountPage() {
  const { user, loading, error, refresh, logout, updateDisplayName } = useAuth(); const location = useLocation();
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [profileBusy, setProfileBusy] = useState(false), [profileError, setProfileError] = useState(''), [profileNotice, setProfileNotice] = useState('');
  useEffect(() => setDisplayName(user?.displayName || ''), [user?.id, user?.displayName]);
  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setProfileBusy(true); setProfileError(''); setProfileNotice('');
    try {
      await updateDisplayName(displayName.trim());
      setProfileNotice('Tên hiển thị đã được cập nhật.');
    } catch (cause) {
      setProfileError(errorMessage(cause));
    } finally {
      setProfileBusy(false);
    }
  }
  if (loading) return <div className="auth-loading" role="status">Đang kiểm tra phiên đăng nhập…</div>;
  if (error) return <Frame title="Chưa tải được tài khoản" subtitle="Kiểm tra kết nối rồi thử lại."><Notice error={error} /><button className="auth-submit" onClick={() => void refresh()}>Thử lại</button></Frame>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  return <Frame title={`Xin chào, ${user.name}`} subtitle="Bạn đã đăng nhập vào SkillGraph.">
    <form className="auth-form" onSubmit={saveDisplayName}>
      <fieldset disabled={profileBusy}>
        <label className="auth-field">Tên hiển thị<input name="displayName" autoComplete="name" required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <button className="auth-submit" type="submit">{profileBusy ? 'Đang lưu…' : 'Lưu tên hiển thị'}</button>
      </fieldset>
    </form>
    {profileError && <Notice error={profileError} />}
    {profileNotice && <p className="auth-notice auth-success" role="status">{profileNotice}</p>}
    <dl className="auth-profile">{user.email && <><dt>Email (chỉ đọc)</dt><dd>{user.email}</dd></>}<dt>Vai trò</dt><dd>Người dùng</dd></dl>
    <Notice error={actionError} /><Link className="auth-submit" to="/careers">Khám phá nghề nghiệp <ArrowRight size={18} /></Link>
    <PasswordChangeForm /><p className="auth-switch"><Link to="/forgot-password">Quên mật khẩu?</Link></p>
    <button className="auth-logout" disabled={busy} onClick={async () => { setBusy(true); setActionError(''); try { await logout(); } catch (e) { setActionError(errorMessage(e)); } finally { setBusy(false); } }}>{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
  </Frame>;
}

export function AuthHeader() {
  const { user, loading } = useAuth();
  const destination = user?.role === 'admin' ? '/admin/dashboard' : user ? '/account' : '/login';
  const label = loading ? 'Tài khoản' : user?.role === 'admin' ? 'Bảng quản trị' : user ? 'Tài khoản của tôi' : 'Đăng nhập';
  return <Link className="auth-header-link" to={destination}>{label}</Link>;
}
