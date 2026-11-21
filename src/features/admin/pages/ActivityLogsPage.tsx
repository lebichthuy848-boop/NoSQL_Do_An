import { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { apiRequest } from '../../../api/http';

type AuditEvent = { _key: string; actor_key?: string | null; event_type: string; metadata?: Record<string, unknown>; created_at: string };
export default function ActivityLogsPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try {
      const result = await apiRequest<AuditEvent[]>('/admin/audit-log?page=1&pageSize=100');
      setEvents(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được nhật ký quản trị.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const rows = useMemo(() => events.filter((event) => `${event.actor_key || ''} ${event.event_type} ${JSON.stringify(event.metadata || {})}`.toLowerCase().includes(query.toLowerCase())), [events, query]);
  function exportCsv() {
    const body = ['time,actor,event,metadata', ...rows.map((event) => [event.created_at, event.actor_key || '', event.event_type, JSON.stringify(event.metadata || {})].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'skillgraph-admin-audit-log.csv'; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="admin-page"><div className="admin-page-heading"><div><div className="admin-eyebrow">AUDIT LOG</div><h1>Nhật ký quản trị</h1><p>Sự kiện lấy từ app_audit_log qua API Backend.</p></div><button className="admin-btn" onClick={exportCsv} disabled={!rows.length}><Download size={16} /> Xuất CSV</button></div>
    <section className="admin-panel admin-table-panel"><div className="admin-table-toolbar"><div className="admin-table-title"><strong>{loading ? 'Đang tải…' : `${rows.length} sự kiện`}</strong><span>Nguồn: API `/admin/audit-log`</span></div><label className="admin-table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm actor, loại sự kiện, metadata" /></label></div>
      {error && <div className="admin-form-error" role="alert">{error}<button className="admin-btn" onClick={() => void load()}>Thử lại</button></div>}
      <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Actor</th><th>Sự kiện</th><th>Metadata</th><th>Thời gian</th></tr></thead><tbody>
        {rows.map((event) => <tr key={event._key}><td><code>{event.actor_key || 'system'}</code></td><td className="primary-cell">{event.event_type}</td><td><code>{JSON.stringify(event.metadata || {})}</code></td><td>{new Date(event.created_at).toLocaleString('vi-VN')}</td></tr>)}
        {!loading && !rows.length && <tr><td colSpan={4}><div className="admin-empty"><strong>{error ? 'Không tải được nhật ký' : 'Chưa có sự kiện'}</strong><p>{error || 'Backend chưa trả về audit event.'}</p></div></td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
