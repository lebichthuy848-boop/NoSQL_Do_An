import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Check, KeyRound, Plus, RefreshCw, Search, Shield, Trash2, UserRound, Users, X } from 'lucide-react';
import { authRequest, useAuth } from '../../auth/AuthProvider';
import ConfirmModal from '../components/ConfirmModal';

type AdminUserRow = { id: string; name: string; email?: string | null; username?: string | null; role: 'admin' | 'user' | string; createdAt?: number | null; isActive?: boolean };
type UsersResponse = { users: AdminUserRow[] };
type CreateForm = { name: string; email: string; password: string; role: 'user' | 'admin' };

export default function UsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [form, setForm] = useState<CreateForm>({ name: '', email: '', password: '', role: 'user' });

  const loadUsers = async () => {
    setLoading(true); setError('');
    try {
      const result = await authRequest<UsersResponse>('admin/users');
      setRows(Array.isArray(result.users) ? result.users : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được danh sách tài khoản.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void loadUsers(); }, []);
  const filtered = useMemo(() => rows.filter((row) => `${row.name} ${row.email || ''} ${row.username || ''} ${row.role}`.toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const admins = rows.filter((row) => row.role === 'admin').length;
  const active = rows.filter((row) => row.isActive !== false).length;
  const formatDate = (value?: number | null) => value ? new Date(value * 1000).toLocaleDateString('vi-VN') : '—';

  async function createUser(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setSaving(true);
    try {
      await authRequest('admin/users', { action: 'create', ...form });
      setForm({ name: '', email: '', password: '', role: 'user' }); setCreateOpen(false);
      setMessage('Đã tạo tài khoản trong ArangoDB.'); await loadUsers();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được tài khoản.'); }
    finally { setSaving(false); }
  }

  async function updateUser(row: AdminUserRow, action: 'role' | 'active' | 'reset', value?: string | boolean) {
    setError(''); setMessage(''); setBusyId(row.id);
    try {
      const payload = action === 'role' ? { action, userId: row.id, role: value }
        : action === 'active' ? { action, userId: row.id, isActive: value }
          : { action, userId: row.id };
      const result = await authRequest<{ message?: string }>('admin/users', payload);
      setMessage(result.message || 'Đã cập nhật tài khoản.'); await loadUsers();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể cập nhật tài khoản.'); }
    finally { setBusyId(''); }
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    setError(''); setMessage(''); setBusyId(deleteTarget.id);
    try {
      const result = await authRequest<{ message?: string }>('admin/users', { action: 'delete', userId: deleteTarget.id });
      setMessage(result.message || 'Đã xóa tài khoản.'); setDeleteTarget(null); await loadUsers();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xóa được tài khoản.'); }
    finally { setBusyId(''); }
  }

  return <div className="admin-page"><div className="admin-page-heading"><div><div className="admin-eyebrow">IDENTITY & ACCESS</div><h1>Quản lý người dùng</h1><p>Quản lý tài khoản, quyền truy cập và trạng thái đăng nhập.</p></div><div className="admin-heading-actions"><button className="admin-btn" onClick={() => void loadUsers()} disabled={loading}><RefreshCw size={15} /> Làm mới</button><button className="admin-btn primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Thêm người dùng</button></div></div>
    {message && <div className="admin-toast"><Check size={16} />{message}<button onClick={() => setMessage('')}><X size={15} /></button></div>}
    <section className="admin-user-overview"><div className="admin-user-kpi"><span><Users size={18} /></span><div><strong>{loading ? '…' : rows.length.toLocaleString('vi-VN')}</strong><small>Tổng tài khoản</small></div></div><div className="admin-user-kpi"><span><Shield size={18} /></span><div><strong>{loading ? '…' : admins.toLocaleString('vi-VN')}</strong><small>Tài khoản Admin</small></div></div><div className="admin-user-kpi"><span><KeyRound size={18} /></span><div><strong>{loading ? '…' : active.toLocaleString('vi-VN')}</strong><small>Tài khoản đang hoạt động</small></div></div></section>
    <section className="admin-panel admin-table-panel"><div className="admin-table-toolbar"><div className="admin-table-title"><strong>{loading ? 'Đang tải tài khoản…' : `${filtered.length.toLocaleString('vi-VN')} tài khoản`}</strong><span>Nguồn trực tiếp: ArangoDB · auth_users</span></div><label className="admin-table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên, email hoặc username" /></label></div>
      {error && <div className="admin-users-error" role="alert">{error}<button className="admin-btn" onClick={() => void loadUsers()}>Thử lại</button></div>}
      <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Tài khoản</th><th>Email</th><th>Tên đăng nhập</th><th>Vai trò</th><th>Ngày tạo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {loading && <tr><td colSpan={7}><div className="admin-empty"><strong>Đang đọc danh sách từ ArangoDB…</strong></div></td></tr>}
        {!loading && !error && filtered.map((row) => <tr key={row.id} className={row.id === user?.id ? 'admin-user-current-row' : ''}><td><div className="admin-user-table-name"><span className="admin-avatar">{(row.name || row.username || 'U').slice(0, 1).toUpperCase()}</span><div><strong>{row.name || 'Chưa có tên'}</strong><small>{row.id === user?.id ? 'Bạn đang đăng nhập' : `ID: ${row.id}`}</small></div></div></td><td>{row.email || '—'}</td><td>{row.username || row.id}</td><td><select aria-label={`Vai trò ${row.name}`} disabled={busyId === row.id || row.id === user?.id} value={row.role === 'admin' ? 'admin' : 'user'} onChange={(event) => void updateUser(row, 'role', event.target.value)}><option value="user">USER</option><option value="admin">ADMIN</option></select></td><td>{formatDate(row.createdAt)}</td><td><span className={`admin-status ${row.isActive === false ? 'rejected' : 'approved'}`}>{row.isActive === false ? 'Đã khóa' : 'Đang hoạt động'}</span></td><td><div className="admin-row-actions"><button title={row.isActive === false ? 'Mở khóa' : 'Khóa tài khoản'} aria-label={row.isActive === false ? 'Mở khóa tài khoản' : 'Khóa tài khoản'} disabled={busyId === row.id || row.id === user?.id} onClick={() => void updateUser(row, 'active', row.isActive === false)}>{row.isActive === false ? <Check size={15} /> : <Ban size={15} />}</button><button title="Gửi liên kết đặt lại mật khẩu qua email" aria-label="Gửi liên kết đặt lại mật khẩu" disabled={busyId === row.id || !row.email} onClick={() => void updateUser(row, 'reset')}><KeyRound size={15} /></button><button className="delete" title="Xóa tài khoản" aria-label="Xóa tài khoản" disabled={busyId === row.id || row.id === user?.id} onClick={() => setDeleteTarget(row)}><Trash2 size={15} /></button></div></td></tr>)}
        {!loading && !error && !filtered.length && <tr><td colSpan={7}><div className="admin-empty"><span className="admin-empty-icon"><UserRound size={19} /></span><strong>{rows.length ? 'Không tìm thấy tài khoản' : 'Chưa có tài khoản đăng ký'}</strong><p>{rows.length ? 'Thử từ khóa khác.' : 'Tạo tài khoản mới để thêm người dùng vào auth_users.'}</p></div></td></tr>}
      </tbody></table></div>
    </section>
    <p className="admin-users-account-link">Cập nhật hồ sơ của bạn trong <Link to="/admin/account">Tài khoản Admin</Link>. Reset mật khẩu sẽ gửi liên kết qua email; Admin không xem mật khẩu của người dùng.</p>

    {createOpen && <div className="admin-modal-backdrop"><form className="admin-modal" onSubmit={createUser}><button type="button" className="admin-modal-close" aria-label="Đóng" onClick={() => setCreateOpen(false)}><X size={18} /></button><span className="admin-modal-icon"><UserRound size={19} /></span><h2>Tạo tài khoản người dùng</h2><p>Mật khẩu được băm ở backend trước khi lưu vào ArangoDB.</p><label className="admin-form-field">Họ tên<input required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="admin-form-field">Email<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="admin-form-field">Mật khẩu tạm<input required type="password" minLength={10} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>Dùng tối thiểu 10 ký tự, gồm chữ hoa, chữ thường và số.</small></label><label className="admin-form-field">Vai trò<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as CreateForm['role'] })}><option value="user">Người dùng</option><option value="admin">Quản trị viên</option></select></label>{error && <div className="admin-form-error">{error}</div>}<div className="admin-modal-actions"><button type="button" className="admin-btn" disabled={saving} onClick={() => setCreateOpen(false)}>Hủy</button><button className="admin-btn primary" disabled={saving} type="submit"><Plus size={15} /> {saving ? 'Đang tạo…' : 'Tạo tài khoản'}</button></div></form></div>}
    <ConfirmModal open={!!deleteTarget} title="Xóa tài khoản này?" description={deleteTarget ? `${deleteTarget.name} · ${deleteTarget.email || deleteTarget.id}` : undefined} confirmText={busyId ? 'Đang xóa…' : 'Xóa tài khoản'} danger busy={!!busyId} onCancel={() => { if (!busyId) setDeleteTarget(null); }} onConfirm={deleteUser} />
  </div>;
}
