import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { PasswordChangeForm } from '../../auth/AuthPages';

export default function AdminAccountPage() {
  const { user, updateDisplayName } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => setDisplayName(user?.displayName || ''), [user?.id, user?.displayName]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await updateDisplayName(displayName.trim());
      setDisplayName(updated.displayName);
      setMessage('Tên hiển thị đã được cập nhật.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật hồ sơ.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="admin-page"><div className="admin-page-heading"><div><div className="admin-eyebrow">ADMIN ACCOUNT</div><h1>Tài khoản Admin</h1><p>Thông tin do phiên Backend trả về và thao tác bảo mật được hỗ trợ.</p></div><span className="admin-role-pill"><ShieldCheck size={14} /> ADMIN</span></div>
    <div className="admin-account-grid"><section className="admin-panel admin-account-profile"><div className="admin-profile-cover" /><span className="admin-account-avatar">{(user?.displayName || 'A').slice(0, 1).toUpperCase()}</span><div className="admin-account-title"><h2>{user?.displayName || 'Admin'}</h2><span className="admin-status approved">Quản trị viên</span></div><p>Chỉ tên hiển thị có thể chỉnh sửa. Email giữ nguyên vì chưa có quy trình xác minh thay đổi.</p>
      <form onSubmit={saveProfile}>
        <label className="admin-form-field">Tên hiển thị<input required minLength={1} maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label className="admin-form-field">Email<input value={user?.email || ''} readOnly /></label>
        <label className="admin-form-field">ID tài khoản<input value={user?.id || ''} readOnly /></label>
        {error && <div className="admin-form-error" role="alert">{error}</div>}
        {message && <div className="admin-toast" role="status">{message}</div>}
        <button className="admin-btn primary" type="submit" disabled={saving || !displayName.trim() || displayName.trim() === user?.displayName}>{saving ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
      </form>
    </section>
      <div className="admin-account-side"><section className="admin-panel"><div className="admin-panel-head"><div><h2>Bảo mật</h2><p>Cookie phiên được quản lý bởi Backend.</p></div><LockKeyhole size={18} /></div><div className="admin-security-row"><span><ShieldCheck size={17} /></span><div><strong>Cookie phiên HttpOnly</strong><small>Không lưu token trong JavaScript hoặc localStorage</small></div><b className="admin-security-ok">Bật</b></div><div className="admin-security-row"><span><KeyRound size={17} /></span><div><strong>Đổi mật khẩu</strong><small>Xác minh mật khẩu hiện tại; phiên khác sẽ bị thu hồi</small></div></div></section><section className="admin-panel"><PasswordChangeForm /></section><section className="admin-panel"><div className="admin-panel-head"><div><h2>Phân quyền</h2><p>Vai trò xác nhận từ session API.</p></div><UserRound size={18} /></div><span className="admin-status approved">{user?.role || 'unknown'}</span></section></div></div>
  </div>;
}