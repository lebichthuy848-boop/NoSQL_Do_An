import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Check, CirclePlus, Eye, Filter, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { apiRequest } from '../../../api/http';
import type { AdminRecord, FieldSpec } from '../types/admin';
import type { AdminOutlet } from './AdminLayout';
import { RequestGeneration } from '../../../utils/requestGeneration';

type Page = 'careers' | 'skills' | 'providers' | 'courses' | 'course-skill-mappings' | 'career-skills' | 'skill-prerequisites';
type DraftRoute = { base: string; fields: FieldSpec[]; columns: string[]; title: string; eyebrow: string; description: string };
const draftRoutes: Partial<Record<Page, DraftRoute>> = {
  providers: { base: '/admin/providers', title: 'Nhà cung cấp đề xuất', eyebrow: 'PROVIDER DRAFTS', description: 'Nhà cung cấp mới được tạo dưới dạng draft trong app_* và cần bằng chứng trước khi phê duyệt.', fields: [{ key: 'name', label: 'Tên nhà cung cấp', required: true }, { key: 'officialWebsite', label: 'Website chính thức', type: 'url', required: true }], columns: ['name', 'officialWebsite'] },
  courses: { base: '/admin/resources', title: 'Học liệu đề xuất', eyebrow: 'RESOURCE DRAFTS', description: 'Học liệu đề xuất được lưu riêng trong app_*; chỉ được đề xuất sau khi qua cổng duyệt nguồn.', fields: [{ key: 'title', label: 'Tên học liệu', required: true }, { key: 'canonicalUrl', label: 'URL chính thức', type: 'url', required: true }, { key: 'providerName', label: 'Nhà cung cấp đã có', required: true }, { key: 'resourceType', label: 'Loại học liệu', required: true }, { key: 'language', label: 'Ngôn ngữ' }], columns: ['title', 'providerName', 'resourceType', 'language'] },
  'course-skill-mappings': { base: '/admin/mappings', title: 'Mapping học liệu – kỹ năng (draft)', eyebrow: 'MAPPING DRAFTS', description: 'Mapping là draft riêng. Muốn xuất hiện trong gợi ý, cả học liệu và mapping phải được duyệt độc lập.', fields: [{ key: 'resourceId', label: 'ID draft học liệu', required: true }, { key: 'skillId', label: 'ID kỹ năng catalog', required: true }], columns: ['resourceId', 'skillId', 'evidenceScope'] },
};
const readAll = async (path: string, status: string) => {
  const all: AdminRecord[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const query = new URLSearchParams({ page: String(page), pageSize: '100' });
    if (status !== 'all') query.set('status', status);
    const rows = await apiRequest<Record<string, unknown>[]>(`${path}?${query}`);
    all.push(...rows.map((row) => ({ ...row, _key: String(row.key || row._key || row.id || '') })));
    if (rows.length < 100) break;
  }
  return all;
};
const readPublic = async (path: string): Promise<AdminRecord[]> => {
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const batch = await apiRequest<Record<string, unknown>[]>(`${path}?page=${page}&pageSize=100`);
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows.map((row): AdminRecord => ({ ...row, _key: String(row.key || row._key || row.id || '') }));
};
const label = (row: AdminRecord, key: string) => String(row[key] ?? '—');
const titleOf = (row: AdminRecord) => String(row.title || row.name || row._key || 'Bản ghi');
const statusLabel: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };

export default function AdminTablePage({ page }: { page: Page }) {
  const { search: globalSearch } = useOutletContext<AdminOutlet>();
  const draft = draftRoutes[page];
  const [rows, setRows] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageNo, setPageNo] = useState(1);
  const [modal, setModal] = useState<'new' | 'edit' | 'detail' | 'review' | null>(null);
  const [selected, setSelected] = useState<AdminRecord | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [reviewForm, setReviewForm] = useState({ evidenceUrl: '', evidenceScope: 'direct_topic', sourceSummary: '', mappingQualityDecision: '' });
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const loadGeneration = useRef(new RequestGeneration());

  async function loadRows() {
    const generation = loadGeneration.current.next();
    setLoading(true); setError('');
    try {
      let result: AdminRecord[] = [];
      if (page === 'careers') result = await readPublic('/careers');
      else if (page === 'skills') result = await readPublic('/skills');
      else if (page === 'career-skills') {
        const careers = await readPublic('/careers');
        const groups = await Promise.all(careers.map(async (career) => {
          const requirements = await apiRequest<Record<string, unknown>[]>(`/careers/${encodeURIComponent(String(career.key || career._key))}/skills`);
          return requirements.map((item) => ({ ...item, _key: String(item.key || item.id || ''), careerName: career.name, skillName: (item.skill as Record<string, unknown> | undefined)?.name || item.to, requirementType: item.requirementType, _from: item.from, _to: item.to }));
        }));
        result = groups.flat();
      } else if (draft) result = await readAll(draft.base, statusFilter);
      if (!loadGeneration.current.isCurrent(generation)) return;
      setRows(result); setPageNo(1);
    } catch (cause) {
      if (!loadGeneration.current.isCurrent(generation)) return;
      setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu từ Backend.');
      setRows([]);
    } finally { if (loadGeneration.current.isCurrent(generation)) setLoading(false); }
  }
  useEffect(() => {
    void loadRows();
    return () => loadGeneration.current.invalidate();
  }, [page, statusFilter]);

  const query = `${search} ${globalSearch}`.trim().toLowerCase();
  const filtered = useMemo(() => rows.filter((row) => { const matches = !query || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query)); const state = String(row.status || (row.recommendationEligible === true ? 'approved' : 'pending')); return matches && (statusFilter === 'all' || state === statusFilter); }), [rows, query, statusFilter]);
  const pageSize = 10, count = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((pageNo - 1) * pageSize, pageNo * pageSize);
  const columns = draft?.columns || (page === 'careers' ? ['name', 'careerGroup', 'iscoGroup'] : page === 'skills' ? ['name', 'skillType', 'reuseLevel'] : ['careerName', 'skillName', 'requirementType']);
  const title = draft?.title || (page === 'careers' ? 'Danh mục nghề nghiệp (chỉ đọc)' : page === 'skills' ? 'Danh mục kỹ năng (chỉ đọc)' : 'Career–Skill (chỉ đọc)');
  const eyebrow = draft?.eyebrow || (page === 'careers' ? 'CAREER CATALOG · READ ONLY' : page === 'skills' ? 'SKILL CATALOG · READ ONLY' : 'REQUIRES SKILL · READ ONLY');
  const description = draft?.description || (page === 'careers' ? 'Dữ liệu được đọc trực tiếp từ ArangoDB Batch 2. Backend chưa hỗ trợ CRUD nghề nghiệp.' : page === 'skills' ? 'Dữ liệu được đọc trực tiếp từ ArangoDB Batch 2. Backend chưa hỗ trợ CRUD kỹ năng.' : 'Quan hệ được đọc từ API career skills. Backend chưa hỗ trợ ghi Career–Skill vào dữ liệu lõi.');
  const editable = Boolean(draft);
  const statusOf = (row: AdminRecord) => String(row.status || (row.recommendationEligible === true ? 'approved' : 'pending'));

  function openForm(row?: AdminRecord) {
    if (!draft) return;
    setSelected(row || null);
    setForm(Object.fromEntries(draft.fields.map((field) => [field.key, String(row?.[field.key] ?? '')])));
    setFormError(''); setModal(row ? 'edit' : 'new');
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    setSaving(true); setFormError('');
    const body: Record<string, string> = Object.fromEntries(draft.fields.map((field) => [field.key, (form[field.key] || '').trim()]));
    if (page === 'courses' && !body.language) body.language = 'unknown';
    try {
      const method = modal === 'edit' ? 'PATCH' : 'POST';
      const endpoint = modal === 'edit' && selected ? `${draft.base}/${encodeURIComponent(selected._key)}` : draft.base;
      await apiRequest(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setMessage(modal === 'edit' ? 'Draft đã được cập nhật trong Backend.' : 'Draft đã được tạo trong Backend.');
      setModal(null); await loadRows();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Backend không lưu được draft.'); }
    finally { setSaving(false); }
  }
  async function deleteDraft(row: AdminRecord) {
    if (!draft || statusOf(row) !== 'pending' || !window.confirm(`Xóa draft “${titleOf(row)}”?`)) return;
    setSaving(true); setFormError('');
    try {
      await apiRequest(`${draft.base}/${encodeURIComponent(row._key)}`, { method: 'DELETE' });
      setMessage('Draft đã được xóa.'); await loadRows();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Backend không xóa được draft.'); }
    finally { setSaving(false); }
  }
  async function submitReview(event: FormEvent) {
    event.preventDefault(); if (!draft || !selected) return;
    setSaving(true); setFormError('');
    const body = { decision, evidenceUrl: reviewForm.evidenceUrl.trim(), sourceSummary: reviewForm.sourceSummary.trim(), ...(page === 'course-skill-mappings' ? { evidenceScope: reviewForm.evidenceScope, ...(reviewForm.mappingQualityDecision ? { mappingQualityDecision: reviewForm.mappingQualityDecision } : {}) } : {}) };
    try {
      await apiRequest(`${draft.base}/${encodeURIComponent(selected._key)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setMessage(decision === 'approve' ? 'Backend đã ghi nhận quyết định duyệt và bằng chứng.' : 'Backend đã ghi nhận quyết định từ chối và bằng chứng.');
      setModal(null); await loadRows();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Backend không hoàn tất xét duyệt.'); }
    finally { setSaving(false); }
  }

  if (page === 'skill-prerequisites') return <div className="admin-page"><div className="admin-page-heading"><div><div className="admin-eyebrow">PREREQUISITE · READ ONLY</div><h1>Skill Prerequisite</h1><p>Backend hiện không cung cấp API liệt kê hoặc CRUD prerequisite. Để bảo vệ dữ liệu lõi, trang này không hiển thị snapshot và không nhận thao tác ghi.</p></div></div><div className="admin-empty"><strong>Chưa hỗ trợ API prerequisite</strong><p>Learning Path chỉ sử dụng các quan hệ đã duyệt, có nguồn chứng cứ theo API Backend.</p></div></div>;

  return <div className="admin-page">
    <div className="admin-page-heading"><div><div className="admin-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{editable && <button className="admin-btn primary" onClick={() => openForm()}><CirclePlus size={17} /> Tạo draft</button>}</div>
    <div className="admin-panel admin-table-panel">
      <div className="admin-table-toolbar"><div className="admin-table-title"><strong>{loading ? 'Đang tải…' : `${filtered.length.toLocaleString('vi-VN')} bản ghi`}</strong><span>Nguồn: {editable ? 'API draft app_*' : 'API catalog ArangoDB'}</span></div>
        <label className="admin-table-search"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPageNo(1); }} placeholder="Tìm kiếm trong bảng" /></label>
        {editable && <label className="admin-select-filter"><Filter size={15} /><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPageNo(1); }}><option value="all">Tất cả trạng thái</option><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option></select></label>}
        <button className="admin-icon-button" onClick={() => void loadRows()} aria-label="Tải lại từ Backend"><RefreshCw size={16} /></button>
      </div>
      {error && <div className="admin-form-error" role="alert">{error}</div>}
      {message && <div className="admin-toast" role="status"><Check size={16} />{message}<button onClick={() => setMessage('')} aria-label="Đóng"><X size={15} /></button></div>}
      {editable && <p className="admin-preview-hint">Thao tác chỉ tạo hoặc xét duyệt draft trong app_*; dữ liệu nghề, kỹ năng và quan hệ lõi không được sửa tại đây.</p>}
      <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr>{columns.map((column) => <th key={column}>{column.replace(/[A-Z_]/g, (letter) => ` ${letter.toLowerCase()}`).trim()}</th>)}{editable && <th>Trạng thái</th>}<th>Thao tác</th></tr></thead><tbody>
        {visible.map((row) => <tr key={row._key}>{columns.map((column, index) => <td key={column} className={index === 0 ? 'primary-cell' : ''}><span title={label(row, column)}>{label(row, column).slice(0, 80)}</span></td>)}{editable && <td><span className={`admin-status ${statusOf(row)}`}>{statusLabel[statusOf(row)] || statusOf(row)}</span>{row.autoRecommendationAllowed === true && <small> · qua cổng mapping</small>}</td>}<td><div className="admin-row-actions"><button title="Xem chi tiết" onClick={() => { setSelected(row); setModal('detail'); }}><Eye size={16} /></button>{editable && statusOf(row) === 'pending' && <><button title="Sửa draft" onClick={() => openForm(row)}><Pencil size={15} /></button><button className="approve" title="Duyệt kèm bằng chứng" onClick={() => { setSelected(row); setDecision('approve'); setReviewForm({ evidenceUrl: '', evidenceScope: 'direct_topic', sourceSummary: '', mappingQualityDecision: '' }); setFormError(''); setModal('review'); }}><Check size={16} /></button><button className="reject" title="Từ chối kèm bằng chứng" onClick={() => { setSelected(row); setDecision('reject'); setReviewForm({ evidenceUrl: '', evidenceScope: 'direct_topic', sourceSummary: '', mappingQualityDecision: '' }); setFormError(''); setModal('review'); }}><X size={16} /></button><button className="delete" title="Xóa draft đang chờ" onClick={() => void deleteDraft(row)}><Trash2 size={15} /></button></>}</div></td></tr>)}
        {!loading && !visible.length && <tr><td colSpan={columns.length + (editable ? 2 : 1)}><div className="admin-empty"><span className="admin-empty-icon"><Search size={19} /></span><strong>{error ? 'Không tải được dữ liệu' : 'Chưa có bản ghi'}</strong><p>{error || (editable ? 'Không có draft phù hợp với bộ lọc.' : 'API không trả về bản ghi cho truy vấn này.')}</p></div></td></tr>}
      </tbody></table></div>
      <div className="admin-table-footer"><span>Hiển thị {filtered.length ? (pageNo - 1) * pageSize + 1 : 0}–{Math.min(pageNo * pageSize, filtered.length)} / {filtered.length.toLocaleString('vi-VN')}</span><div className="admin-pagination"><button disabled={pageNo <= 1} onClick={() => setPageNo(pageNo - 1)} aria-label="Trang trước">‹</button><span>{pageNo} / {count}</span><button disabled={pageNo >= count} onClick={() => setPageNo(pageNo + 1)} aria-label="Trang sau">›</button></div></div>
    </div>
    {(modal === 'new' || modal === 'edit') && draft && <div className="admin-modal-backdrop"><form className="admin-modal admin-editor" onSubmit={save}><button type="button" className="admin-modal-close" onClick={() => setModal(null)}><X size={18} /></button><span className="admin-modal-icon"><Pencil size={19} /></span><h2>{modal === 'edit' ? 'Sửa draft đang chờ' : 'Tạo draft mới'}</h2><p>Backend sẽ lưu thao tác trong các collection app_*.</p><div className="admin-editor-grid">{draft.fields.map((field) => <label className="admin-form-field" key={field.key}>{field.label}{field.type === 'select' ? <select required={field.required} value={form[field.key] || ''} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}><option value="">Chọn…</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input required={field.required} type={field.type === 'url' ? 'url' : 'text'} value={form[field.key] || ''} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} />}</label>)}</div>{formError && <div className="admin-form-error" role="alert">{formError}</div>}<div className="admin-modal-actions"><button type="button" className="admin-btn" disabled={saving} onClick={() => setModal(null)}>Hủy</button><button className="admin-btn primary" type="submit" disabled={saving}><Check size={16} />{saving ? 'Đang lưu…' : 'Lưu draft'}</button></div></form></div>}
    {modal === 'review' && selected && draft && <div className="admin-modal-backdrop"><form className="admin-modal admin-editor" onSubmit={submitReview}><button type="button" className="admin-modal-close" onClick={() => setModal(null)}><X size={18} /></button><span className="admin-modal-icon"><Check size={19} /></span><h2>{decision === 'approve' ? 'Duyệt draft' : 'Từ chối draft'}</h2><p>{titleOf(selected)} · ghi lại URL và ghi chú chứng cứ trong nhật ký quản trị.</p><div className="admin-editor-grid"><label className="admin-form-field wide">URL chứng cứ<input type="url" required value={reviewForm.evidenceUrl} onChange={(event) => setReviewForm({ ...reviewForm, evidenceUrl: event.target.value })} /></label>{page === 'course-skill-mappings' && <><label className="admin-form-field">Phạm vi chứng cứ<select required value={reviewForm.evidenceScope} onChange={(event) => setReviewForm({ ...reviewForm, evidenceScope: event.target.value })}><option value="direct_topic">direct_topic</option><option value="partial">partial</option></select></label>{decision === 'approve' && <label className="admin-form-field">Quyết định chất lượng mapping<select required value={reviewForm.mappingQualityDecision} onChange={(event) => setReviewForm({ ...reviewForm, mappingQualityDecision: event.target.value })}><option value="">Chọn quyết định…</option><option value="retain_with_scope">retain_with_scope</option><option value="retain_with_narrow_scope">retain_with_narrow_scope</option><option value="retain_with_scope_after_review">retain_with_scope_after_review</option><option value="retain_after_url_and_scope_review">retain_after_url_and_scope_review</option></select></label>}</>}<label className="admin-form-field wide">Tóm tắt chứng cứ<textarea required maxLength={2000} value={reviewForm.sourceSummary} onChange={(event) => setReviewForm({ ...reviewForm, sourceSummary: event.target.value })} /></label></div>{formError && <div className="admin-form-error" role="alert">{formError}</div>}<div className="admin-modal-actions"><button type="button" className="admin-btn" disabled={saving} onClick={() => setModal(null)}>Hủy</button><button className={`admin-btn ${decision === 'approve' ? 'primary' : 'danger'}`} type="submit" disabled={saving}>{saving ? 'Đang xử lý…' : decision === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}</button></div></form></div>}
    {modal === 'detail' && selected && <div className="admin-modal-backdrop"><div className="admin-modal admin-detail"><button type="button" className="admin-modal-close" onClick={() => setModal(null)}><X size={18} /></button><span className="admin-eyebrow">{draft?.base || page} · {selected._key}</span><h2>{titleOf(selected)}</h2><pre>{JSON.stringify(selected, null, 2)}</pre><div className="admin-modal-actions"><button type="button" className="admin-btn" onClick={() => setModal(null)}>Đóng</button></div></div></div>}
  </div>;
}
