import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useApiData } from '../../api/hooks';

type CoverageMetric = { covered: number; total: number; ratio: number; missing: number };
export type CoverageCareerRow = {
  career: string;
  essential: CoverageMetric;
  optional: Omit<CoverageMetric, 'missing'>;
};

export function finiteCoverageNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function normalizeCoverageRows(value: unknown): CoverageCareerRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => {
    const essentialCovered = finiteCoverageNumber(item?.essential?.covered);
    const essentialTotal = finiteCoverageNumber(item?.essential?.total);
    const optionalCovered = finiteCoverageNumber(item?.optional?.covered);
    const optionalTotal = finiteCoverageNumber(item?.optional?.total);
    return {
      career: typeof item?.career === 'string' ? item.career : '',
      essential: {
        covered: essentialCovered,
        total: essentialTotal,
        ratio: finiteCoverageNumber(item?.essential?.ratio),
        missing: Math.max(0, essentialTotal - essentialCovered),
      },
      optional: {
        covered: optionalCovered,
        total: optionalTotal,
        ratio: finiteCoverageNumber(item?.optional?.ratio),
      },
    };
  });
}

export default function StatisticsDashboard() {
  const release = useApiData<any>('/meta/release');
  const coverage = useApiData<any>('/statistics/coverage');
  const rows = normalizeCoverageRows(coverage.data?.perCareer);
  const essentialCovered = finiteCoverageNumber(coverage.data?.essential?.covered);
  const essentialTotal = finiteCoverageNumber(coverage.data?.essential?.total);
  const optionalCovered = finiteCoverageNumber(coverage.data?.optional?.covered);
  const optionalTotal = finiteCoverageNumber(coverage.data?.optional?.total);
  const recommendationEligibleSkills = finiteCoverageNumber(coverage.data?.recommendationEligibleSkills);
  const overallRatio = finiteCoverageNumber(coverage.data?.overall?.ratio);
  const error = release.error || coverage.error;
  return <div className="container">
    <div className="page-head"><div className="eyebrow">THỐNG KÊ LIVE</div><h1>Thống kê SkillGraph</h1><p>Coverage chỉ tính mapping thỏa cả điều kiện recommendation eligibility của resource và approval của mapping.</p></div>
    {(release.loading || coverage.loading) && <p role="status">Đang tải thống kê từ Backend…</p>}
    {error && <div className="warning" role="alert">{error}</div>}
    {release.data && <div className="stat-summary"><div><strong>{finiteCoverageNumber(release.data.careers).toLocaleString('vi-VN')}</strong><span>Nghề nghiệp</span></div><div><strong>{finiteCoverageNumber(release.data.skills).toLocaleString('vi-VN')}</strong><span>Kỹ năng</span></div><div><strong>{finiteCoverageNumber(release.data.courses).toLocaleString('vi-VN')}</strong><span>Học liệu</span></div><div><strong>{finiteCoverageNumber(release.data.requiresSkillRelations).toLocaleString('vi-VN')}</strong><span>Career–Skill relations</span></div></div>}
    {coverage.data && <><div className="stat-summary"><div><strong>{essentialCovered}/{essentialTotal}</strong><span>Essential được bao phủ</span></div><div><strong>{optionalCovered}/{optionalTotal}</strong><span>Optional được bao phủ</span></div><div><strong>{recommendationEligibleSkills.toLocaleString('vi-VN')}</strong><span>Kỹ năng có học liệu đủ điều kiện</span></div><div><strong>{(overallRatio * 100).toFixed(1)}%</strong><span>Coverage tổng</span></div></div>
      <section className="chart-card"><h3>Coverage Essential theo nghề</h3><ResponsiveContainer width="100%" height={Math.max(320, rows.length * 34)}><BarChart data={rows.map((item) => ({ career: item.career, covered: item.essential.covered, missing: item.essential.missing }))} layout="vertical" margin={{ left: 140, right: 20 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="career" width={130} fontSize={10} /><Tooltip /><Legend /><Bar dataKey="covered" name="Có học liệu đạt cổng" stackId="essential" fill="#4f46e5" /><Bar dataKey="missing" name="Chưa có học liệu đạt cổng" stackId="essential" fill="#f59e0b" /></BarChart></ResponsiveContainer></section>
      <p className="notice">{coverage.data.policy}</p>
    </>}
  </div>;
}