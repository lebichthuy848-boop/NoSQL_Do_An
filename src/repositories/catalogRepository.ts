import { apiRequest, apiRequestWithResponse } from '../api/http';
import type { Career, CatalogPayload, Course, Provider, Requirement, Skill, SkillGroup } from '../types/catalog';

const PAGE_SIZE = 100;
const keyOf = (value: string, collection: string) => value.includes('/') ? value.split('/').slice(-1)[0]! : value;

async function getAllPages<T>(path: string): Promise<T[]> {
  const first = await apiRequestWithResponse<T[]>(`${path}?page=1&pageSize=${PAGE_SIZE}`);
  const items = [...(Array.isArray(first.data) ? first.data : [])];
  const total = Number(first.headers.get('X-Total-Count') || items.length);
  const pages = Math.ceil(total / PAGE_SIZE);
  for (let start = 2; start <= pages; start += 5) {
    const batch = Array.from({ length: Math.min(5, pages - start + 1) }, (_, i) => start + i);
    const results = await Promise.all(batch.map((page) => apiRequest<T[]>(`${path}?page=${page}&pageSize=${PAGE_SIZE}`)));
    results.forEach((rows) => items.push(...(Array.isArray(rows) ? rows : [])));
  }
  return items;
}

function normalizeCareer(row: any): Career {
  return { key: String(row.key), id: String(row.id || `careers/${row.key}`), name: String(row.name || ''), description: String(row.description || ''), careerGroup: String(row.careerGroup || ''), iscoGroup: String(row.iscoGroup || ''), escoUri: String(row.escoUri || '') };
}
function normalizeSkill(row: any): Skill {
  return { key: String(row.key), id: String(row.id || `skills/${row.key}`), name: String(row.name || ''), description: String(row.description || ''), skillType: String(row.skillType || ''), escoUri: String(row.escoUri || ''), reuseLevel: row.reuseLevel == null ? null : String(row.reuseLevel) };
}
function normalizeGroup(row: any): SkillGroup {
  return { key: String(row.key), id: String(row.id || `skill_groups/${row.key}`), name: String(row.name || ''), description: String(row.description || ''), code: String(row.code || ''), escoUri: String(row.escoUri || '') };
}
function normalizeResource(row: any): Course {
  return { key: String(row.key), id: String(row.id || `courses/${row.key}`), title: String(row.title || ''), canonicalUrl: String(row.canonicalUrl || ''), providerName: String(row.providerName || ''), resourceType: String(row.resourceType || ''), language: String(row.language || ''), level: row.level == null ? null : String(row.level), certificateAvailable: typeof row.certificateAvailable === 'boolean' ? row.certificateAvailable : null, verifiedOutcomeProficiency: null, raw: row };
}
function normalizeProvider(row: any): Provider {
  return { key: String(row.key), id: String(row.id || `providers/${row.key}`), name: String(row.name || ''), officialWebsite: row.officialWebsite == null ? null : String(row.officialWebsite), resourceCount: Number(row.resourceCount || 0) };
}

export interface CatalogRepository {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly error: string | null;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  retry(): Promise<void>;
  getReleaseInfo(): CatalogPayload['release'];
  getCareers(): Career[];
  getCareerById(value: string): Career | undefined;
  getCareerRequirements(value: string): Requirement[];
  getSkills(): Skill[];
  getSkillById(value: string): Skill | undefined;
  getSkillGroups(): SkillGroup[];
  getSkillsInGroup(value: string): Skill[];
  getCourses(): Course[];
  getCourseById(value: string): Course | undefined;
  getProviders(): Provider[];
  getCoursesByProvider(value: string): Course[];
  getCoursesForSkill(value: string): Array<{ course: Course; evidence: any[] }>;
  getCareersForSkill(value: string): Array<{ career: Career; type: string }>;
  getSkillsForCourse(value: string): Array<{ skill: Skill; evidence: any[] }>;
  getCoverageReport(): Array<{ career: string; essential: number; covered: number; missing: number; pct: number }>;
  getRaw(): CatalogPayload;
}

export class ApiCatalogRepository implements CatalogRepository {
  status: CatalogRepository['status'] = 'idle';
  error: string | null = null;
  private listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;
  private careers: Career[] = [];
  private skills: Skill[] = [];
  private groups: SkillGroup[] = [];
  private courses: Course[] = [];
  private providers: Provider[] = [];
  private requirements = new Map<string, Requirement[]>();
  private release: any = { release: {}, careers: 0, skills: 0, courses: 0 };
  private coverage: any = { perCareer: [] };

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify() { this.listeners.forEach((listener) => listener()); }
  async retry() { this.loading = null; this.status = 'idle'; this.error = null; await this.load(); }
  async load() {
    if (this.status === 'ready') return;
    if (this.loading) return this.loading;
    this.status = 'loading'; this.error = null; this.notify();
    this.loading = (async () => {
      try {
        const [careerRows, skillRows, groupRows, resourceRows, providerRows, release, coverage] = await Promise.all([
          getAllPages<any>('/careers'), getAllPages<any>('/skills'), getAllPages<any>('/skill-groups'), getAllPages<any>('/resources'), getAllPages<any>('/providers'),
          apiRequest<any>('/meta/release'), apiRequest<any>('/statistics/coverage'),
        ]);
        this.careers = careerRows.map(normalizeCareer);
        this.skills = skillRows.map(normalizeSkill);
        this.groups = groupRows.map(normalizeGroup);
        this.courses = resourceRows.map(normalizeResource);
        this.providers = providerRows.map(normalizeProvider);
        this.release = release;
        this.coverage = coverage;
        for (let start = 0; start < this.careers.length; start += 4) {
          const batch = this.careers.slice(start, start + 4);
          const results = await Promise.all(batch.map(async (career) => {
            const rows = await apiRequest<any[]>(`/careers/${encodeURIComponent(career.key)}/skills`);
            return [career.id, rows.map((row) => ({
              key: row.key, id: row.id, from: row.from, to: row.to, raw: row.raw || {},
              requirementType: row.requirementType === 'optional' ? 'optional' : 'essential', requiredLevel: null,
              skill: normalizeSkill(row.skill), resourceCount: Number(row.resourceCount || 0),
            } as Requirement))] as const;
          }));
          results.forEach(([id, rows]) => this.requirements.set(id, rows));
        }
        this.status = 'ready';
      } catch (error) {
        this.status = 'error';
        this.error = error instanceof Error ? error.message : 'Không tải được catalog từ Backend.';
      } finally {
        this.loading = null;
        this.notify();
      }
    })();
    return this.loading;
  }
  getReleaseInfo() { return this.release.release || {}; }
  getCareers() { return this.careers; }
  getCareerById(value: string) { const id = value.includes('/') ? value : `careers/${value}`; return this.careers.find((row) => row.id === id || row.key === keyOf(value, 'careers')); }
  getCareerRequirements(value: string) { const id = value.includes('/') ? value : `careers/${value}`; return this.requirements.get(id) || []; }
  getSkills() { return this.skills; }
  getSkillById(value: string) { const id = value.includes('/') ? value : `skills/${value}`; return this.skills.find((row) => row.id === id || row.key === keyOf(value, 'skills')); }
  getSkillGroups() { return this.groups; }
  getSkillsInGroup(_value: string) { return []; }
  getCourses() { return this.courses; }
  getCourseById(value: string) { const id = value.includes('/') ? value : `courses/${value}`; return this.courses.find((row) => row.id === id || row.key === keyOf(value, 'courses')); }
  getProviders() { return this.providers; }
  getCoursesByProvider(value: string) { const provider = this.providers.find((row) => row.id === value || row.key === keyOf(value, 'providers')); return this.courses.filter((row) => row.providerName.toLowerCase() === provider?.name.toLowerCase()); }
  getCoursesForSkill(_value: string) { return []; }
  getCareersForSkill(_value: string) { return []; }
  getSkillsForCourse(_value: string) { return []; }
  getCoverageReport() {
    return (this.coverage.perCareer || []).map((row: any) => ({ career: row.career, essential: row.essential.total, covered: row.essential.covered, missing: row.essential.total - row.essential.covered, pct: row.essential.ratio * 100 }));
  }
  getRaw(): CatalogPayload {
    return { release: this.release.release || {}, handoff: {}, manifest: { records: this.release.records }, collections: {}, reports: { coverage: '', gaps: '', legacyAudit: '' } } as CatalogPayload;
  }
}

let repository: ApiCatalogRepository | null = null;
export const getCatalogRepository = (): CatalogRepository => repository || (repository = new ApiCatalogRepository());
