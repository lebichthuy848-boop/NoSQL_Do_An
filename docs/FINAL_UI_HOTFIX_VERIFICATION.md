# Final UI Hotfix Verification

**Date:** 2026-11-21 · **Branch:** `integration/skillgraph-stagec-20261121` · **Starting commit:** `d87c85d3a8bc8ffc21f8aefa342be53ab11355ad`
**Scope:** Integration workspace only. No Backend source, catalog data, database, backup, or credentials were changed.

## Result

The confirmed Frontend issues in BUG-01 through BUG-05 were fixed. Static source review covered the User routes, all 13 Admin routes, Frontend API call sites, Backend route/authorization handling, Vite proxy settings, and the existing test/runbook evidence. A stale response race in the generic Admin draft table was also fixed.

This hotfix has passing unit tests and builds. It is **not certified as demo-ready yet**: the isolated E2E database was stopped, Docker access was denied, and no browser automation package was installed, so current User/Admin Browser E2E, live API integration, and a fresh database integrity comparison could not be run. See the unverified items below.

## Findings and changes

| ID / priority | Finding and evidence | Change |
|---|---|---|
| BUG-01 · P1 | `MyLearningPage` included resources in “Tất cả” only while a saved/planned/viewed/completed flag remained, while the action always said “Lưu”. Removing the last flag could remove the row immediately. | The action now shows its state and next action, confirms when unsaving removes the last tracked state, disables repeated writes per resource, and reports saving/success/failure. Other flags and notes are preserved. API failure does not change local state. |
| BUG-02 · P1 | `AuthProvider` used a blocking refresh on window focus; `UserGate` replaced the route content while `loading` was true. This could unmount the current page. | Focus checks now run silently, coalesce while another check is pending, and time out after 25 seconds so the in-flight guard can release and retry later. Session revision guards prevent stale checks from restoring a logged-out or replaced user. Route navigation starts at the top; Back/Forward restores a saved position by history key. Expired/revoked sessions and role changes still apply from `/auth/me`. |
| BUG-03 · P1 | Career card/detail actions awaited the API but showed no success, selected state, progress state, or local error. | Both use the same action component. It disables duplicate clicks, updates only after Backend success, displays errors, marks the current goal, and links to “Kỹ năng của tôi”. The career goal page also marks the selected goal and disables selecting it again. |
| BUG-04 · P1 | `/dashboard` was mixed into the public navigation, while the other personalized routes were difficult to find. | Public links are separated from a signed-in User “Không gian cá nhân” menu. The mobile drawer includes the same User links. Admin receives an Admin shortcut; Guests see public links only. Existing `UserGate`/`AdminGate` and Backend role checks remain in place. |
| BUG-05 · P1 | Notes saved on blur but failures were swallowed by the editor; there was no visible retry. A delayed older response could also supersede the latest draft. Independent review found an A → B → A case where a revert to the old saved value could be dropped while B was pending. | Added an explicit save/retry action, visible save/error status, an in-memory draft per resource, and a serial save queue that also queues a revert when an earlier write is pending. Drafts clear only after Backend confirmation. Store generations ignore responses from a prior login, and switching/clearing profiles drops private drafts. Completion remains separate from skill ownership. |
| Audit · P2 | Admin draft table loads could finish out of order after a filter change or unmount. | Added request generations so stale responses cannot replace the current table rows or loading state. |
| Audit · P2 | Desktop personal navigation stayed open after selecting a destination. | Selecting a personal link closes its `<details>` menu. |
| BUG-06 · audit only | The local `catalog-v366.json` snapshot maps the named resources to skills required by Software Developer; it does not contain `auto_recommendation_allowed` for each edge. | No catalog or mapping was changed. The live gate for each named mapping could not be checked in this run; details are below. |

## Frontend → API → database map

This table is based on the Frontend call sites, `backend/src/server.mjs`, `backend/src/user-data.mjs`, `backend/src/catalog.mjs`, and `backend/src/admin.mjs`. It describes the implemented contract; a successful route alone is not treated as proof of end-to-end behavior.

| Frontend area | API used | Database scope / access |
|---|---|---|
| Registration, login, session, logout, password flows, account name | `/auth/register`, `/auth/login`, `/auth/me`, `/auth/logout`, `/auth/change-password`, `/auth/forgot-password`, `/auth/reset-password` | `app_users`, `app_sessions`, password-reset records, and `app_audit_log`; Backend validates roles and session state. Email reset remains unavailable until email delivery is configured. |
| Public careers, skills, resources, providers, taxonomy, coverage | `/careers`, `/careers/:id`, `/careers/:id/skills`, `/skills`, `/skills/:id`, `/skills/:id/resources`, `/resources`, `/resources/:id`, `/providers`, `/providers/:id/resources`, `/skill-groups`, `/skill-groups/:id/skills`, `/statistics/coverage` | Read-only core catalog collections and graph edges. Pagination/filtering is handled by the API and catalog repository. |
| Skill Graph | `/graph/neighborhood` | Read-only core graph traversal; Backend filters private node types and validates requested node types. |
| Personal dashboard and career goal | `/me`, `/me/progress`, `/me/career-goal` | User-owned `app_profiles`; selecting a career updates its career key and retains declared skill keys. |
| My Skills, Skill Gap, Career Fit | `/me`, `/me/skills`, `/me/skill-gap`, `/me/career-fit` | User-owned skill keys in `app_profiles`; calculations read core `careers`, `skills`, and `requires_skill`. Existing Career Fit/Skill Gap formula was not changed. |
| Recommendation and Learning Path | `/me/recommendations`, `/me/learning-path` | Reads the user profile plus core `courses`, `teaches`, `requires_skill`, and approved `skill_prerequisite`. Both recommendation gates and prerequisite direction remain unchanged. |
| My Learning | `/me/resources/:id/state`, `/me/completed-resources`, `/me/completed-resources/:id` | Saved/planned/viewed/note/completed values in that User’s `app_profiles`. No localStorage data is used as the source of truth. |
| Admin dashboard, database status, audit, notifications | `/admin/statistics`, `/admin/database/status`, `/admin/audit-log` | Read-only catalog counts/status plus `app_audit_log`; notifications summarize currently supported API state. |
| Admin Users and account | `/admin/users`, `/admin/users/:id`, `/auth/me` | User/profile/session records in `app_*`; Backend protects the last active Admin and revokes sessions on role/status changes. |
| Admin Providers, Resources, Course–Skill Mapping | `/admin/providers`, `/admin/resources`, `/admin/mappings` and their detail/review routes | Drafts and audit events in `app_*`. No CRUD route writes to the 25 core collections. |
| Admin Careers, Skills, Career–Skill, Prerequisites, Database | Public catalog routes or explicit read-only/availability view | Core records are not editable through the Admin UI. Prerequisite CRUD is stated as unsupported; Database page exposes status only. |

The 13 Admin routes reviewed were Dashboard, Users, Careers, Skills, Providers, Courses/Resources, Course–Skill Mappings, Career–Skill, Skill Prerequisites, Database, Activity Logs, Notifications, and Admin Account. Draft forms use create/edit/delete/review only on supported `app_*` draft types. The existing Stage C receipt records the limitations of its last Admin Browser rerun; this hotfix did not alter Backend Admin endpoints.

## Independent review

The Reviewer found the note A → B → A race, which was fixed and covered by regression tests. Its follow-up also found a missing timeout on the session refresh and the open desktop menu behavior; both were corrected. The last Reviewer verdict was **REWORK before these final two corrections**. No further Reviewer pass was run; the final corrections were checked by TypeScript/Vite build, unit tests, and focused diff inspection.

## Recommendation review

For Software Developer (`careers/occ_9ba015506d61d17d5513b0`), the local snapshot shows:

- **Acquiring Core ABAP Skills** maps to ABAP (`skills/skill_67049dc3850ce2ccedf20c`), an Optional Software Developer skill, with `direct_topic` evidence.
- **An Introduction to R** maps to R (`skills/skill_979ed10dfd497190b41eb3`), an Optional Software Developer skill, with `direct_topic` evidence.
- **Accessibility on the web** maps to two Optional Software Developer skills (screen reader and W3C standards), both marked `partial`. W3C standards is also required by Web Developer.

The recommendation implementation scopes mappings to the selected career’s missing skill IDs and requires literal `true` for both `course.recommendation_eligible` and `teaches.auto_recommendation_allowed`; it groups by resource ID. This supports the relevance and no-cross-career-leak logic for these rows. The local snapshot lacks the per-edge mapping gate, and the live DB was unavailable, so this run does not claim those three edges’ gates were individually re-read. Prior Stage B/C receipts record aggregate integrity of 173 eligible resources and 245 allowed mappings, but those receipts are not a substitute for a live check of these exact rows. No data was edited.

## Verification executed

| Check | Result |
|---|---|
| Frontend Vitest: `npm test -- --configLoader runner --no-cache --no-fsModuleCache` | PASS — 7 files, 28 tests |
| Frontend TypeScript + Vite production build: `npm run build -- --configLoader runner --outDir %TEMP%\skillgraph-ui-hotfix-final-20261121b` | PASS — 3,072 modules. Output was written under `%TEMP%`; repository `dist` was not overwritten. Existing bundle-size warning remains (about 1.15 MB minified, above 500 kB). |
| Backend unit tests: `npm test --prefix backend` | PASS — 29 tests |
| Backend build: `npm run build --prefix backend` | PASS — 22 files checked |
| `git diff --check` | PASS — no whitespace errors; Git reports its normal LF→CRLF conversion notice for edited files. |
| Recommendation mapping audit | Static local snapshot and code review only; exact per-edge live gate not rechecked. |

The first default Vite invocation could not write its bundled config into the shared `node_modules` junction (`EPERM`). The successful commands use Vite’s `--configLoader runner` and write build output to `%TEMP%`.

## E2E and data integrity status

No current Browser E2E or API integration was run. The E2E database port `127.0.0.1:39531` had no listening socket; Docker CLI could not connect to its named pipe (`permission denied`); Playwright and Puppeteer are not installed. No container was started and no DB write was attempted. Consequently:

- User flows including actual F5/login persistence, tab/focus scroll, save/unsave confirmation, slow-note A → B → A, and mobile navigation need a browser run.
- Admin CRUD/review and Admin responsive behavior need a current browser run. Prior receipts remain historical evidence only; they are not reported as this hotfix’s E2E pass.
- Multi-user isolation and current authorization were not re-exercised against a live DB. Backend unit tests did pass, including cross-role endpoint denial, session behavior, and graph privacy.
- There was no before/after DB snapshot in this run because no DB was available and no mutation occurred. The source diff contains no database, migration, backup, or operational-data changes. Prior Stage B/C receipts report 25 core collections, 5,990 documents/edges, 3,099 edges, and matching protected fingerprints; this report does not claim a fresh integrity measurement.

## Remaining limitations and manual verification

- Forgot-password still returns the documented unavailable response until email delivery is configured.
- Named recommendation rows still need an individual live check of `auto_recommendation_allowed` when the verified E2E DB is available.
- The bundle-size warning is unchanged and is not required for the behavioral hotfix.
- Before calling the demo fully accepted, run the User journey and the Admin draft CRUD/review flows in a browser against the isolated E2E database, then compare core collection counts/fingerprints and verify the exact recommendation rows.

## Run locally

Use the existing local runtime configuration and approved database target:

1. Start Backend from the repository root with `npm start --prefix backend` (Backend listens on `127.0.0.1:39530`).
2. In another terminal run `npm run dev` (Vite uses `127.0.0.1:5174` and proxies `/api/v1` to Backend port `39530`).
3. Open `http://127.0.0.1:5174`. Do not point the Backend at operational port `39529` for mutation tests.
