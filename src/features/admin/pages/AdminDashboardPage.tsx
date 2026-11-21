import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, BookOpen, BriefcaseBusiness, Database, FileStack, Network, ShieldCheck, Users } from 'lucide-react';
import { apiRequest } from '../../../api/http';
import { useAuth } from '../../auth/AuthProvider';

type Metric = { covered: number; total: number; ratio: number };
type AdminStatistics = {
  users: { total: number; byStatus: Array<{ status: string; count: number }> };
  careers: number;
  skills: number;
  resources: { total: number; recommendationEligible: number };
  providers: number;
  mappings: { total: number; autoRecommendationAllowed: number };
  pendingReview: { resources: number; mappings: number };
  coverage: { overall: Metric; essential: Metric; optional: Metric; byCareer: Array<{ career: string; essential: Metric; optional: Metric }>; basis: string };
};
type AuditEvent = { _key: string; actor_key?: string | null; event_type: string; metadata?: Record<string, unknown>; created_at: string };
const icons = [Users, BriefcaseBusiness, Network, BookOpen, ShieldCheck, FileStack];
const palette = ['#6f61e8', '#22a7d7', '#ffae57'];
const percent = (metric: Metric) => `${Math.round(metric.ratio * 100)}%`;

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStatistics | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try {
      const [result, audit] = await Promise.all([
        apiRequest<AdminStatistics>('/admin/statistics'),
        apiRequest<AuditEvent[]>('/admin/audit-log?page=1&pageSize=5'),
      ]);
      setStats(result); setEvents(audit);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được thống kê từ Backend.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const cards = stats ? [
    { label: 'Người dùng', value: stats.users.total, sub: 'app_users', icon: icons[0], tone: 'violet' },
    { label: 'Nghề nghiệp', value: stats.careers, sub: 'Catalog ArangoDB', icon: icons[1], tone: 'blue' },
    { label: 'Kỹ năng', value: stats.skills, sub: 'Catalog ArangoDB', icon: icons[2], tone: 'cyan' },
    { label: 'Học liệu', value: stats.resources.total, sub: `${stats.resources.recommendationEligible} qua cổng học liệu`, icon: icons[3], tone: 'amber' },
    { label: 'Nhà cung cấp', value: stats.providers, sub: 'Catalog chính thức', icon: icons[4], tone: 'green' },
    { label: 'Teaches mapping', value: stats.mappings.total, sub: `${stats.mappings.autoRecommendationAllowed} qua cổng mapping`, icon: icons[5], tone: 'purple' },
  ] : [];
  const coverage = stats ? [
    { label: 'Overall', metric: stats.coverage.overall },
    { label: 'Essential', metric: stats.coverage.essential },
    { label: 'Optional', metric: stats.coverage.optional },
  ] : [];
  const pending = (stats?.pendingReview.resources || 0) + (stats?.pendingReview.mappings || 0);

  return <div className="admin-page admin-dashboard">
    <div className="admin-page-heading"><div><div className="admin-eyebrow">SYSTEM OVERVIEW</div><h1>Chào, {user?.name || 'Admin'} <span className="admin-wave">✦</span></h1><p>Thống kê được trả về từ Backend và ArangoDB.</p></div><div className="admin-heading-actions"><span className="admin-live-label"><i className={stats ? 'connected' : ''} /> {loading ? 'Đang tải…' : stats ? 'API · ArangoDB' : 'Không có dữ liệu live'}</span><button className="admin-btn" onClick={() => void load()} disabled={loading}>Tải lại</button><Link to="/admin/database" className="admin-btn"><Database size={16} /> Trạng thái DB</Link></div></div>
    {error && <div className="admin-form-error" role="alert">{error}</div>}
    {loading && !stats && <div className="admin-empty"><strong>Đang tải thống kê từ Backend…</strong></div>}
    {stats && <>
      <section className="admin-stat-grid">{cards.map((item) => <article className="admin-stat-card" key={item.label}><span className={`admin-stat-icon ${item.tone}`}><item.icon size={18} /></span><div className="admin-stat-value">{item.value.toLocaleString('vi-VN')}</div><div className="admin-stat-label">{item.label}</div><div className="admin-stat-sub">{item.sub}</div></article>)}</section>
      <section className="admin-coverage-strip"><div className="admin-panel-head"><div><h2>Độ bao phủ được duyệt</h2><p>Chỉ tính học liệu và mapping vượt qua cả hai cổng recommendation.</p></div><Link to="/statistics">Xem thống kê <ArrowRight size={14} /></Link></div><div className="admin-coverage-cards">{coverage.map(({ label, metric }, index) => <div className="admin-coverage-card" key={label}><div><span>{label}</span><strong>{percent(metric)}</strong></div><div className="admin-progress"><i style={{ width: percent(metric), background: palette[index] }} /></div><small>{metric.covered.toLocaleString('vi-VN')} / {metric.total.toLocaleString('vi-VN')}</small></div>)}</div><small>{stats.coverage.basis}</small></section>
      <div className="admin-dashboard-bottom"><section className="admin-panel"><div className="admin-panel-head"><div><h2>Nhật ký quản trị gần đây</h2><p>Dữ liệu lấy từ app_audit_log qua API.</p></div><Link to="/admin/logs">Mở nhật ký <ArrowRight size={14} /></Link></div>{events.length ? <div className="admin-activity-list">{events.map((event) => <div className="admin-activity-row" key={event._key}><span className="admin-activity-icon"><Activity size={16} /></span><div><strong>{event.event_type}</strong><small>{event.actor_key || 'system'} · {JSON.stringify(event.metadata || {})}</small></div><time>{new Date(event.created_at).toLocaleString('vi-VN')}</time></div>)}</div> : <div className="admin-inline-empty"><span><Activity size={18} /></span><div><strong>Chưa có nhật ký</strong><small>Backend chưa trả về sự kiện quản trị.</small></div></div>}</section>
        <section className="admin-panel admin-queue-card"><div className="admin-panel-head"><div><h2>Hàng chờ duyệt</h2><p>Draft app-owned đang chờ xét duyệt.</p></div><span className="admin-queue-count">{pending}</span></div><p>{stats.pendingReview.resources} học liệu · {stats.pendingReview.mappings} mapping</p><Link className="admin-btn subtle" to="/admin/courses">Mở học liệu draft <ArrowRight size={15} /></Link></section></div>
      <div className="admin-panel"><h2>Trạng thái tài khoản</h2><p>{stats.users.byStatus.map((row) => `${row.status}: ${row.count}`).join(' · ') || 'Chưa có tài khoản'}</p></div>
    </>}
  </div>;
}
