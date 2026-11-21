# Frontend → Backend API mapping

Audit performed 2026-11-20 from the checked-in React/Vite source. This report is read-only with respect to the Frontend; no Frontend files were changed.

## Current data path

The rendered pages call `getCatalogRepository()` in `src/repositories/catalogRepository.ts`. The default adapter imports `src/data/generated/catalog-v355.json`. Its `VITE_DATA_SOURCE=api` implementation is a placeholder whose methods throw. `src/repositories/HttpCatalogClient.ts` contains a separate GET-only client, but the repository factory and pages do not use it. The client also does not send cookies (`credentials: "include"`). Therefore the APIs below describe the backend integration target; this checked-in Frontend does not yet consume them.

The checked-in UI labels data as v3.55 / Sprint 92 and contains v3.55 counts. These are not the official Batch 2 database figures. Backend responses must come from ArangoDB and its verified v3.66 Batch 2 clone.

## Route and API mapping

| Frontend route | Page/component and current data/actions | Current adapter/store | Backend API target | Official ArangoDB data |
|---|---|---|---|---|
| `/` | Home KPIs, release banner, Essential coverage | Local catalog payload | `GET /api/v1/meta/release`; `GET /api/v1/statistics/coverage`; catalog summary | `careers`, `skills`, `courses`, `teaches`, `requires_skill` |
| `/dashboard` | Goal, self-declared Essential count, saved-resource count | `useUserStore` in browser localStorage | `GET /api/v1/auth/me`; `GET /api/v1/me`; `GET /api/v1/me/progress` | `app_users`, `app_profiles`, `app_sessions`; catalog collections for derived totals |
| `/careers` | Search and group filter | `repo.getCareers()` | `GET /api/v1/careers?search=&group=&page=&pageSize=` | `careers` |
| `/careers/:id` | Career detail, Essential/Optional requirements, coverage, set goal | `getCareerById`, `getCareerRequirements`, local `setCareer` | `GET /api/v1/careers/:id`; `GET /api/v1/careers/:id/skills`; authenticated `PUT /api/v1/me/career-goal` | `careers`, `requires_skill`, `skills`, `teaches`; goal in `app_profiles` |
| `/skills` | Search, skill type filter, pagination | `repo.getSkills()` | `GET /api/v1/skills?q=&type=&page=&pageSize=` | `skills` |
| `/skills/:id` | Skill detail, requiring careers, mapped resources and evidence | `getSkillById`, `getCareersForSkill`, `getCoursesForSkill` | `GET /api/v1/skills/:id`; `GET /api/v1/skills/:id/resources`; career references in detail | `skills`, `requires_skill`, `teaches`, `courses`, `providers` |
| `/skill-taxonomy` | Search skill groups and browse members | `getSkillGroups`, `getSkillsInGroup` | `GET /api/v1/skill-groups`; `GET /api/v1/skill-groups/:id/skills` | `skill_groups`, `esco_skill_group`, `skills` |
| `/resources` | Search title/provider, type filter, pagination, save toggle | Local catalog plus local saved IDs | `GET /api/v1/resources?search=&provider=&type=&page=&pageSize=`; authenticated saved-resource operation under `/api/v1/me` | `courses`, `providers`, `offered_by`; per-user saved state in `app_profiles` |
| `/resources/:id` | Resource detail, mapped skills/evidence, save toggle | `getCourseById`, `getSkillsForCourse`, local store | `GET /api/v1/resources/:id`; saved-resource operation under `/api/v1/me` | `courses`, `teaches`, `skills`, `offered_by`, `providers` |
| `/providers` | Provider search, website, number of resources | `getProviders`, `getCoursesByProvider` | `GET /api/v1/providers`; optional `GET /api/v1/providers/:id/resources` | `providers`, `offered_by`, `courses` |
| `/graph` | Career/skill/resource/taxonomy neighborhood, node/edge filters | `GraphExplorer` and `graphModel` query local repository | `GET /api/v1/graph/neighborhood?focusId=&mode=&nodeTypes=&edgeTypes=&limit=` | Existing graph edges only; preserve `_from → _to`; no inferred prerequisite edges |
| `/career-goal` | Select target career | Local `selectedCareerId` | `GET/PUT /api/v1/me/career-goal` | `app_profiles`; validate key against `careers` |
| `/my-skills` | Add/remove owned skills | Local `declaredSkillIds` | `GET/PUT/DELETE /api/v1/me/skills` | User-owned profile state in `app_profiles`; skill keys validated against `skills` |
| `/skill-gap` | Essential self-declaration gap and percentage | `calculateEssentialSelfDeclaration` + local store | `GET /api/v1/me/skill-gap` | `app_profiles`, `careers`, `requires_skill`, `skills` |
| `/learning-path` | Up to three resources for each missing Essential skill | Local store and catalog links | `GET /api/v1/me/learning-path` | `app_profiles`, `requires_skill`, `teaches`, `courses`, `skill_prerequisite`; both recommendation gates must be true |
| `/my-learning` | Saved/planned/viewed toggles and private notes; “viewed” is explicitly not completion | Local Zustand persistence | Per-user saved/planned/viewed/note operations under `/api/v1/me`; completed-resource API remains separate | User-owned fields in `app_profiles`; resource keys checked in `courses` |
| `/statistics` | Legacy v3.55 totals, graph relation counts, coverage | `StatisticsDashboard` reads raw local payload; one total is hard-coded | `GET /api/v1/statistics/coverage`; public catalog release/summary where appropriate; admin-only full stats | Official collections and verified coverage calculation |
| `/data-quality` | Legacy manifest warnings and missing coverage list | Raw local v3.55 payload | Catalog release/provenance and coverage APIs; sensitive/admin diagnostics remain admin-only | Database metadata and current official collections |
| `/about`, unmatched route | Static content / not-found page | None | None | None |

## Frontend gaps and handoff items

1. No login, registration, password-reset, account, or Admin route exists in this snapshot. Backend auth and Admin APIs follow the task requirements, but field-level compatibility with the parallel UI cannot be verified yet.
2. The current local store has no account or server session. Its adapter must be connected to the API after the Frontend owner hands it off. Cookie-based sessions require the future HTTP client to use `credentials: "include"` and an allowed origin.
3. `setCareer` in `src/stores/userStore.ts` clears `declaredSkillIds`. This conflicts with the required rule that changing a career goal preserves owned skills. The Backend preserves skills; the Frontend owner should remove this clearing behavior during integration.
4. The existing Skill Gap and Learning Path views show only Essential gaps. The Backend contract returns Essential and Optional gaps; the Frontend can choose its presentation after handoff.
5. “Viewed” is a local interaction state and must not be converted into course completion or skill proficiency. Completion is a separate authenticated operation.
6. Current graph rendering reads the whole local catalog. Integration must use paginated/filtered graph-neighborhood responses and retain source edge direction.
7. Labels and counts on the current Home, Statistics, and Data Quality pages are tied to v3.55. They need a later Frontend data-source update before they can represent Batch 2.

## Source files reviewed

- `src/App.tsx`
- `src/repositories/catalogRepository.ts`
- `src/repositories/HttpCatalogClient.ts`
- `src/stores/userStore.ts`
- `src/types/catalog.ts`
- `src/features/graph/GraphExplorer.tsx`
- `src/features/graph/graphModel.ts`
- `src/features/skillGap/skillGapModel.ts`
- `src/features/learning/MyLearningPage.tsx`
- `src/features/statistics/StatisticsDashboard.tsx`
- `docs/PROPOSED_API_CONTRACT.md`
- `docs/DATA_VERSION.md`
