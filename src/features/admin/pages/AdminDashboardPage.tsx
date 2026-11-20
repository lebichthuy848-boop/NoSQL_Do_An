import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, BookOpen, BriefcaseBusiness, ChevronDown, ChevronUp, Database, FileStack, Network, ShieldCheck, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { authRequest, useAuth } from '../../auth/AuthProvider';
import { useAdminStore } from '../store/adminStore';
import type { AdminRecord } from '../types/admin';

const palette = ['#6f61e8', '#22a7d7', '#ffae57', '#4bbd91', '#bd79df'];
const otherColor = '#d9dce8';
const idOf = (row: AdminRecord, collection: string) => String(row._id || `${collection}/${row._key}`);

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const logs = useAdminStore((s) => s.logs);
  const records = useAdminStore((s) => s.records);
  const catalogStatus = useAdminStore((s) => s.catalogStatus);
  const catalogDatabase = useAdminStore((s) => s.catalogDatabase);
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);
  useEffect(() => { void authRequest<{ users: unknown[] }>('admin/users').then((result) => setUserCount(result.users.length)).catch(() => setUserCount(null)); }, []);
  const careers = records.careers || [];
  const skills = records.skills || [];
  const providers = records.providers || [];
  const courses = records.courses || [];
  const teaches = records.teaches || [];
  const requirements = records.requires_skill || [];
  const unique = (values: string[]) => new Set(values).size;

  const directSkillIds = new Set(teaches.filter((edge) => edge.evidence_scope === 'direct_topic').map((edge) => String(edge._to)));
  const essentialEdges = requirements.filter((edge) => edge.requirement_type === 'essential');
  const optionalEdges = requirements.filter((edge) => edge.requirement_type === 'optional');
  const coverageMetrics = [
    { name: 'Overall', covered: directSkillIds.size, total: skills.length, pct: skills.length ? Math.round(directSkillIds.size / skills.length * 100) : 0 },
    { name: 'Essential', covered: essentialEdges.filter((edge) => directSkillIds.has(String(edge._to))).length, total: essentialEdges.length, pct: essentialEdges.length ? Math.round(essentialEdges.filter((edge) => directSkillIds.has(String(edge._to))).length / essentialEdges.length * 100) : 0 },
    { name: 'Optional', covered: optionalEdges.filter((edge) => directSkillIds.has(String(edge._to))).length, total: optionalEdges.length, pct: optionalEdges.length ? Math.round(optionalEdges.filter((edge) => directSkillIds.has(String(edge._to))).length / optionalEdges.length * 100) : 0 },
  ];

  const coverageByCareer = useMemo(() => careers.map((career) => {
    const careerId = idOf(career, 'careers');
    const required = requirements.filter((edge) => String(edge._from) === careerId && edge.requirement_type === 'essential');
    const covered = required.filter((edge) => directSkillIds.has(String(edge._to))).length;
    return { career: String(career.name || career._key), covered, missing: Math.max(required.length - covered, 0) };
  }), [careers, requirements, teaches]);

  const typeCounts = useMemo(() => Object.entries(courses.reduce<Record<string, number>>((acc, row) => {
    const key = String(row.resource_type || 'Khác'); acc[key] = (acc[key] || 0) + 1; return acc;
  }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'vi')),
  [courses]);
  const topTypes = typeCounts.slice(0, 5);
  const remainingTypes = typeCounts.slice(5);
  const remainingTotal = remainingTypes.reduce((sum, item) => sum + item.value, 0);
  const chartTypes = [...topTypes, ...(remainingTypes.length ? [{ name: `Các loại khác (${remainingTypes.length})`, value: remainingTotal }] : [])];
  const pending = courses.filter((row) => row.review_status === 'pending' || (!row.review_status && row.recommendation_eligible !== true)).length;

  const stats = [
    { label: 'Người dùng', value: userCount === null ? '…' : userCount.toLocaleString('vi-VN'), sub: 'Đọc từ auth_users', icon: Users, tone: 'violet' },
    { label: 'Nghề nghiệp', value: careers.length.toLocaleString('vi-VN'), sub: 'Đã nạp từ ArangoDB', icon: BriefcaseBusiness, tone: 'blue' },
    { label: 'Kỹ năng', value: skills.length.toLocaleString('vi-VN'), sub: 'Đã nạp từ ArangoDB', icon: Network, tone: 'cyan' },
    { label: 'Học liệu', value: courses.length.toLocaleString('vi-VN'), sub: 'Đã nạp từ ArangoDB', icon: BookOpen, tone: 'amber' },
    { label: 'Nhà cung cấp', value: providers.length.toLocaleString('vi-VN'), sub: 'Đã nạp từ ArangoDB', icon: ShieldCheck, tone: 'green' },
    { label: 'Teaches mappings', value: teaches.length.toLocaleString('vi-VN'), sub: 'Quan hệ trực tiếp trong DB', icon: FileStack, tone: 'purple' },
  ];
  return <div className="admin-page admin-dashboard">
    <div className="admin-page-heading"><div><div className="admin-eyebrow">SYSTEM OVERVIEW</div><h1>Chào buổi sáng, {user?.name || 'Admin'} <span className="admin-wave">✦</span></h1><p>Tổng quan danh mục và các quan hệ nghề nghiệp từ database đang kết nối.</p></div><div className="admin-heading-actions"><span className="admin-live-label"><i className={catalogStatus === 'live' ? 'connected' : ''} /> {catalogStatus === 'live' ? `LIVE · ${catalogDatabase}` : catalogStatus === 'loading' ? 'Đang đồng bộ…' : 'Snapshot dự phòng'}</span><Link to="/admin/database" className="admin-btn"><Database size={16} /> Cấu hình dữ liệu</Link></div></div>
    <section className="admin-stat-grid">{stats.map((item) => <article className="admin-stat-card" key={item.label}><span className={`admin-stat-icon ${item.tone}`}><item.icon size={18} /></span><div className="admin-stat-value">{item.value}</div><div className="admin-stat-label">{item.label}</div><div className="admin-stat-sub">{item.sub}</div></article>)}</section>
    <section className="admin-coverage-strip"><div className="admin-panel-head"><div><h2>Độ bao phủ học liệu</h2><p>Đếm kỹ năng có học liệu với bằng chứng direct_topic trong dữ liệu hiện tại.</p></div><Link to="/admin/skills">Xem kỹ năng <ArrowRight size={14} /></Link></div><div className="admin-coverage-cards">{coverageMetrics.map((metric, index) => <div className="admin-coverage-card" key={metric.name}><div><span>{metric.name}</span><strong>{metric.pct}%</strong></div><div className="admin-progress"><i style={{ width: `${metric.pct}%`, background: palette[index] }} /></div><small>{metric.covered} / {metric.total} kỹ năng</small></div>)}</div></section>
    <div className="admin-dashboard-charts"><section className="admin-panel"><div className="admin-panel-head"><div><h2>Essential coverage theo nghề</h2><p>Tỷ lệ kỹ năng Essential có direct_topic</p></div><span className="admin-mini-tag">{coverageByCareer.length} nghề</span></div><div className="admin-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={coverageByCareer} margin={{ top: 12, right: 12, left: -18, bottom: 56 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--admin-border)" /><XAxis dataKey="career" tick={{ fontSize: 10, fill: 'var(--admin-muted)' }} angle={-32} textAnchor="end" interval={0} /><YAxis tick={{ fontSize: 10, fill: 'var(--admin-muted)' }} /><Tooltip /><Bar dataKey="covered" stackId="coverage" name="Đã bao phủ" fill="#6f61e8" /><Bar dataKey="missing" stackId="coverage" name="Còn thiếu" fill="#e7e8f1" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
      <section className="admin-panel admin-resource-panel"><div className="admin-panel-head"><div><h2>Phân bố loại học liệu</h2><p>5 loại có số lượng nhiều nhất</p></div><span className="admin-mini-tag">{typeCounts.length} loại</span></div><div className="admin-chart donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartTypes} dataKey="value" nameKey="name" innerRadius={47} outerRadius={76} paddingAngle={3}>{chartTypes.map((item, index) => <Cell key={item.name} fill={index < topTypes.length ? palette[index % palette.length] : otherColor} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="admin-type-legend">{topTypes.map((item, index) => <div className="admin-type-item" key={item.name}><i style={{ background: palette[index % palette.length] }} /><span title={item.name}>{item.name}</span><b>{item.value.toLocaleString('vi-VN')}</b></div>)}{remainingTypes.length > 0 && <><div className="admin-type-item other"><i /><span>Các loại còn lại</span><b>{remainingTypes.length} loại · {remainingTotal.toLocaleString('vi-VN')}</b></div><button className="admin-type-toggle" onClick={() => setShowAllTypes((value) => !value)}>{showAllTypes ? 'Thu gọn' : `Xem thêm (${remainingTypes.length})`} {showAllTypes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>{showAllTypes && <div className="admin-type-remaining">{remainingTypes.map((item) => <div key={item.name}><span>{item.name}</span><b>{item.value.toLocaleString('vi-VN')}</b></div>)}</div>}</>}</div></section></div>
    <div className="admin-dashboard-bottom"><section className="admin-panel"><div className="admin-panel-head"><div><h2>Hoạt động gần đây</h2><p>Thao tác được ghi nhận trong trình duyệt hiện tại</p></div><Link to="/admin/logs">Mở nhật ký <ArrowRight size={14} /></Link></div>{logs.length ? <div className="admin-activity-list">{logs.slice(0, 5).map((log) => <div className="admin-activity-row" key={log.id}><span className="admin-activity-icon"><Activity size={16} /></span><div><strong>{log.action}</strong><small>{log.target} · {log.actor}</small></div><time>{new Date(log.at).toLocaleString('vi-VN')}</time></div>)}</div> : <div className="admin-inline-empty"><span><Activity size={18} /></span><div><strong>Chưa có thao tác quản trị</strong><small>Thay đổi trên trang quản trị sẽ xuất hiện tại đây.</small></div></div>}</section>
      <section className="admin-panel admin-queue-card"><div className="admin-panel-head"><div><h2>Hàng chờ duyệt</h2><p>Trạng thái từ catalog ArangoDB hiện tại</p></div><span className="admin-queue-count">{pending}</span></div>{pending ? <p>{pending} học liệu đang có trạng thái chờ duyệt.</p> : <p>Chưa có trạng thái chờ duyệt được ghi trong catalog.</p>}<Link className="admin-btn subtle" to="/admin/courses">Mở quản lý học liệu <ArrowRight size={15} /></Link></section></div>
  </div>;
}
