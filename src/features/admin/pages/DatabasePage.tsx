import { useAdminStore } from '../store/adminStore';
import { latestIntegritySnapshot } from '../integritySnapshot';
import { Database, HardDrive, RefreshCw, Server } from 'lucide-react';

const groupLabels = [
  { key: 'core', title: 'Collection lõi', detail: 'Dữ liệu Batch 2, chỉ đọc qua ứng dụng.' },
  { key: 'application', title: 'Collection app_*', detail: 'Hồ sơ, phiên, audit và draft của ứng dụng.' },
  { key: 'system', title: 'System collections', detail: 'Collection do ArangoDB quản lý.' },
] as const;

export default function DatabasePage() {
  const status = useAdminStore((state) => state.databaseStatus);
  const state = useAdminStore((store) => store.catalogStatus);
  const error = useAdminStore((store) => store.catalogError);
  const load = useAdminStore((store) => store.loadLiveCatalog);
  const live = state === 'live' && status?.status === 'available';
  const groups = status?.collectionGroups;
  const snapshotMatches = Boolean(live && status?.database === latestIntegritySnapshot.database && status.version === latestIntegritySnapshot.version && groups?.core.names.length === latestIntegritySnapshot.coreCollectionNames.length && groups.core.names.every((name, index) => name === latestIntegritySnapshot.coreCollectionNames[index]));
  return <div className="admin-page">
    <div className="admin-page-heading">
      <div><div className="admin-eyebrow">DATABASE STATUS</div><h1>Trạng thái Database</h1><p>Thông tin kết nối và danh sách collection chỉ đọc do Backend cung cấp.</p></div>
      <button className="admin-btn" onClick={() => void load()} disabled={state === 'loading'}><RefreshCw size={15} /> {state === 'loading' ? 'Đang kiểm tra…' : 'Kiểm tra lại'}</button>
    </div>
    {error && <div className="admin-form-error" role="alert">{error}</div>}

    <div className="admin-db-summary">
      <div><span><Server size={18} /></span><small>Kết nối</small><strong>{live ? 'ArangoDB · sẵn sàng' : state === 'loading' ? 'Đang kiểm tra…' : 'Chưa kết nối'}</strong><i className="admin-db-note">{live ? `Phiên bản ${status.version}` : 'Trạng thái từ API /admin/database/status'}</i></div>
      <div><span><Database size={18} /></span><small>Database</small><strong>{status?.database || '—'}</strong><i className="admin-db-note">Tên database không bao gồm thông tin xác thực</i></div>
      <div><span><HardDrive size={18} /></span><small>Tổng collections</small><strong>{status ? status.collectionCount.toLocaleString('vi-VN') : '—'}</strong><i className="admin-db-note">Tổng này gồm collection lõi, app_* và system</i></div>
    </div>

    <section className="admin-panel">
      <div className="admin-panel-head"><div><h2>Phân loại collections</h2><p>Tổng collection không đồng nghĩa với số collection lõi của Batch 2.</p></div></div>
      <div className="admin-db-summary">
        {groupLabels.map((group) => {
          const value = groups?.[group.key];
          return <div key={group.key}><span><Database size={18} /></span><small>{group.title}</small><strong>{value ? value.count.toLocaleString('vi-VN') : '—'}</strong><i className="admin-db-note">{group.detail}</i></div>;
        })}
      </div>
      <div className="admin-inline-empty"><span><Database size={18} /></span><div><strong>Vì sao tổng có thể là 41?</strong><small>Số 41 là tổng của ba nhóm hiển thị ở trên. Baseline chỉ tính nhóm collection lõi; các collection app_* và system không cộng vào số liệu lõi. Nếu số nhóm hoặc tổng khác dự kiến, hãy kiểm tra lại DB và port trước khi demo.</small></div></div>
      {groups && <details className="admin-collection-details">
        <summary>Xem tên collection theo nhóm</summary>
        {groupLabels.map((group) => <div key={group.key}><strong>{group.title} ({groups[group.key].count})</strong><small>{groups[group.key].names.join(', ') || 'Không có collection'}</small></div>)}
      </details>}
    </section>

    <section className="admin-panel">
      <div className="admin-panel-head"><div><h2>Integrity</h2><p>Ảnh chụp audit đầy đủ có mốc thời gian; trạng thái kết nối không tự được coi là kết quả integrity.</p></div></div>
      {snapshotMatches ? <div className="admin-integrity-result">
        <HardDrive size={18} /><div><strong>Audit snapshot PASS · {new Date(latestIntegritySnapshot.generatedAt).toLocaleString('vi-VN')}</strong><small>{latestIntegritySnapshot.summary.coreCollections} collection lõi, {latestIntegritySnapshot.summary.documentsAndEdges.toLocaleString('vi-VN')} document/edge, {latestIntegritySnapshot.summary.approvedEvidencePrerequisites} prerequisite có chứng cứ, recommendation gates không vi phạm. Bản audit đầy đủ: docs/evidence/integrity-audit-e2e-2026-11-21.json.</small><small>Đây là kết quả tại thời điểm audit, không phải kiểm tra nội dung realtime. Trạng thái hiện tại chỉ đối chiếu DB, phiên bản và tên collection; chạy lại audit trước khi báo cáo nếu dữ liệu lõi thay đổi.</small><small>Ba fingerprint lịch sử của careers/skills/requires_skill chưa tái lập được bằng phương pháp hiện tại; source và live khớp trong audit canonical. Xem biên bản nghiệm thu để biết chi tiết.</small></div>
      </div> : <div className="admin-integrity-result warning">
        <HardDrive size={18} /><div><strong>{live ? 'Audit snapshot không áp dụng cho cấu hình hiện tại' : 'Chưa có kết quả integrity áp dụng được'}</strong><small>Snapshot PASS chỉ áp dụng cho {latestIntegritySnapshot.database} · ArangoDB {latestIntegritySnapshot.version} với đúng danh sách collection lõi. Xác minh target rồi chạy lại audit để cập nhật kết quả.</small></div>
      </div>}
    </section>

    <section className="admin-panel">
      <div className="admin-panel-head"><div><h2>Import/Export và Backup/Restore (offline)</h2><p>Không có thao tác restore trực tiếp hoặc endpoint HTTP ghi đè Database.</p></div></div>
      <div className="admin-inline-empty"><span><HardDrive size={18} /></span><div><strong>Dùng quy trình có kiểm soát trong runbook</strong><small>Backup, list và verify dùng <code>backend/scripts/backup-db.ps1</code>. Import/export hoặc restore chỉ thực hiện trên DB/collection test cô lập; restore phải vào clone mới, không dùng volume demo hoặc collection lõi.</small></div></div>
    </section>

    {status?.checkedAt && <small>Kiểm tra lúc {new Date(status.checkedAt).toLocaleString('vi-VN')}</small>}
  </div>;
}
