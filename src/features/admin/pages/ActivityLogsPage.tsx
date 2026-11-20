import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useAdminStore } from '../store/adminStore';

export default function ActivityLogsPage() {
  const logs = useAdminStore((s) => s.logs); const [query, setQuery] = useState('');
  const rows = useMemo(() => logs.filter((log) => `${log.actor} ${log.action} ${log.target} ${log.result}`.toLowerCase().includes(query.toLowerCase())), [logs, query]);
  function exportCsv() { const body = ['time,actor,action,target,result,reason', ...rows.map((x) => [x.at, x.actor, x.action, x.target, x.result, x.reason || ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n'); const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'skillgraph-admin-activity.csv'; a.click(); URL.revokeObjectURL(url); }
  return <div className="admin-page"><div className="admin-page-heading"><div><div className="admin-eyebrow">ACTIVITY LOG</div><h1>Nhật ký hoạt động</h1><p>Thao tác được ghi nhận trong trình duyệt hiện tại.</p></div><button className="admin-btn" onClick={exportCsv}><Download size={16} /> Xuất CSV</button></div>
    <section className="admin-panel admin-table-panel"><div className="admin-table-toolbar"><div className="admin-table-title"><strong>{rows.length} sự kiện</strong><span>Lưu trên trình duyệt này</span></div><label className="admin-table-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm người thực hiện hoặc thao tác" /></label></div><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th><th>Thời gian</th><th>Kết quả</th><th>Lý do</th></tr></thead><tbody>{rows.map((log) => <tr key={log.id}><td>{log.actor}</td><td className="primary-cell">{log.action}</td><td><code>{log.target}</code></td><td>{new Date(log.at).toLocaleString('vi-VN')}</td><td><span className="admin-status approved">{log.result}</span></td><td>{log.reason || '—'}</td></tr>)}</tbody></table>{!rows.length && <div className="admin-empty"><strong>Chưa có nhật ký</strong><p>Thao tác quản trị sẽ xuất hiện tại đây sau khi thực hiện.</p></div>}</div></section>
  </div>;
}
