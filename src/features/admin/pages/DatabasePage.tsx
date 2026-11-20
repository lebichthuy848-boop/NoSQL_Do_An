import { useMemo, useState } from 'react';
import { Database, Download, HardDrive, Layers3, RefreshCw, Server } from 'lucide-react';
import { authRequest } from '../../auth/AuthProvider';
import { useAdminStore } from '../store/adminStore';
import type { AdminRecord } from '../types/admin';

const idSet = (rows: AdminRecord[], collection: string) => new Set(rows.flatMap((row) => [String(row._id || ''), `${collection}/${row._key}`]));
export default function DatabasePage() {
  const careers = useAdminStore((s) => s.records.careers || []);
  const skills = useAdminStore((s) => s.records.skills || []);
  const providers = useAdminStore((s) => s.records.providers || []);
  const courses = useAdminStore((s) => s.records.courses || []);
  const teaches = useAdminStore((s) => s.records.teaches || []);
  const offeredBy = useAdminStore((s) => s.records.offered_by || []);
  const requires = useAdminStore((s) => s.records.requires_skill || []);
  const prerequisite = useAdminStore((s) => s.records.prerequisite || []);
  const catalogStatus = useAdminStore((s) => s.catalogStatus);
  const catalogDatabase = useAdminStore((s) => s.catalogDatabase);
  const loadLiveCatalog = useAdminStore((s) => s.loadLiveCatalog);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const collections = [
    { name: 'careers', count: careers.length, edges: false },
    { name: 'skills', count: skills.length, edges: false },
    { name: 'providers', count: providers.length, edges: false },
    { name: 'courses', count: courses.length, edges: false },
    { name: 'teaches', count: teaches.length, edges: true },
    { name: 'offered_by', count: offeredBy.length, edges: true },
    { name: 'requires_skill', count: requires.length, edges: true },
    { name: 'skill_prerequisite', count: prerequisite.length, edges: true },
  ];
  const all = collections.reduce((sum, row) => sum + row.count, 0);
  const integrity = useMemo(() => {
    const careerIds = idSet(careers, 'careers');
    const skillIds = idSet(skills, 'skills');
    const courseIds = idSet(courses, 'courses');
    const providerIds = idSet(providers, 'providers');
    const danglingRequires = requires.filter((edge) => !careerIds.has(String(edge._from)) || !skillIds.has(String(edge._to)));
    const danglingTeaches = teaches.filter((edge) => !courseIds.has(String(edge._from)) || !skillIds.has(String(edge._to)));
    const danglingProviders = offeredBy.filter((edge) => !courseIds.has(String(edge._from)) || !providerIds.has(String(edge._to)));
    return danglingRequires.length + danglingTeaches.length + danglingProviders.length;
  }, [careers, skills, providers, courses, teaches, offeredBy, requires]);
  const exportJson = async () => {
    setExportError(''); setExporting(true);
    try {
      const payload = await authRequest<{ database: string; collections: Record<string, unknown[]> }>('admin/export');
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${payload.database || 'skillgraph'}-database-export.json`; link.click(); URL.revokeObjectURL(url);
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : 'Không xuất được dữ liệu ArangoDB.'); }
    finally { setExporting(false); }
  };
  const live = catalogStatus === 'live';
  return <div className="admin-page"><div className="admin-page-heading"><div><div className="admin-eyebrow">DATABASE OPERATIONS</div><h1>Quản trị Database</h1><p>Thống kê các collection danh mục được nạp từ database hiện tại.</p></div><div className="admin-heading-actions"><button className="admin-btn" onClick={() => void loadLiveCatalog()}><RefreshCw size={15} /> Đồng bộ lại</button><button className="admin-btn" onClick={() => void exportJson()} disabled={exporting}><Download size={16} /> {exporting ? 'Đang xuất…' : 'Export JSON'}</button></div></div>
    {exportError && <div className="admin-users-error" role="alert">{exportError}<button className="admin-btn" onClick={() => setExportError('')}>Đóng</button></div>}
    <div className="admin-db-summary"><div><span><Server size={18} /></span><small>Database</small><strong>{live ? catalogDatabase : 'ArangoDB · chưa đồng bộ'}</strong><i className="admin-db-note">{live ? 'Đọc và ghi trực tiếp qua API' : 'Dữ liệu chưa đồng bộ'}</i></div><div><span><Layers3 size={18} /></span><small>Collections danh mục</small><strong>{collections.length}</strong><i className="admin-db-note">{all.toLocaleString('vi-VN')} documents & edges</i></div><div><span><HardDrive size={18} /></span><small>Dangling endpoints</small><strong>{integrity}</strong><i className={integrity ? 'admin-db-warning' : 'admin-db-note'}>{integrity ? 'Cần rà soát quan hệ' : live ? 'Không phát hiện trong quan hệ cốt lõi' : 'Kiểm tra trên dữ liệu hiện có'}</i></div></div>
    <section className="admin-panel"><div className="admin-panel-head"><div><h2>Collections danh mục</h2><p>Số lượng được đọc từ backend của ứng dụng.</p></div><button className="admin-icon-button" onClick={() => void loadLiveCatalog()} aria-label="Đồng bộ dữ liệu từ ArangoDB"><RefreshCw size={16} /></button></div><div className="admin-collection-grid">{collections.map((collection) => <div className="admin-collection-card" key={collection.name}><span className={collection.edges ? 'edge' : ''}><Database size={16} /></span><div><strong>{collection.name}</strong><small>{collection.edges ? 'Edge collection' : 'Document collection'}</small></div><b>{collection.count.toLocaleString('vi-VN')}</b></div>)}</div></section>
  </div>;
}
