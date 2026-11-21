import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Eye, Filter, Plus, RefreshCw, Search, Shield, UserRound, Users, X } from 'lucide-react';
import { apiRequest, apiRequestWithResponse } from '../../../api/http';
import { useAuth } from '../../auth/AuthProvider';

type UserRole = 'admin' | 'user';
type UserStatus = 'active' | 'locked' | 'disabled';
type AdminUserRow = { id: string; displayName: string; email: string; role: UserRole; status: UserStatus; createdAt?: string; updatedAt?: string };
type AdminUserDetail = AdminUserRow & { profile?: { careerGoalId: string | null; skillCount: number; completedResourceCount: number } | null };
type CreateForm = { displayName: string; email: string; password: string; role: UserRole };

const PAGE_SIZE = 25;
const statusLabels: Record<UserStatus, string> = { active: 'Đang hoạt động', locked: 'Đang khóa', disabled: 'Đã vô hiệu hóa' };

function normalizeUser(row: Record<string, unknown>): AdminUserRow {
  const status = row.status === 'locked' || row.status === 'disabled' ? row.status : 'active';
  return {
    id: String(row.id || row._key || ''),
    displayName: String(row.displayName || row.display_name || ''),
    email: String(row.email || ''),
    role: row.role === 'admin' ? 'admin' : 'user',
    status,
    createdAt: String(row.createdAt || row.created_at || ''),
    updatedAt: String(row.updatedAt || row.updated_at || ''),
  };
}

export default function UsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pageNo, setPageNo] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [form, setForm] = useState<CreateForm>({ displayName: '', email: '', password: '', role: 'user' });
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailName, setDetailName] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const requestSequence = useRef(0);

  const loadUsers = async (requestedPage = pageNo) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: String(PAGE_SIZE) });
    if (query.trim()) params.set('search', query.trim());
    if (roleFilter) params.set('role', roleFilter);
    if (statusFilter) params.set('status', statusFilter);
    try {
      const response = await apiRequestWithResponse<Record<string, unknown>[]>(`/admin/users?${params}`);
      if (sequence !== requestSequence.current) return;
      const nextRows = response.data.map(normalizeUser);
      const totalHeader = response.headers.get('x-total-count');
      const count = totalHeader === null ? nextRows.length : Number(totalHeader);
      const currentPage = Number(response.headers.get('x-page'));
      setRows(nextRows);
      setTotal(Number.isFinite(count) ? count : nextRows.length);
      setPageNo(Number.isInteger(currentPage) && currentPage > 0 ? currentPage : requestedPage);
    } catch (cause) {
      if (sequence !== requestSequence.current) return;
      setError(cause instanceof Error ? cause.message : 'Không tải được danh sách tài khoản.');
      setRows([]);
      setTotal(0);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadUsers(pageNo); }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query, roleFilter, statusFilter, pageNo]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setError(''); setMessage(''); setSaving(true);
    try {
      await apiRequest('/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setForm({ displayName: '', email: '', password: '', role: 'user' }); setCreateOpen(false);
      setQuery(''); setRoleFilter(''); setStatusFilter(''); setPageNo(1);
      setMessage('Backend đã tạo tài khoản.');
      await loadUsers(1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được tài khoản.'); }
    finally { setSaving(false); }
  }

  async function updateUser(row: AdminUserRow, patch: Partial<Pick<AdminUserRow, 'displayName' | 'role' | 'status'>>) {
    setError(''); setMessage(''); setBusyId(row.id);
    try {
      const updated = normalizeUser(await apiRequest<Record<string, unknown>>(`/admin/users/${encodeURIComponent(row.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      }));
      if (detail?.id === row.id) { setDetail((prior) => prior ? { ...prior, ...updated } : prior); setDetailName(updated.displayName); }
      setMessage('Backend đã cập nhật tài khoản và ghi nhật ký quản trị.');
      await loadUsers(pageNo);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật tài khoản.');
      return false;
    } finally { setBusyId(''); }
  }

  async function showDetails(row: AdminUserRow) {
    setDetail(null); setDetailName(''); setDetailError(''); setDetailLoading(true);
    try {
      const result = await apiRequest<AdminUserDetail>(`/admin/users/${encodeURIComponent(row.id)}`);
      setDetail(result); setDetailName(result.displayName || '');
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : 'Không tải được chi tiết tài khoản.');
    } finally { setDetailLoading(false); }
  }

  async function saveDetail(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    await updateUser(detail, { displayName: detailName.trim() });
  }

  const adminsOnPage = rows.filter((row) => row.role === 'admin').length;
  const activeOnPage = rows.filter((row) => row.status === 'active').length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const formatDate = (value?: string) => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? '—' : parsed.toLocaleDateString('vi-VN');
  };

  return <div className="admin-page"><div className="admin-page-heading"><div><div className="admin-eyebrow">IDENTITY & ACCESS</div><h1>Quản lý người dùng</h1><p>Tìm kiếm, lọc, phân trang và quản lý trạng thái qua API Node.js.</p></div><div className="admin-heading-actions"><button className="admin-btn" onClick={() => void loadUsers(pageNo)} disabled={loading}><RefreshCw size={15} /> Làm mới</button><button className="admin-btn primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Thêm người dùng</button></div></div>
    {message && <div className="admin-toast" role="status"><Check size={16} />{message}<button onClick={() => setMessage('')}><X size={15} /></button></div>}
    {error && <div className="admin-users-error" role="alert">{error}<button className="admin-btn" onClick={() => void loadUsers(pageNo)}>Thử lại</button></div>}
    <section className="admin-user-overview"><div className="admin-user-kpi"><span><Users size={18} /></span><div><strong>{loading ? '…' : total.toLocaleString('vi-VN')}</strong><small>Tài khoản phù hợp bộ lọc</small></div></div><div className="admin-user-kpi"><span><Shield size={18} /></span><div><strong>{loading ? '…' : adminsOnPage.toLocaleString('vi-VN')}</strong><small>Admin trên trang này</small></div></div><div className="admin-user-kpi"><span><Check size={18} /></span><div><strong>{loading ? '…' : activeOnPage.toLocaleString('vi-VN')}</strong><small>Đang hoạt động trên trang</small></div></div></section>
    <section className="admin-panel admin-table-panel"><div className="admin-table-toolbar"><div className="admin-table-title"><strong>{loading ? 'Đang tải tài khoản…' : `${total.toLocaleString('vi-VN')} tài khoản phù hợp`}</strong><span>Nguồn trực tiếp: API `/admin/users` · app_users</span></div><label className="admin-table-search"><Search size={16} /><input value={query} maxLength={100} onChange={(event) => { setQuery(event.target.value); setPageNo(1); }} placeholder="Tìm tên hoặc email" /></label><label className="admin-select-filter"><Shield size={15} /><select aria-label="Lọc theo vai trò" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPageNo(1); }}><option value="">Mọi vai trò</option><option value="user">User</option><option value="admin">Admin</option></select></label><label className="admin-select-filter"><Filter size={15} /><select aria-label="Lọc theo trạng thái" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPageNo(1); }}><option value="">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="locked">Đang khóa</option><option value="disabled">Đã vô hiệu hóa</option></select></label></div>
      <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Tài khoản</th><th>Email</th><th>Vai trò</th><th>Ngày tạo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {loading && <tr><td colSpan={6}><div className="admin-empty"><strong>Đang đọc danh sách từ Backend…</strong></div></td></tr>}
        {!loading && !error && rows.map((row) => <tr key={row.id} className={row.id === user?.id ? 'admin-user-current-row' : ''}><td><div className="admin-user-table-name"><span className="admin-avatar">{row.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{row.displayName}</strong><small>{row.id === user?.id ? 'Bạn đang đăng nhập' : `ID: ${row.id}`}</small></div></div></td><td>{row.email}</td><td><select aria-label={`Vai trò ${row.displayName}`} disabled={busyId === row.id || row.id === user?.id} value={row.role} onChange={(event) => void updateUser(row, { role: event.target.value as UserRole })}><option value="user">USER</option><option value="admin">ADMIN</option></select></td><td>{formatDate(row.createdAt)}</td><td><select aria-label={`Trạng thái ${row.displayName}`} disabled={busyId === row.id || row.id === user?.id} value={row.status} onChange={(event) => void updateUser(row, { status: event.target.value as UserStatus })}><option value="active">Đang hoạt động</option><option value="locked">Đang khóa</option><option value="disabled">Đã vô hiệu hóa</option></select></td><td><div className="admin-row-actions"><button title="Xem chi tiết tài khoản" aria-label={`Xem chi tiết ${row.displayName}`} onClick={() => void showDetails(row)}><Eye size={16} /></button></div></td></tr>)}
        {!loading && !error && !rows.length && <tr><td colSpan={6}><div className="admin-empty"><span className="admin-empty-icon"><UserRound size={19} /></span><strong>{total ? 'Không có tài khoản trên trang này' : 'Chưa có tài khoản phù hợp'}</strong><p>Thử thay đổi bộ lọc hoặc từ khóa.</p></div></td></tr>}
      </tbody></table></div>
      <div className="admin-table-footer"><span>Trang {pageNo} · {total.toLocaleString('vi-VN')} kết quả</span><div className="admin-pagination"><button disabled={loading || pageNo <= 1} onClick={() => setPageNo((page) => Math.max(1, page - 1))} aria-label="Trang trước">‹</button><span>{pageNo} / {pageCount}</span><button disabled={loading || pageNo >= pageCount} onClick={() => setPageNo((page) => Math.min(pageCount, page + 1))} aria-label="Trang sau">›</button></div></div>
    </section>
    <p className="admin-users-account-link">Backend không có thao tác xóa tài khoản hoặc gửi email đặt lại mật khẩu. Khóa/vô hiệu hóa sẽ thu hồi các session đang hoạt động. Đổi mật khẩu của bạn ở <a href="/admin/account">Tài khoản Admin</a>.</p>
    {createOpen && <div className="admin-modal-backdrop"><form className="admin-modal" onSubmit={createUser}><button type="button" className="admin-modal-close" aria-label="Đóng" onClick={() => setCreateOpen(false)}><X size={18} /></button><span className="admin-modal-icon"><UserRound size={19} /></span><h2>Tạo tài khoản</h2><p>Mật khẩu được băm ở Backend trước khi lưu vào app_users.</p><label className="admin-form-field">Họ tên<input required minLength={1} maxLength={120} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label><label className="admin-form-field">Email<input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="admin-form-field">Mật khẩu tạm<input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>12–256 ký tự, gồm chữ hoa, chữ thường và số.</small></label><label className="admin-form-field">Vai trò<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}><option value="user">Người dùng</option><option value="admin">Quản trị viên</option></select></label>{error && <div className="admin-form-error" role="alert">{error}</div>}<div className="admin-modal-actions"><button type="button" className="admin-btn" disabled={saving} onClick={() => setCreateOpen(false)}>Hủy</button><button className="admin-btn primary" disabled={saving} type="submit"><Plus size={15} /> {saving ? 'Đang tạo…' : 'Tạo tài khoản'}</button></div></form></div>}
    {(detail || detailLoading || detailError) && <div className="admin-modal-backdrop"><section className="admin-modal admin-detail" role="dialog" aria-modal="true" aria-labelledby="user-detail-title"><button type="button" className="admin-modal-close" aria-label="Đóng" onClick={() => { setDetail(null); setDetailError(''); }}><X size={18} /></button><span className="admin-eyebrow">USER ACCOUNT</span><h2 id="user-detail-title">Chi tiết tài khoản</h2>{detailLoading && <div className="admin-empty"><strong>Đang tải chi tiết…</strong></div>}{detailError && <div className="admin-form-error" role="alert">{detailError}</div>}{detail && <><form onSubmit={saveDetail}><label className="admin-form-field">Tên hiển thị<input required minLength={1} maxLength={120} value={detailName} onChange={(event) => setDetailName(event.target.value)} /></label><label className="admin-form-field">Email<input value={detail.email} readOnly /></label><label className="admin-form-field">ID tài khoản<input value={detail.id} readOnly /></label><p>Vai trò: <strong>{detail.role.toUpperCase()}</strong> · Trạng thái: <strong>{statusLabels[detail.status]}</strong></p><p>Mục tiêu nghề nghiệp: {detail.profile?.careerGoalId || 'Chưa chọn'} · Kỹ năng: {detail.profile?.skillCount ?? 0} · Học liệu hoàn tất: {detail.profile?.completedResourceCount ?? 0}</p>{error && <div className="admin-form-error" role="alert">{error}</div>}<div className="admin-modal-actions"><button type="button" className="admin-btn" onClick={() => { setDetail(null); setDetailError(''); }}>Đóng</button><button className="admin-btn primary" type="submit" disabled={Boolean(busyId) || !detailName.trim() || detailName.trim() === detail.displayName}>{busyId === detail.id ? 'Đang lưu…' : 'Lưu tên hiển thị'}</button></div></form><pre>{JSON.stringify({ id: detail.id, role: detail.role, status: detail.status, profile: detail.profile || null }, null, 2)}</pre></>}</section></div>}
  </div>;
}
