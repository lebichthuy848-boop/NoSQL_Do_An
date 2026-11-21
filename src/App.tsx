import { useEffect, useState } from "react";
import StatisticsDashboard, { normalizeCoverageRows } from "./features/statistics/StatisticsDashboard";
import { useApiData, useApiPages } from "./api/hooks";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  Check,
  Database,
  ExternalLink,
  Layers3,
  Menu,
  Moon,
  Network,
  Search,
  Sun,
  X,
} from "lucide-react";
import { getCatalogRepository } from "./repositories/catalogRepository";
import { useUserStore } from "./stores/userStore";
import type { Career, Course, Skill } from "./types/catalog";
import { validExternalHttpUrl } from "./utils/externalUrl";
import { useAuth } from "./features/auth/AuthProvider";
import GraphExplorer from "./features/graph/GraphExplorer";
import MyLearningPage from "./features/learning/MyLearningPage";
import { AccountPage, AuthHeader, ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from "./features/auth/AuthPages";
import AdminLayout, { AdminGate } from "./features/admin/components/AdminLayout";
import AdminDashboardPage from "./features/admin/pages/AdminDashboardPage";
import UsersPage from "./features/admin/pages/UsersPage";
import CareersPage from "./features/admin/pages/CareersPage";
import SkillsPage from "./features/admin/pages/SkillsPage";
import ProvidersPage from "./features/admin/pages/ProvidersPage";
import CoursesPage from "./features/admin/pages/CoursesPage";
import CourseSkillMappingsPage from "./features/admin/pages/CourseSkillMappingsPage";
import CareerSkillsPage from "./features/admin/pages/CareerSkillsPage";
import SkillPrerequisitesPage from "./features/admin/pages/SkillPrerequisitesPage";
import DatabasePage from "./features/admin/pages/DatabasePage";
import ActivityLogsPage from "./features/admin/pages/ActivityLogsPage";
import NotificationsPage from "./features/admin/pages/NotificationsPage";
import AdminAccountPage from "./features/admin/pages/AdminAccountPage";
import ForbiddenPage from "./features/admin/pages/ForbiddenPage";
const repo = getCatalogRepository(),
  PAGE = 18;
const pretty = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
function App() {
  const isAdminRoute = useLocation().pathname.startsWith("/admin");
  const [, setCatalogVersion] = useState(0);
  useEffect(() => {
    const unsubscribe = repo.subscribe(() => setCatalogVersion((version) => version + 1));
    void repo.load();
    return unsubscribe;
  }, []);
  const [dark, setDark] = useState(
      () => localStorage.getItem("theme") === "dark",
    ),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  const nav = [
    ["/dashboard", "Tổng quan"],
    ["/careers", "Nghề nghiệp"],
    ["/skills", "Kỹ năng"],
    ["/skill-taxonomy", "ESCO Taxonomy"],
    ["/resources", "Học liệu"],
    ["/providers", "Nhà cung cấp"],
    ["/graph", "Skill Graph"],
    ["/data-quality", "Chất lượng dữ liệu"],
  ];
  return (
    <div className={`app${isAdminRoute ? " admin-host" : ""}`}>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="SkillGraph - Trang chủ">
          <span className="brand-mark">
            <Network />
          </span>
          <span>
            Skill<span>Graph</span>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Điều hướng chính">
          {nav.map(([to, n]) => (
            <NavLink key={to} to={to} onClick={() => setMenu(false)}>
              {n}
            </NavLink>
          ))}
        </nav>
        <AuthHeader />
        <Link className="header-cta" to="/careers">
          Khám phá nghề
        </Link>
        <button
          className="icon-btn mobile"
          onClick={() => setMenu(!menu)}
          aria-label={menu ? "Đóng menu" : "Mở menu"}
          aria-expanded={menu}
        >
          {menu ? <X /> : <Menu />}
        </button>
        <button
          className="icon-btn"
          onClick={() => setDark(!dark)}
          aria-label={dark ? "Bật giao diện sáng" : "Bật giao diện tối"}
        >
          {dark ? <Sun /> : <Moon />}
        </button>
      </header>
      <AnimatePresence>
        {menu && (
          <>
            <motion.button
              className="drawer-backdrop"
              aria-label="Đóng menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenu(false)}
            />
            <motion.aside
              className="mobile-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
            >
              <div className="drawer-head">
                <span>Điều hướng</span>
                <button className="icon-btn" onClick={() => setMenu(false)}>
                  <X />
                </button>
              </div>
              {nav.map(([to, n]) => (
                <NavLink key={to} to={to} onClick={() => setMenu(false)}>
                  {n} <ArrowRight />
                </NavLink>
              ))}
              <Link
                className="btn primary"
                to="/career-goal"
                onClick={() => setMenu(false)}
              >
                Bắt đầu lộ trình mô phỏng
              </Link>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      <main>
        {repo.status === "loading" && <div className="container" role="status">Đang tải catalog từ Backend Node.js…</div>}
        {repo.status === "error" && <div className="container warning" role="alert"><p>Không tải được catalog live: {repo.error}</p><button className="btn secondary" onClick={() => void repo.retry()}>Thử tải lại</button></div>}
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="/statistics" element={<StatisticsDashboard />} />
          <Route element={<AdminGate />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="careers" element={<CareersPage />} />
              <Route path="skills" element={<SkillsPage />} />
              <Route path="providers" element={<ProvidersPage />} />
              <Route path="courses" element={<CoursesPage />} />
              <Route path="course-skill-mappings" element={<CourseSkillMappingsPage />} />
              <Route path="career-skills" element={<CareerSkillsPage />} />
              <Route path="skill-prerequisites" element={<SkillPrerequisitesPage />} />
              <Route path="database" element={<DatabasePage />} />
              <Route path="logs" element={<ActivityLogsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="account" element={<AdminAccountPage />} />
            </Route>
          </Route>
          <Route path="/" element={<Home />} />
          <Route element={<UserGate />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/career-goal" element={<CareerGoal />} />
            <Route path="/my-skills" element={<MySkills />} />
            <Route path="/skill-gap" element={<SkillGap />} />
            <Route path="/career-fit" element={<CareerFit />} />
            <Route path="/recommendations" element={<Recommendations />} />
            <Route path="/learning-path" element={<LearningPath />} />
            <Route path="/my-learning" element={<MyLearning />} />
          </Route>
          <Route path="/careers" element={<Careers />} />
          <Route path="/careers/:id" element={<CareerDetail />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/skills/:id" element={<SkillDetail />} />
          <Route path="/skill-taxonomy" element={<Taxonomy />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/resources/:id" element={<ResourceDetail />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/graph" element={<GraphExplorer />} />





          <Route path="/data-quality" element={<DataQuality />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer>
        <div className="brand">
          <span className="brand-mark">
            <Network />
          </span>
          SkillGraph
        </div>
        <p>Khám phá nghề nghiệp và kỹ năng cùng SkillGraph</p>
        <Link to="/about">Giới thiệu & giới hạn dữ liệu</Link>
      </footer>
    </div>
  );
}
const Head = ({
  tag,
  title,
  text,
}: {
  tag: string;
  title: string;
  text: string;
}) => (
  <motion.div
    className="page-head"
    initial={{ opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45 }}
  >
    <div className="eyebrow">{tag}</div>
    <h1>{title}</h1>
    <p>{text}</p>
  </motion.div>
);
function CatalogMessage() {
  if (repo.status === 'loading' || repo.status === 'idle') return <p className="notice" role="status">Đang tải dữ liệu catalog từ Backend…</p>;
  if (repo.status === 'error') return <div className="warning" role="alert">{repo.error || 'Không thể tải catalog.'} <button className="btn secondary" onClick={() => void repo.retry()}>Thử lại</button></div>;
  return null;
}
const SearchBox = ({
  value,
  set,
  placeholder,
}: {
  value: string;
  set: (v: string) => void;
  placeholder: string;
}) => (
  <label className="search">
    <Search />
    <input
      value={value}
      onChange={(e) => set(e.target.value)}
      placeholder={placeholder}
    />
  </label>
);
const Empty = () => (
  <div className="empty">
    <Search />
    <h3>Không tìm thấy kết quả</h3>
    <p>Hãy thử từ khóa hoặc bộ lọc khác.</p>
  </div>
);
function Pager({
  page,
  total,
  set,
}: {
  page: number;
  total: number;
  set: (n: number) => void;
}) {
  const n = Math.ceil(total / PAGE);
  return n > 1 ? (
    <div className="pagination">
      <button disabled={page === 1} onClick={() => set(page - 1)}>
        Trước
      </button>
      <span>
        {page} / {n}
      </span>
      <button disabled={page === n} onClick={() => set(page + 1)}>
        Sau
      </button>
    </div>
  ) : null;
}
function Home() {
  const release = repo.getReleaseInfo() as any;
  const report = repo.getCoverageReport();
  const covered = report.reduce((sum, row) => sum + row.covered, 0);
  const total = report.reduce((sum, row) => sum + row.essential, 0);
  const cards = [
    [repo.getCareers().length, 'Nghề nghiệp', BriefcaseBusiness],
    [repo.getSkills().length, 'Kỹ năng', BrainCircuit],
    [repo.getCourses().length, 'Học liệu', BookOpen],
    [repo.getSkillGroups().length, 'Nhóm ESCO', Layers3],
    [repo.getProviders().length, 'Nhà cung cấp', Building2],
  ] as const;
  const reduceMotion = useReducedMotion();
  return (
    <>
      <section className="hero">
        <motion.div className="hero-copy" initial={reduceMotion ? false : { opacity: 0, x: -32 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
          <div className="eyebrow"><span /> CAREER & SKILL GRAPH</div>
          <h1>Khám phá kỹ năng —<br /><em>Kiến tạo hành trình nghề nghiệp</em></h1>
          <p>Khám phá mối quan hệ giữa nghề nghiệp, kỹ năng và học liệu thông qua Skill Graph sử dụng ArangoDB.</p>
          <div className="actions">
            <Link className="btn primary" to="/careers">Khám phá nghề nghiệp <ArrowRight /></Link>
            <Link className="btn secondary" to="/graph">Xem Skill Graph <Network /></Link>
            <Link className="btn secondary" to="/career-goal">Chọn nghề mục tiêu</Link>
          </div>
          <small className="notice">Dữ liệu catalog được đọc trực tiếp từ Backend Node.js và ArangoDB.</small>
        </motion.div>
        <motion.div className="graph-art" initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.65, delay: 0.1 }}>
          <div className="glow" />
          <svg className="graph-links" viewBox="0 0 600 500" aria-hidden="true"><path d="M300 250 L120 105 M300 250 L485 105 M300 250 L115 390 M300 250 L480 390 M300 250 L300 54" /></svg>
          <div className="node center"><Network /><b>SkillGraph</b></div><div className="node n1"><BriefcaseBusiness /><b>Career</b></div><div className="node n2"><BrainCircuit /><b>Skill</b></div><div className="node n3"><BookOpen /><b>Resource</b></div><div className="node n4"><Layers3 /><b>ESCO Group</b></div><div className="node n5"><Building2 /><b>Provider</b></div>
          <span className="relation-label rl1">requires_skill</span><span className="relation-label rl2">teaches</span><span className="relation-label rl3">offered_by</span>
        </motion.div>
      </section>
      <section className="stats">{cards.map(([value, label, Icon], index) => <motion.div className="stat" key={label} initial={reduceMotion ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ delay: index * 0.06 }} whileHover={reduceMotion ? undefined : { y: -6 }}><div className="stat-icon"><Icon /></div><div><strong>{value.toLocaleString('vi-VN')}</strong><span>{label}</span></div></motion.div>)}</section>
      <section className="section"><div className="section-heading"><div><div className="eyebrow">BAO PHỦ HỌC LIỆU</div><h2>{covered}/{total} yêu cầu Essential có học liệu qua cả hai điều kiện phê duyệt</h2><p>Release {release.version || 'đang tải'} · ArangoDB {release.arangoVersion || ''}</p></div><Link className="text-link" to="/careers">Khám phá nghề nghiệp <ArrowRight /></Link></div>
        <div className="steps"><Info n="01" t="Chọn nghề" x="Xem yêu cầu Essential và Optional từ dữ liệu live." /><Info n="02" t="Khai báo kỹ năng" x="Trạng thái cá nhân được lưu qua tài khoản trên Backend." /><Info n="03" t="Khám phá học liệu" x="Xem bằng chứng và giới hạn ánh xạ đã được phê duyệt." /></div>
      </section>
    </>
  );
}
const Info = ({ n, t, x }: { n: string; t: string; x: string }) => (
  <motion.div
    className="step"
    initial={{ opacity: 0, y: 18 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.4 }}
    whileHover={{ y: -6 }}
  >
    <span className="step-number">{n}</span>
    <h3>{t}</h3>
    <p>{x}</p>
  </motion.div>
);
function Dashboard() {
  const { user } = useAuth();
  const progress = useApiData<any>(user?.role === 'user' ? '/me/progress' : null);
  const gap = useApiData<any>(user?.role === 'user' && progress.data?.careerGoalId ? '/me/skill-gap' : null);
  const profile = progress.data;
  const career = profile?.careerGoalId ? repo.getCareerById(profile.careerGoalId) : null;
  return <div className="container"><Head tag="DASHBOARD CÁ NHÂN" title="Tổng quan hành trình" text="Mục tiêu và tiến độ được tải từ hồ sơ tài khoản trên Backend." />{progress.loading && <p role="status">Đang tải tiến độ cá nhân…</p>}{progress.error && <div className="warning" role="alert">{progress.error}</div>}{gap.loading && <p role="status">Đang tính skill gap…</p>}{gap.error && <div className="warning" role="alert">{gap.error}</div>}<div className="stat-summary"><Metric v={career?.name || (profile?.careerGoalId ? 'Đang tải nghề…' : 'Chưa chọn')} l="Nghề mục tiêu" /><Metric v={gap.data ? `${gap.data.essential.owned}/${gap.data.essential.required}` : '—'} l="Essential tự khai báo" /><Metric v={(profile?.savedResourceIds || []).length} l="Học liệu đã lưu" /></div><div className="actions"><Link className="btn primary" to={career ? '/my-skills' : '/career-goal'}>{career ? 'Cập nhật kỹ năng' : 'Chọn nghề mục tiêu'}</Link><Link className="btn secondary" to="/career-fit">Career Fit</Link><Link className="btn secondary" to="/recommendations">Gợi ý học liệu</Link><Link className="btn secondary" to="/graph">Mở Skill Graph</Link></div><p className="notice">Kỹ năng là trạng thái tự khai báo; xem hoặc hoàn thành học liệu không xác nhận mức thành thạo.</p></div>;
}
const Metric = ({ v, l }: { v: string | number; l: string }) => (
  <div>
    <strong>{v}</strong>
    <span>{l}</span>
  </div>
);
function Careers() {
  const [q, setQ] = useState(''), [g, setG] = useState('');
  const all = repo.getCareers(), groups = [...new Set(all.map((x) => x.careerGroup).filter(Boolean))];
  const filtered = all.filter((x) => (x.name + x.description).toLowerCase().includes(q.toLowerCase()) && (!g || x.careerGroup === g));
  return <div className="container"><Head tag="CAREER EXPLORER" title={`Khám phá ${all.length} nghề nghiệp`} text="Dữ liệu nghề và quan hệ kỹ năng được tải từ Node API." /><div className="toolbar"><SearchBox value={q} set={setQ} placeholder="Tìm nghề..." /><select value={g} onChange={(e) => setG(e.target.value)}><option value="">Tất cả nhóm</option>{groups.map((x) => <option key={x}>{x}</option>)}</select></div><CatalogMessage />{repo.status === 'ready' && <div className="catalog-grid">{filtered.map((x) => <CareerCard key={x.id} x={x} />)}{!filtered.length && <Empty />}</div>}</div>;
}
function CareerCard({ x }: { x: Career }) {
  const requirements = repo.getCareerRequirements(x.id);
  const setCareer = useUserStore((state) => state.setCareer);
  const { user } = useAuth();
  return <article className="catalog-card"><div className="card-top"><span className="card-icon"><BriefcaseBusiness /></span><span className="pill">ISCO {x.iscoGroup}</span></div><h3>{x.name}</h3><p className="muted">{x.careerGroup}</p><p className="clamp">{x.description}</p><div className="counts"><span><b>{requirements.filter((row) => row.requirementType === 'essential').length}</b> Essential</span><span><b>{requirements.filter((row) => row.requirementType === 'optional').length}</b> Optional</span></div><div className="card-actions"><Link className="card-link" to={`/careers/${x.key}`}>Chi tiết <ArrowRight /></Link>{user?.role === 'user' ? <button onClick={() => void setCareer(x.id)}>Chọn mục tiêu</button> : <Link className="card-link" to="/login">Đăng nhập để chọn mục tiêu</Link>}</div></article>;
}
function CareerDetail() {
  const { id = "" } = useParams(),
    x = repo.getCareerById(id),
    [tab, setTab] = useState("essential"),
    [q, setQ] = useState("");
  const setCareer = useUserStore((s) => s.setCareer);
  const { user } = useAuth();
  if (repo.status === "loading" || repo.status === "idle") return <div className="container" role="status">Đang tải nghề nghiệp từ Backend…</div>;
  if (repo.status === "error") return <div className="container warning" role="alert">{repo.error}</div>;
  if (!x) return <NotFound />;
  const all = repo.getCareerRequirements(x.id),
    rows = all.filter(
      (r) =>
        r.requirementType === tab &&
        r.skill.name.toLowerCase().includes(q.toLowerCase()),
    );
  const cov = repo.getCoverageReport().find((r) => r.career === x.name);
  return (
    <div className="container">
      <Link className="back" to="/careers">
        <ArrowLeft /> Nghề nghiệp
      </Link>
      <section className="detail-hero">
        <div>
          <span className="pill">{x.careerGroup}</span>
          <h1>{x.name}</h1>
          <p>{x.description}</p>
          <a href={x.escoUri} target="_blank" rel="noreferrer">
            ESCO <ExternalLink />
          </a>
          {user?.role === "user" ? <button className="btn primary" onClick={() => void setCareer(x.id)}>Chọn làm mục tiêu</button> : <Link className="btn primary" to="/login">Đăng nhập để chọn mục tiêu</Link>}
        </div>
        <div className="metric-card">
          <strong>{all.length}</strong>
          <span>Yêu cầu kỹ năng</span>
          <div>
            {all.filter((r) => r.requirementType === "essential").length}{" "}
            Essential ·{" "}
            {all.filter((r) => r.requirementType === "optional").length}{" "}
            Optional
          </div>
        </div>
      </section>
      {cov && <Coverage value={cov.covered} total={cov.essential} />}
      <div className="content-section">
        <div className="tabs">
          <button
            className={tab === "essential" ? "active" : ""}
            onClick={() => setTab("essential")}
          >
            Essential
          </button>
          <button
            className={tab === "optional" ? "active" : ""}
            onClick={() => setTab("optional")}
          >
            Optional
          </button>
        </div>
        <SearchBox value={q} set={setQ} placeholder="Tìm kỹ năng..." />
        <div className="list">
          {rows.map((r) => (
            <Link className="list-row" key={r.id} to={`/skills/${r.skill.key}`}>
              <span className="skill-dot" />
              <div>
                <h3>{r.skill.name}</h3>
                <p>{r.skill.description}</p>
              </div>
              <span className="resource-count">{r.resourceCount} học liệu</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
const Coverage = ({ value, total }: { value: number; total: number }) => (
  <div className="coverage">
    <b>
      {value}/{total}
    </b>
    <span>Mức bao phủ học liệu trực tiếp theo yêu cầu Essential</span>
    <div className="bar">
      <i style={{ width: `${(value / total) * 100}%` }} />
    </div>
    <small>direct_topic không chứng minh mức độ thành thạo.</small>
  </div>
);
const SelfDeclaredEssentialProgress = ({
  value,
  total,
  percentage,
}: {
  value: number;
  total: number;
  percentage: number;
}) => {
  const formattedPercentage = new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(percentage);
  return (
    <div className="coverage">
      <b>
        {value}/{total} · {formattedPercentage}%
      </b>
      <span>Kỹ năng Essential đã tự khai báo</span>
      <div
        className="bar"
        role="progressbar"
        aria-label="Kỹ năng Essential đã tự khai báo"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
        aria-valuetext={`${value}/${total}, ${formattedPercentage}%`}
      >
        <i style={{ width: `${percentage}%` }} />
      </div>
      <small>
        Kết quả dựa trên kỹ năng người dùng tự khai báo, không chứng minh mức độ
        thành thạo.
      </small>
    </div>
  );
};
function Skills() {
  const [q, setQ] = useState(''), [type, setType] = useState(''), [page, setPage] = useState(1);
  const all = repo.getSkills(), types = [...new Set(all.map((x) => x.skillType).filter(Boolean))];
  const filtered = all.filter((x) => (x.name + x.description).toLowerCase().includes(q.toLowerCase()) && (!type || x.skillType === type));
  return <div className="container"><Head tag="SKILL EXPLORER" title={`${all.length.toLocaleString('vi-VN')} kỹ năng`} text="Tìm kiếm kỹ năng và khám phá các liên kết nghề nghiệp, học liệu." /><div className="toolbar"><SearchBox value={q} set={(value) => { setQ(value); setPage(1); }} placeholder="Tìm kỹ năng..." /><select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">Tất cả loại</option>{types.map((value) => <option key={value} value={value}>{pretty(value)}</option>)}</select></div><CatalogMessage /><div className="list cards">{repo.status === 'ready' && filtered.slice((page - 1) * PAGE, page * PAGE).map((x) => <SkillRow key={x.id} x={x} />)}</div>{repo.status === 'ready' && !filtered.length && <Empty />}<Pager page={page} total={filtered.length} set={setPage} /></div>;
}
const SkillRow = ({ x }: { x: Skill }) => (
  <Link className="list-row" to={`/skills/${x.key}`}>
    <span className="card-icon">
      <BrainCircuit />
    </span>
    <div>
      <span className="pill">{pretty(x.skillType)}</span>
      <h3>{x.name}</h3>
      <p>{x.description}</p>
    </div>
    <ArrowRight className="row-arrow" />
  </Link>
);
function apiCourse(row: any): Course {
  const id = String(row.id || `courses/${row.key || ''}`);
  return { key: String(row.key || id.split('/').slice(-1)[0] || ''), id, title: String(row.title || ''), canonicalUrl: String(row.canonicalUrl || ''), providerName: String(row.providerName || ''), resourceType: String(row.resourceType || ''), language: String(row.language || ''), level: row.level == null ? null : String(row.level), certificateAvailable: typeof row.certificateAvailable === 'boolean' ? row.certificateAvailable : null, verifiedOutcomeProficiency: null, raw: row };
}
function SkillDetail() {
  const { id = '' } = useParams();
  const detail = useApiData<any>(id ? `/skills/${encodeURIComponent(id)}` : null);
  const resourcePage = useApiPages<any>(id ? `/skills/${encodeURIComponent(id)}/resources` : null);
  const x = repo.getSkillById(id) || detail.data;
  if (detail.loading || resourcePage.loading) return <div className="container" role="status">Đang tải chi tiết kỹ năng từ Backend…</div>;
  if (detail.error || resourcePage.error) return <div className="container warning" role="alert">{detail.error || resourcePage.error}</div>;
  if (!x) return <NotFound />;
  const careers = detail.data?.careers || [];
  const resources = resourcePage.data || [];
  return <div className="container"><Link className="back" to="/skills"><ArrowLeft /> Kỹ năng</Link><section className="detail-hero"><div><span className="pill">{pretty(x.skillType)}</span><h1>{x.name}</h1><p>{x.description}</p>{x.escoUri && <a href={x.escoUri} target="_blank" rel="noreferrer">ESCO <ExternalLink /></a>}</div><div className="metric-card"><strong>{careers.length}</strong><span>Nghề yêu cầu</span><div>{detail.data?.linkedResourceCount ?? resources.length} học liệu liên quan</div></div></section><div className="content-section"><h2>Nghề nghiệp liên quan</h2><div className="chip-list">{careers.map((row: any) => <Link key={row.career.id} to={`/careers/${row.career.key}`}><span>{row.career.name}</span><small>{pretty(row.requirementType)}</small></Link>)}</div></div><div className="content-section"><h2>Học liệu đã được ánh xạ</h2>{resources.length ? <div className="catalog-grid resources">{resources.map((row: any) => <ResourceCard key={row.resource.id} x={apiCourse(row.resource)} scopes={row.edge?.evidenceScope ? [row.edge.evidenceScope] : []} />)}</div> : <p className="notice">Chưa có học liệu được ánh xạ cho kỹ năng này.</p>}</div></div>;
}
function Taxonomy() {
  const [q, setQ] = useState(''), [selected, setSelected] = useState('');
  const groups = repo.getSkillGroups().filter((row) => (row.name + row.code).toLowerCase().includes(q.toLowerCase()));
  const skills = useApiPages<Skill>(selected ? `/skill-groups/${encodeURIComponent(selected)}/skills` : null);
  const group = groups.find((row) => row.id === selected || row.key === selected);
  return <div className="container"><Head tag="ESCO TAXONOMY" title={`${repo.getSkillGroups().length.toLocaleString('vi-VN')} nhóm kỹ năng`} text="Quan hệ phân loại ESCO; taxonomy không biểu thị prerequisite hay thứ tự học." /><SearchBox value={q} set={setQ} placeholder="Tìm nhóm kỹ năng..." /><CatalogMessage /><div className="taxonomy"><div className="group-list">{groups.map((row) => <button className={selected === row.id || selected === row.key ? 'active' : ''} onClick={() => setSelected(row.key)} key={row.id}><b>{row.code}</b><span>{row.name}</span></button>)}</div><div className="taxonomy-detail">{selected ? <><h2>{group?.name || 'Nhóm kỹ năng'}</h2>{skills.loading && <p role="status">Đang tải thành viên nhóm…</p>}{skills.error && <p role="alert">{skills.error}</p>}{skills.data?.map((row) => <SkillRow key={row.id} x={row} />)}{skills.data?.length === 0 && <p>Nhóm này chưa có kỹ năng được liên kết.</p>}</> : <Empty />}</div></div></div>;
}
function Resources() {
  const [q, setQ] = useState(''), [type, setType] = useState(''), [page, setPage] = useState(1);
  const all = repo.getCourses(), types = [...new Set(all.map((x) => x.resourceType).filter(Boolean))].sort();
  const filtered = all.filter((x) => (x.title + x.providerName).toLowerCase().includes(q.toLowerCase()) && (!type || x.resourceType === type));
  return <div className="container"><Head tag="RESOURCE CATALOG" title={`${all.length.toLocaleString('vi-VN')} học liệu`} text="Học liệu chính thức và các bản ghi ứng dụng đã qua phê duyệt." /><div className="toolbar"><SearchBox value={q} set={(value) => { setQ(value); setPage(1); }} placeholder="Tìm học liệu hoặc nhà cung cấp..." /><select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">Tất cả định dạng</option>{types.map((value) => <option key={value}>{pretty(value)}</option>)}</select></div><CatalogMessage /><div className="catalog-grid resources">{repo.status === 'ready' && filtered.slice((page - 1) * PAGE, page * PAGE).map((x) => <ResourceCard key={x.id} x={x} />)}{repo.status === 'ready' && !filtered.length && <Empty />}</div><Pager page={page} total={filtered.length} set={setPage} /></div>;
}
function ResourceCard({ x, scopes = [] }: { x: Course; scopes?: string[] }) {
  const save = useUserStore((state) => state.toggleSaved);
  const saved = useUserStore((state) => state.savedResourceIds.includes(x.id));
  const { user } = useAuth();
  return <article className="catalog-card resource"><div className="card-top"><span className="card-icon"><BookOpen /></span><span className="pill">{x.language.toUpperCase()}</span></div><h3>{x.title}</h3><p className="muted">{x.providerName}</p><div className="tags"><span>{pretty(x.resourceType)}</span>{x.level && <span>{pretty(x.level)}</span>}{[...new Set(scopes)].map((scope) => <span className={scope === 'direct_topic' ? 'direct' : ''} key={scope}>{pretty(scope)}</span>)}</div><div className="card-actions resource-card-footer"><Link className="card-link" to={`/resources/${encodeURIComponent(x.id)}`}>Chi tiết <ArrowRight /></Link>{user?.role === 'user' ? <button className={`resource-save-btn ${saved ? 'is-saved' : ''}`} type="button" aria-pressed={saved} aria-label={saved ? `Bỏ lưu ${x.title}` : `Lưu học liệu ${x.title}`} title={saved ? 'Nhấn để bỏ lưu học liệu' : 'Lưu học liệu'} onClick={() => void save(x.id)}>{saved ? <><BookmarkCheck aria-hidden="true" /> Đã lưu</> : <><BookmarkPlus aria-hidden="true" /> Lưu học liệu</>}</button> : <Link className="resource-save-btn" to="/login">Đăng nhập để lưu</Link>}</div></article>;
}
function ResourceDetail() {
  const { id = '' } = useParams();
  const result = useApiData<any>(id ? `/resources/${encodeURIComponent(id)}` : null);
  if (result.loading) return <div className="container" role="status">Đang tải học liệu từ Backend…</div>;
  if (result.error) return <div className="container warning" role="alert">{result.error}</div>;
  if (!result.data?.resource) return <NotFound />;
  const x = apiCourse(result.data.resource), skills = result.data.skills || [];
  const sourceUrl = validExternalHttpUrl(x.canonicalUrl);
  return <div className="container"><Link className="back" to="/resources"><ArrowLeft /> Học liệu</Link><section className="detail-hero"><div><span className="pill">{pretty(x.resourceType)}</span><h1>{x.title}</h1><p>{x.providerName}</p>{sourceUrl ? <a className="btn primary resource-source-btn" href={sourceUrl} target="_blank" rel="noreferrer">Mở nguồn <ExternalLink aria-hidden="true" /></a> : <span className="resource-source-unavailable"><button className="btn resource-source-btn" type="button" disabled aria-describedby="resource-source-reason">Chưa có liên kết <ExternalLink aria-hidden="true" /></button><small id="resource-source-reason">Học liệu này chưa có URL nguồn HTTP/HTTPS hợp lệ.</small></span>}</div><div className="metric-card resource-meta"><span>Ngôn ngữ <b>{x.language.toUpperCase() || 'Chưa xác minh'}</b></span><span>Trình độ <b>{x.level || 'Chưa xác minh'}</b></span><span>Chứng chỉ <b>{x.certificateAvailable === null ? 'Chưa xác minh' : x.certificateAvailable ? 'Có' : 'Không'}</b></span></div></section><div className="content-section"><h2>Kỹ năng và bằng chứng ánh xạ</h2><div className="list">{skills.map((row: any) => <Link className="list-row" key={row.skill.id} to={`/skills/${row.skill.key}`}><span className="skill-dot" /><div><h3>{row.skill.name}</h3>{row.evidenceScope && <p><b>{pretty(row.evidenceScope)}</b>{row.mappingNote ? ` — ${row.mappingNote}` : ''}</p>}</div></Link>)}</div>{!skills.length && <p className="notice">Học liệu chưa có liên kết kỹ năng công khai.</p>}</div></div>;
}
function Providers() {
  const [q, setQ] = useState(''), all = repo.getProviders();
  const filtered = all.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
  return <div className="container"><Head tag="PROVIDERS" title={`${all.length.toLocaleString('vi-VN')} nhà cung cấp`} text="Nhà xuất bản và tổ chức cung cấp học liệu từ catalog live." /><SearchBox value={q} set={setQ} placeholder="Tìm nhà cung cấp..." /><CatalogMessage /><div className="catalog-grid">{repo.status === 'ready' && filtered.map((provider) => <article className="catalog-card" key={provider.id}><span className="card-icon"><Database /></span><h3>{provider.name}</h3><p>{(provider.resourceCount || 0).toLocaleString('vi-VN')} học liệu</p>{provider.officialWebsite && <a href={provider.officialWebsite} target="_blank" rel="noreferrer">Website <ExternalLink /></a>}</article>)}{repo.status === 'ready' && !filtered.length && <Empty />}</div></div>;
}
function GraphPage() { return <GraphExplorer />; }
function CareerGoal() {
  const setCareer = useUserStore((state) => state.setCareer), current = useUserStore((state) => state.selectedCareerId), saving = useUserStore((state) => state.saving), error = useUserStore((state) => state.error);
  return <div className="container"><Head tag="NGHỀ MỤC TIÊU" title="Chọn nghề mục tiêu" text="Lựa chọn được lưu vào hồ sơ của bạn trên Backend." />{error && <div className="warning" role="alert">{error}</div>}<div className="catalog-grid">{repo.getCareers().map((career) => <button className={`goal-card ${current === career.id ? 'active' : ''}`} key={career.id} disabled={saving} onClick={() => void setCareer(career.id)}><BriefcaseBusiness /><b>{career.name}</b><span>{career.careerGroup}</span></button>)}</div>{current && <Link className="btn primary" to="/my-skills">Tiếp tục khai báo kỹ năng <ArrowRight /></Link>}</div>;
}
function MySkills() {
  const state = useUserStore(), career = state.selectedCareerId ? repo.getCareerById(state.selectedCareerId) : null;
  const [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const requirements = career ? repo.getCareerRequirements(career.id) : [];
  const requirementBySkill = new Map(requirements.map((row) => [row.skill.id, row.requirementType]));
  const skills = repo.getSkills().filter((skill) => (skill.name + skill.description).toLowerCase().includes(query.toLowerCase()));
  return <div className="container"><Head tag="KỸ NĂNG CỦA TÔI" title={career ? `Kỹ năng cho ${career.name}` : 'Kỹ năng cá nhân'} text="Kỹ năng được lưu theo tài khoản và không bị xóa khi đổi nghề mục tiêu. Đánh dấu không xác nhận mức thành thạo." />{state.loading && <p role="status">Đang tải kỹ năng cá nhân…</p>}{state.error && <div className="warning" role="alert">{state.error}</div>}<SearchBox value={query} set={(value) => { setQuery(value); setPage(1); }} placeholder="Tìm trong catalog kỹ năng..." /><CatalogMessage /><div className="selection-list">{repo.status === 'ready' && skills.slice((page - 1) * PAGE, page * PAGE).map((skill) => <label key={skill.id}><input type="checkbox" checked={state.declaredSkillIds.includes(skill.id)} disabled={state.saving} onChange={() => void state.toggleSkill(skill.id)} /><span><b>{skill.name}</b><small>{requirementBySkill.has(skill.id) ? pretty(requirementBySkill.get(skill.id)!) + ' · nghề mục tiêu' : pretty(skill.skillType)}</small></span></label>)}</div>{repo.status === 'ready' && !skills.length && <Empty />}<Pager page={page} total={skills.length} set={setPage} /><Link className="btn primary" to="/skill-gap">Xem phân tích skill gap</Link></div>;
}
function SkillGap() {
  const { user } = useAuth(), st = useUserStore();
  const path = user?.role === 'user' ? (st.selectedCareerId ? `/me/skill-gap?careerId=${encodeURIComponent(st.selectedCareerId)}` : '/me/skill-gap') : null;
  const result = useApiData<any>(path);
  if (result.loading) return <div className="container" role="status">Đang phân tích skill gap trên Backend…</div>;
  if (result.error) return <div className="container"><Head tag="SKILL GAP" title="Chưa thể tính khoảng trống kỹ năng" text={result.error} /><Link className="btn primary" to="/career-goal">Chọn nghề mục tiêu</Link></div>;
  const gap = result.data;
  if (!gap) return <NeedGoal />;
  return <div className="container"><Head tag="SKILL GAP" title={`Khoảng trống kỹ năng · ${gap.career.name}`} text="Kết quả so sánh kỹ năng tự khai báo với yêu cầu nghề nghiệp; không suy luận proficiency." /><div className="stat-summary"><Metric v={gap.essential.required} l="Essential" /><Metric v={gap.essential.owned} l="Đã tự khai báo" /><Metric v={gap.essential.missing} l="Còn thiếu" /></div><SelfDeclaredEssentialProgress value={gap.essential.owned} total={gap.essential.required} percentage={gap.essential.required ? gap.essential.owned / gap.essential.required * 100 : 0} /><div className="content-section"><h2>Essential còn thiếu</h2>{gap.missingEssentialSkills.map((skill: Skill) => <SkillRow key={skill.id} x={skill} />)}{!gap.missingEssentialSkills.length && <p>Đã tự khai báo toàn bộ kỹ năng Essential được yêu cầu.</p>}</div><div className="content-section"><h2>Optional còn thiếu</h2>{gap.missingOptionalSkills.map((skill: Skill) => <SkillRow key={skill.id} x={skill} />)}{!gap.missingOptionalSkills.length && <p>Không còn kỹ năng Optional cần khai báo.</p>}</div><div className="actions"><Link className="btn primary" to="/learning-path">Xem lộ trình học</Link><Link className="btn secondary" to="/recommendations">Xem học liệu đủ điều kiện</Link></div><small>{gap.note}</small></div>;
}
function CareerFit() {
  const { user } = useAuth(), fit = useApiData<any[]>(user?.role === 'user' ? '/me/career-fit' : null);
  return <div className="container"><Head tag="CAREER FIT" title="Nghề phù hợp với kỹ năng của bạn" text="Điểm chỉ dựa trên mức hiện diện kỹ năng tự khai báo: 80% Essential và 20% Optional." />{fit.loading && <p role="status">Đang tính Career Fit…</p>}{fit.error && <div className="warning" role="alert">{fit.error}</div>}<div className="list cards">{(fit.data || []).map((row) => <article className="catalog-card" key={row.career.id}><span className="pill">{(row.score * 100).toFixed(1)}% fit</span><h3>{row.career.name}</h3><p>{row.essentialOwned}/{row.essentialTotal} Essential · {row.optionalOwned}/{row.optionalTotal} Optional</p><div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, row.score * 100))}%` }} /></div><Link className="card-link" to={`/careers/${row.career.key}`}>Xem nghề <ArrowRight /></Link></article>)}</div>{fit.data?.length === 0 && <p>Chưa có kết quả Career Fit.</p>}</div>;
}
function Recommendations() {
  const { user } = useAuth(), recs = useApiData<any>(user?.role === 'user' ? '/me/recommendations' : null);
  return <div className="container"><Head tag="RECOMMENDATIONS" title="Học liệu được đề xuất" text="Backend chỉ trả về tài nguyên thỏa điều kiện phê duyệt học liệu và mapping." />{recs.loading && <p role="status">Đang tìm học liệu được phê duyệt…</p>}{recs.error && <div className="warning" role="alert">{recs.error}</div>}{recs.data?.career && <p>Nghề mục tiêu: <b>{recs.data.career.name}</b></p>}<div className="catalog-grid resources">{(recs.data?.items || []).map((row: any) => <ResourceCard key={row.resource.id} x={apiCourse(row.resource)} scopes={(row.evidence || []).map((item: any) => item.evidenceScope).filter(Boolean)} />)}</div>{recs.data && !recs.data.items.length && <p className="notice">Chưa có học liệu được phê duyệt cho kỹ năng còn thiếu.</p>}<small>Không có đề xuất nào được tạo từ dữ liệu chưa qua cả hai điều kiện phê duyệt.</small></div>;
}
function LearningPath() {
  const { user } = useAuth(), plan = useApiData<any>(user?.role === 'user' ? '/me/learning-path' : null);
  return <div className="container"><Head tag="LEARNING PATH" title={plan.data?.career?.name || 'Lộ trình học tập'} text="Thứ tự chỉ dùng prerequisite đã được phê duyệt; không suy ra thành thạo từ học liệu." />{plan.loading && <p role="status">Đang tải lộ trình từ Backend…</p>}{plan.error && <div className="warning" role="alert">{plan.error}</div>}{plan.data?.note && <p className="notice">{plan.data.note}</p>}{plan.data?.steps?.length ? <div className="timeline">{plan.data.steps.map((step: any) => <section key={step.skill.id}><i>{step.order}</i><div><h3>{step.skill.name}</h3>{step.hasResources ? <div className="catalog-grid resources">{step.resources.map((resource: any) => <ResourceCard key={resource.id} x={apiCourse(resource)} scopes={(resource.evidence || []).map((item: any) => item.evidenceScope).filter(Boolean)} />)}</div> : <p className="notice">Chưa có học liệu đủ điều kiện cho kỹ năng này.</p>}</div></section>)}</div> : plan.data && <p>Không còn kỹ năng thiếu trong lộ trình.</p>}<Link className="btn secondary" to="/recommendations">Xem tất cả gợi ý</Link></div>;
}
function MyLearning() {
  return <MyLearningPage />;
}
function DataQuality() {
  const release = useApiData<any>('/meta/release'), coverage = useApiData<any>('/statistics/coverage');
  const report = coverage.data;
  const perCareer = normalizeCoverageRows(report?.perCareer);
  const gaps = perCareer.reduce((sum: number, row: any) => sum + row.essential.missing, 0);
  return <div className="container"><Head tag="DATA QUALITY" title="Chất lượng dữ liệu live" text="Tóm tắt provenance và coverage do Backend đọc trực tiếp từ ArangoDB." />{(release.loading || coverage.loading) && <p role="status">Đang đọc metadata và coverage…</p>}{(release.error || coverage.error) && <div className="warning" role="alert">{release.error || coverage.error}</div>}{release.data && <div className="stat-summary"><Metric v={release.data.database} l="Database" /><Metric v={release.data.arangoVersion} l="ArangoDB" /><Metric v={release.data.source} l="Nguồn" /><Metric v={release.data.careers} l="Nghề nghiệp" /><Metric v={release.data.skills} l="Kỹ năng" /><Metric v={release.data.courses} l="Học liệu" /></div>}{report && <><h2>{gaps.toLocaleString('vi-VN')} yêu cầu Essential chưa có học liệu qua đủ điều kiện phê duyệt</h2><div className="table-wrap"><table><thead><tr><th>Nghề</th><th>Essential được bao phủ</th><th>Còn thiếu</th></tr></thead><tbody>{perCareer.map((row: any) => <tr key={row.career}><td>{row.career}</td><td>{row.essential.covered}/{row.essential.total}</td><td>{row.essential.missing}</td></tr>)}</tbody></table></div><p>{report.policy}</p></>}</div>;
}
function About() {
  return <div className="container"><Head tag="ABOUT" title="SkillGraph — Career & Learning Explorer" text="Đồ án NoSQL trực quan hóa mô hình Career–Skill–Course–Provider trên ArangoDB." /><div className="steps"><Info n="HIỆN TẠI" t="Catalog qua Backend Node.js" x="Frontend chỉ truy cập database qua API v1; không dùng JSON catalog làm kết quả chính thức." /><Info n="DỮ LIỆU" t="Batch 2 · dữ liệu live" x="Catalog công khai và coverage được Backend đọc từ ArangoDB operational clone." /><Info n="NGUỒN" t="ESCO taxonomy" x="Quan hệ phân loại không phải thứ tự học; học liệu không tự xác nhận kỹ năng." /></div></div>;
}
function UserGate() {
  const { user, loading, error, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <div className="container" role="status">Đang kiểm tra phiên đăng nhập…</div>;
  if (!user && error) return <div className="container" role="alert"><p>Không thể xác minh phiên đăng nhập: {error}</p><button className="btn secondary" onClick={() => void refresh()}>Thử lại</button></div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.role !== 'user') return <Navigate to="/403" replace />;
  return <Outlet />;
}
const NeedGoal = () => (
  <div className="container">
    <Head
      tag="CẦN THIẾT LẬP"
      title="Chưa chọn nghề mục tiêu"
      text="Hãy chọn một nghề để tiếp tục luồng mô phỏng."
    />
    <Link className="btn primary" to="/career-goal">
      Chọn nghề
    </Link>
  </div>
);
const NotFound = () => (
  <div className="container">
    <Head
      tag="404"
      title="Không tìm thấy trang"
      text="Đường dẫn hoặc ID không tồn tại."
    />
    <Link className="btn primary" to="/">
      Về trang chủ
    </Link>
  </div>
);
export default App;
