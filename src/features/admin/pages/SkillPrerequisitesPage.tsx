import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Network, RefreshCw, Search } from 'lucide-react';
import { apiRequest } from '../../../api/http';

type SkillPrerequisite = {
  key: string;
  dependentSkillId: string;
  dependentSkillName: string;
  foundationSkillId: string;
  foundationSkillName: string;
  direction: 'dependent → foundation';
  status: 'approved';
  source: string | null;
  sourceReviewStatus: string | null;
  evidenceScope: string | null;
  sourceUrl: string;
};

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export default function SkillPrerequisitesPage() {
  const [rows, setRows] = useState<SkillPrerequisite[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<SkillPrerequisite[]>('/admin/skill-prerequisites', { signal });
      setRows(result);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được quan hệ prerequisite từ Backend.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('vi');
    if (!needle) return rows;
    return rows.filter((row) => [
      row.dependentSkillName,
      row.dependentSkillId,
      row.foundationSkillName,
      row.foundationSkillId,
      row.source,
      row.sourceReviewStatus,
      row.evidenceScope,
      row.sourceUrl,
    ].some((value) => value?.toLocaleLowerCase('vi').includes(needle)));
  }, [rows, search]);

  return <div className="admin-page">
    <div className="admin-page-heading">
      <div>
        <div className="admin-eyebrow">PREREQUISITE · READ ONLY</div>
        <h1>Tiên quyết kỹ năng</h1>
        <p>Chỉ hiển thị quan hệ đã duyệt, có nguồn chứng cứ. Chiều cạnh là kỹ năng phụ thuộc → kỹ năng nền tảng.</p>
      </div>
      <button className="admin-btn" onClick={() => void load()} disabled={loading}>
        <RefreshCw size={15} /> {loading ? 'Đang tải…' : 'Tải lại'}
      </button>
    </div>

    <section className="admin-table-panel">
      <div className="admin-table-toolbar">
        <div className="admin-table-title">
          <strong>Quan hệ đã duyệt</strong>
          <span>{loading ? 'Đang truy vấn Backend…' : `${filtered.length} / ${rows.length} quan hệ`}</span>
        </div>
        <label className="admin-table-search">
          <Search size={14} />
          <input aria-label="Tìm kỹ năng hoặc nguồn chứng cứ" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm kỹ năng, nguồn…" />
        </label>
      </div>

      {error && <div className="admin-form-error" role="alert">{error}<button className="admin-btn" onClick={() => void load()}>Thử lại</button></div>}
      {loading && <div className="admin-empty" role="status"><span className="admin-empty-icon"><Network size={18} /></span><strong>Đang tải quan hệ prerequisite</strong><p>Backend chỉ đọc các cạnh đã duyệt và có nguồn chứng cứ.</p></div>}
      {!loading && !error && rows.length === 0 && <div className="admin-empty"><span className="admin-empty-icon"><Network size={18} /></span><strong>Chưa có quan hệ đạt điều kiện hiển thị</strong><p>Không tạo hoặc sửa cạnh nào trong collection lõi.</p></div>}
      {!loading && !error && rows.length > 0 && filtered.length === 0 && <div className="admin-empty"><strong>Không tìm thấy kết quả</strong><p>Thử từ khóa kỹ năng hoặc nguồn chứng cứ khác.</p></div>}
      {!loading && !error && filtered.length > 0 && <div className="admin-table-wrap">
        <table className="admin-data-table admin-prerequisite-table">
          <thead><tr><th>Kỹ năng phụ thuộc</th><th>Chiều quan hệ</th><th>Kỹ năng nền tảng</th><th>Trạng thái</th><th>Nguồn chứng cứ</th></tr></thead>
          <tbody>{filtered.map((row) => {
            const href = safeExternalUrl(row.sourceUrl);
            return <tr key={row.key}>
              <td><strong>{row.dependentSkillName}</strong><small>{row.dependentSkillId}</small></td>
              <td>{row.direction}</td>
              <td><strong>{row.foundationSkillName}</strong><small>{row.foundationSkillId}</small></td>
              <td><span className="admin-status approved">Đã duyệt</span>{row.sourceReviewStatus && <small>{row.sourceReviewStatus}</small>}</td>
              <td>
                <strong>{row.source || 'Nguồn đã ghi nhận'}</strong>
                {href ? <a href={href} target="_blank" rel="noreferrer" className="admin-prerequisite-source">Mở chứng cứ <ExternalLink size={12} /></a> : <small>Không có URL HTTP(S) hợp lệ</small>}
                {row.evidenceScope && <small>{row.evidenceScope}</small>}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
