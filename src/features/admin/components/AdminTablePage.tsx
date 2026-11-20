import { useMemo, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import MiniSkillGraph from './MiniSkillGraph';
import { ArrowDownUp, Check, ChevronLeft, ChevronRight, CirclePlus, Eye, Filter, MoreHorizontal, Pencil, Search, Trash2, X } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { authRequest, useAuth } from '../../auth/AuthProvider';
import { useAdminStore, checkPrerequisiteCycle } from '../store/adminStore';
import type { AdminCollection, AdminRecord, FieldSpec, ReviewState } from '../types/admin';
import type { AdminOutlet } from './AdminLayout';

const config: Record<string, { title: string; eyebrow: string; collection: AdminCollection; description: string; fields: FieldSpec[]; columns: string[]; graph?: boolean; review?: boolean }> = {
  careers: { title: 'Quản lý nghề nghiệp', eyebrow: 'CAREER CATALOG', collection: 'careers', description: 'Quản lý nghề nghiệp và các kỹ năng được yêu cầu trong từng vai trò.', fields: [{ key: 'name', label: 'Tên nghề nghiệp', required: true }, { key: 'description', label: 'Mô tả', multiline: true }, { key: 'career_group', label: 'Nhóm nghề' }, { key: 'isco_group', label: 'Mã ISCO' }], columns: ['name', 'career_group', 'isco_group'] },
  skills: { title: 'Quản lý kỹ năng', eyebrow: 'SKILL CATALOG', collection: 'skills', description: 'Theo dõi kỹ năng, taxonomy, nghề liên quan và trạng thái bao phủ học liệu.', fields: [{ key: 'name', label: 'Tên kỹ năng', required: true }, { key: 'description', label: 'Mô tả', multiline: true }, { key: 'skill_type', label: 'Loại kỹ năng' }, { key: 'reuse_level', label: 'Mức tái sử dụng' }], columns: ['name', 'skill_type', 'reuse_level'] },
  providers: { title: 'Nhà cung cấp học liệu', eyebrow: 'CONTENT PROVIDERS', collection: 'providers', description: 'Thông tin tổ chức cung cấp và xác minh nguồn học liệu.', fields: [{ key: 'name', label: 'Tên nhà cung cấp', required: true }, { key: 'official_website', label: 'Website chính thức', type: 'url' }, { key: 'description', label: 'Mô tả', multiline: true }], columns: ['name', 'official_website'] },
  courses: { title: 'Quản lý học liệu', eyebrow: 'LEARNING RESOURCES', collection: 'courses', description: 'Rà soát học liệu, bằng chứng nguồn và trạng thái đề xuất.', fields: [{ key: 'title', label: 'Tên học liệu', required: true }, { key: 'canonical_url', label: 'URL chính thức', type: 'url' }, { key: 'provider_name', label: 'Nhà cung cấp' }, { key: 'resource_type', label: 'Loại học liệu' }, { key: 'language', label: 'Ngôn ngữ' }], columns: ['title', 'provider_name', 'resource_type', 'language'], review: true },
  'course-skill-mappings': { title: 'Course–Skill Mapping', eyebrow: 'TEACHES RELATIONSHIPS', collection: 'teaches', description: 'Rà soát bằng chứng và phạm vi mapping giữa học liệu với kỹ năng.', fields: [{ key: '_from', label: 'Học liệu (_from)', required: true }, { key: '_to', label: 'Kỹ năng (_to)', required: true }, { key: 'evidence_scope', label: 'Phạm vi bằng chứng', type: 'select', options: ['direct_topic', 'partial'] }, { key: 'mapping_audit_limit', label: 'Giới hạn bằng chứng', multiline: true }], columns: ['_from', '_to', 'evidence_scope'], graph: true, review: true },
  'career-skills': { title: 'Career–Skill', eyebrow: 'REQUIRES SKILL', collection: 'requires_skill', description: 'Quản lý kỹ năng Essential và Optional cho từng nghề nghiệp.', fields: [{ key: '_from', label: 'Nghề nghiệp (_from)', required: true }, { key: '_to', label: 'Kỹ năng (_to)', required: true }, { key: 'requirement_type', label: 'Mức yêu cầu', type: 'select', options: ['essential', 'optional'] }], columns: ['_from', '_to', 'requirement_type'], graph: true },
  'skill-prerequisites': { title: 'Skill Prerequisite', eyebrow: 'PREREQUISITE DAG', collection: 'prerequisite', description: 'Xây dựng chuỗi kiến thức nền và phát hiện self-loop hoặc chu trình.', fields: [{ key: '_from', label: 'Kỹ năng nền tảng (_from)', required: true }, { key: '_to', label: 'Kỹ năng phụ thuộc (_to)', required: true }, { key: 'relation_type', label: 'Loại quan hệ' }, { key: 'evidence_url', label: 'Nguồn chứng minh', type: 'url' }], columns: ['_from', '_to', 'relation_type'], graph: true },
};

const label = (row: AdminRecord, key: string) => String(row[key] ?? '—');
const titleOf = (row: AdminRecord, collection: AdminCollection) => String(row.title || row.name || row._key || collection);
function reviewOf(row: AdminRecord): ReviewState {
  if (row.review_status === 'pending' || row.review_status === 'approved' || row.review_status === 'rejected') return row.review_status;
  return row.recommendation_eligible === true ? 'approved' : 'pending';
}
const statusText: Record<ReviewState, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };

export default function AdminTablePage({ page }: { page: keyof typeof config }) {
  const cfg = config[page];
  const { user } = useAuth();
  const { search: globalSearch } = useOutletContext<AdminOutlet>();
  const rows = useAdminStore((s) => s.records[cfg.collection] || []);
  const add = useAdminStore((s) => s.add), patch = useAdminStore((s) => s.patch), remove = useAdminStore((s) => s.remove), review = useAdminStore((s) => s.review);
  const [search, setSearch] = useState(''), [statusFilter, setStatusFilter] = useState('all'), [pageNo, setPageNo] = useState(1), [modal, setModal] = useState<'new' | 'edit' | 'detail' | null>(null), [selected, setSelected] = useState<AdminRecord | null>(null), [confirm, setConfirm] = useState<{ row: AdminRecord; action: 'delete' | ReviewState } | null>(null), [message, setMessage] = useState(''), [formError, setFormError] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const loadLiveCatalog = useAdminStore((s) => s.loadLiveCatalog);
  const query = `${search} ${globalSearch}`.trim().toLowerCase();
  const filtered = useMemo(() => rows.filter((row) => {
    const matches = !query || Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(query));
    const state = reviewOf(row);
    return matches && (statusFilter === 'all' || state === statusFilter);
  }), [rows, query, statusFilter]);
  const pageSize = 10, count = Math.max(1, Math.ceil(filtered.length / pageSize)), visible = filtered.slice((pageNo - 1) * pageSize, pageNo * pageSize);
  function openForm(row?: AdminRecord) { setSelected(row || null); setForm(Object.fromEntries(cfg.fields.map((field) => [field.key, row ? String(row[field.key] ?? '') : '']))); setFormError(''); setModal(row ? 'edit' : 'new'); }
  async function save(event: FormEvent) {
    event.preventDefault(); setFormError('');
    const values = Object.fromEntries(cfg.fields.map((field) => [field.key, field.type === 'number' ? Number(form[field.key] || 0) : (form[field.key] || '').trim()]));
    if (['teaches', 'requires_skill', 'prerequisite'].includes(cfg.collection) && rows.some((row) => row._from === values._from && row._to === values._to && row._key !== selected?._key)) {
      setFormError('Quan hệ giữa hai đối tượng này đã tồn tại.'); return;
    }
    if (page === 'skill-prerequisites') {
      const issue = checkPrerequisiteCycle(rows, String(values._from), String(values._to));
      if (issue) { setFormError(issue); return; }
    }
    try {
      setSaving(true);
      const result = await authRequest<{ record?: AdminRecord }>('admin/records', {
        action: modal === 'edit' && selected ? 'update' : 'create', collection: cfg.collection,
        ...(modal === 'edit' && selected ? { key: selected._key } : {}), data: values,
      });
      if (modal === 'edit' && selected) patch(cfg.collection, selected._key, result.record || values, user?.name || 'admin');
      else if (result.record) add(cfg.collection, result.record, user?.name || 'admin');
      await loadLiveCatalog();
      setMessage(modal === 'edit' ? 'Đã cập nhật dữ liệu trong ArangoDB.' : 'Đã thêm dữ liệu vào ArangoDB.'); setModal(null);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Không thể lưu bản ghi vào ArangoDB.'); }
    finally { setSaving(false); }
  }
  async function confirmAction(reason = '') {
    if (!confirm) return;
    try {
      setSaving(true);
      if (confirm.action === 'delete') {
        await authRequest('admin/records', { action: 'delete', collection: cfg.collection, key: confirm.row._key, reason });
        remove(cfg.collection, confirm.row._key, user?.name || 'admin', reason);
        setMessage('Đã xóa bản ghi trong ArangoDB.');
      } else {
        const result = await authRequest<{ record?: AdminRecord }>('admin/records', { action: 'review', collection: cfg.collection, key: confirm.row._key, status: confirm.action, reason });
        review(cfg.collection, confirm.row._key, confirm.action, user?.name || 'admin', reason);
        if (result.record) patch(cfg.collection, confirm.row._key, result.record, user?.name || 'admin');
        setMessage('Đã cập nhật trạng thái duyệt trong ArangoDB.');
      }
      await loadLiveCatalog(); setConfirm(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể hoàn tất thao tác với ArangoDB.'); }
    finally { setSaving(false); }
  }
  const pending = rows.filter((row) => reviewOf(row) === 'pending');
  return <div className="admin-page">
    <div className="admin-page-heading"><div><div className="admin-eyebrow">{cfg.eyebrow}</div><h1>{cfg.title}</h1><p>{cfg.description}</p></div><button className="admin-btn primary" onClick={() => openForm()}><CirclePlus size={17} /> Thêm mới</button></div>
    {message && <div className="admin-toast"><Check size={16} />{message}<button onClick={() => setMessage('')}><X size={15} /></button></div>}
    {cfg.graph && <div className="admin-panel admin-graph-panel"><div className="admin-panel-head"><div><h2>Đồ thị quan hệ</h2><p>Mẫu xem tối đa 28 liên kết hiện có.</p></div><span className="admin-mini-tag">{cfg.collection}</span></div><MiniSkillGraph rows={rows} relation={cfg.collection} /></div>}
    <div className="admin-panel admin-table-panel">
      <div className="admin-table-toolbar"><div className="admin-table-title"><strong>{filtered.length.toLocaleString('vi-VN')} bản ghi</strong><span>Nguồn dữ liệu: ArangoDB · {cfg.collection}</span></div>
        <label className="admin-table-search"><Search size={16} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPageNo(1); }} placeholder="Tìm kiếm trong bảng" /></label>
        {(cfg.review || cfg.collection === 'courses') && <label className="admin-select-filter"><Filter size={15} /><select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPageNo(1); }}><option value="all">Tất cả trạng thái</option><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option></select></label>}
        {cfg.review && pending.length > 0 && <button className="admin-btn subtle" onClick={() => setMessage(`Có ${pending.length} mục chờ xử lý; hãy duyệt từng mục để lưu lý do và audit chính xác.`)}><Check size={16} /> Chờ duyệt ({pending.length})</button>}
      </div>
      <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả hàng trên trang" /></th>{cfg.columns.map((col) => <th key={col}><button className="admin-sort"><span>{col.replace(/_/g, ' ')}</span><ArrowDownUp size={13} /></button></th>)}{cfg.review && <th>Trạng thái</th>}<th>Thao tác</th></tr></thead><tbody>
        {visible.map((row) => <tr key={row._key}><td><input type="checkbox" aria-label={`Chọn ${titleOf(row, cfg.collection)}`} /></td>{cfg.columns.map((col, index) => <td key={col} className={index === 0 ? 'primary-cell' : ''}>{col === '_from' || col === '_to' ? <span className="admin-code">{label(row, col)}</span> : col.endsWith('url') || col === 'canonical_url' ? <span title={label(row, col)}>{label(row, col).slice(0, 38)}</span> : <span title={label(row, col)}>{label(row, col).slice(0, 72)}</span>}</td>)}{cfg.review && <td><span className={`admin-status ${reviewOf(row)}`}>{reviewOf(row) === 'approved' ? <Check size={13} /> : null}{statusText[reviewOf(row)]}</span></td>}<td><div className="admin-row-actions"><button title="Xem chi tiết" onClick={() => { setSelected(row); setModal('detail'); }}><Eye size={16} /></button><button title="Chỉnh sửa" onClick={() => openForm(row)}><Pencil size={15} /></button>{cfg.review && reviewOf(row) !== 'approved' && <button className="approve" title="Duyệt" onClick={() => setConfirm({ row, action: 'approved' })}><Check size={16} /></button>}{cfg.review && reviewOf(row) !== 'rejected' && <button className="reject" title="Từ chối" onClick={() => setConfirm({ row, action: 'rejected' })}><X size={16} /></button>}<button className="delete" title="Xóa" onClick={() => setConfirm({ row, action: 'delete' })}><Trash2 size={15} /></button><button title="Thêm tùy chọn" onClick={() => { setSelected(row); setModal('detail'); }}><MoreHorizontal size={16} /></button></div></td></tr>)}
        {!visible.length && <tr><td colSpan={cfg.columns.length + (cfg.review ? 3 : 2)}><div className="admin-empty"><span className="admin-empty-icon"><Search size={19} /></span><strong>Không tìm thấy bản ghi</strong><p>Thử từ khóa hoặc bộ lọc khác.</p></div></td></tr>}
      </tbody></table></div>
      <div className="admin-table-footer"><span>Hiển thị {filtered.length ? (pageNo - 1) * pageSize + 1 : 0}–{Math.min(pageNo * pageSize, filtered.length)} / {filtered.length.toLocaleString('vi-VN')}</span><div className="admin-pagination"><button disabled={pageNo <= 1} onClick={() => setPageNo(pageNo - 1)} aria-label="Trang trước"><ChevronLeft size={17} /></button><span>{pageNo} / {count}</span><button disabled={pageNo >= count} onClick={() => setPageNo(pageNo + 1)} aria-label="Trang sau"><ChevronRight size={17} /></button></div></div>
    </div>
    {modal === 'new' || modal === 'edit' ? <div className="admin-modal-backdrop"><form className="admin-modal admin-editor" onSubmit={save}><button type="button" className="admin-modal-close" onClick={() => setModal(null)}><X size={18} /></button><span className="admin-modal-icon"><Pencil size={19} /></span><h2>{modal === 'edit' ? 'Chỉnh sửa bản ghi' : 'Thêm bản ghi mới'}</h2><p>Thay đổi sẽ được lưu trực tiếp vào ArangoDB.</p><div className="admin-editor-grid">{cfg.fields.map((field) => <label className={`admin-form-field${field.multiline ? ' wide' : ''}`} key={field.key}>{field.label}{field.type === 'select' ? <select required={field.required} value={form[field.key] || ''} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}><option value="">Chọn…</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : field.multiline ? <textarea required={field.required} value={form[field.key] || ''} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} /> : <input required={field.required} type={field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : 'text'} value={form[field.key] || ''} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} />}</label>)}</div>{formError && <div className="admin-form-error">{formError}</div>}<div className="admin-modal-actions"><button type="button" className="admin-btn" disabled={saving} onClick={() => setModal(null)}>Hủy</button><button className="admin-btn primary" type="submit" disabled={saving}><Check size={16} /> {saving ? 'Đang lưu…' : 'Lưu vào ArangoDB'}</button></div></form></div> : null}
    {modal === 'detail' && selected && <div className="admin-modal-backdrop"><div className="admin-modal admin-detail"><button type="button" className="admin-modal-close" onClick={() => setModal(null)}><X size={18} /></button><span className="admin-eyebrow">{cfg.collection} · {selected._key}</span><h2>{titleOf(selected, cfg.collection)}</h2><p>Chi tiết bản ghi đang xem</p><pre>{JSON.stringify(selected, null, 2)}</pre><div className="admin-modal-actions"><button type="button" className="admin-btn" onClick={() => setModal(null)}>Đóng</button><button type="button" className="admin-btn primary" onClick={() => openForm(selected)}><Pencil size={15} /> Chỉnh sửa</button></div></div></div>}
    <ConfirmModal open={!!confirm} title={confirm?.action === 'delete' ? 'Xóa bản ghi này?' : confirm?.action === 'approved' ? 'Duyệt bản ghi?' : confirm?.action === 'rejected' ? 'Từ chối bản ghi?' : 'Chuyển sang chờ duyệt?'} description={confirm ? titleOf(confirm.row, cfg.collection) : undefined} confirmText={saving ? 'Đang xử lý…' : confirm?.action === 'delete' ? 'Xóa khỏi ArangoDB' : 'Xác nhận'} danger={confirm?.action === 'delete' || confirm?.action === 'rejected'} requireReason={confirm?.action === 'delete' || confirm?.action === 'rejected'} busy={saving} onCancel={() => { if (!saving) setConfirm(null); }} onConfirm={confirmAction} />
  </div>;
}

