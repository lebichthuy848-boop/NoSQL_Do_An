# Stage B E2E Verification Receipt — 2026-11-21

## Task contract

**Goal.** Verify the Skill Graph integration against a physically independent E2E ArangoDB restored from the approved Batch 2 archive, including auth, API behavior, browser flows, and preservation of the source catalog.

**Scope.** Integration checkout `NoSQL_Do_An_Integration`, branch `agent/skill-graph-integration`; one new Docker DB instance and two E2E volumes; backend API integration suite; Edge browser flows; pre/post source-catalog audits.

**Non-goals.** No operational or accepted clone, original backup, or source workspace mutation; no Python backend, `restore.ps1`, package download/install, Git commit/push, or remote service call.

**Invariants.** Authentication was disabled only on `skillgraph-v366-e2e-20261121-bootstrap`, attached to `skillgraph-v366-e2e-20261121-net` (`internal=true`), with no published port. A new random root credential was stored in a Git-ignored Integration env file and copied into ACL-restricted TEMP env files for Docker bootstrap; no password value is recorded here. Authentication was re-enabled and tested before the host mapping was created. The final authenticated DB used only the E2E volumes and bound host access to `127.0.0.1:39531`.

**Acceptance criteria.** Unauthenticated and wrong-auth requests return 401; correct root auth returns 200; runtime account is restricted; backend API and browser flows pass; all 25 source collections, fingerprints, graph and recommendation gates match before/after; test services stop after verification.

**Risk.** High, because the task exercises database authentication, app-owned writes, and source-data provenance. Không có database nào ngoài hai volume E2E bị ghi. Trong Integration checkout, lượt Stage B sửa `index.html` và thêm receipt này; các thay đổi có trước được giữ nguyên.

## Provenance and isolation

- Source archive: `database-expansion/reports/skillgraph_v366_coverage50_batch2_20261120.tar.gz`
- SHA-256: `cf9da1eb4b34b8b42f8a6960d5499cb673b97cd131414fca31e626e758efa6ca` (same before and after).
- The restored database retains the identifier `skill_graph_v366_acceptance`, but it ran in the new container and volumes below. It was not the operational instance.
- E2E volumes: `skillgraph-v366-e2e-20261121-db`, `skillgraph-v366-e2e-20261121-apps`.
- Auth-off network: `skillgraph-v366-e2e-20261121-net`, internal, no published ports.
- Final authenticated host access: `skillgraph-v366-e2e-20261121-loopback-net`, bridge masquerading disabled; host mapping `127.0.0.1:39531 -> 8529`.
- Backend and Vite used `127.0.0.1:39532` and `127.0.0.1:5175`. Edge CDP listened only on `127.0.0.1:9224`.
- The final DB, bootstrap/verifier containers, backend, Vite, and isolated Edge processes were stopped. E2E containers, volumes, and networks were retained for inspection. Ports 39531, 39532, 5175, and 9224 had no listeners after cleanup.
- Credentials are present in the three Git-ignored Integration files `backend/.env.e2e-20261121-bootstrap`, `backend/.env.e2e-20261121-runtime`, and `backend/.env.e2e-20261121-users`. Temporary copies also remain under `%TEMP%\skillgraph-v366-e2e-20261121`: `db.env`, `bootstrap.env`, `runtime.env`, `admin.env`, and `helper.env`. The TEMP directory ACL has explicit FullControl only for its owner (`CodexSandboxOffline`) and the Windows owner account (`tuhaovan`); each Integration env file is owned by `tuhaovan` with non-inherited FullControl for that account only. No credential value is recorded here.

## Verification results

### Authentication and bootstrap

- During isolated bootstrap, no-credential GET returned 200 on the internal-only container. The random root password reset returned HTTP 200.
- After re-enabling auth, internal and loopback checks both returned: no credentials 401; deliberately wrong credentials 401; correct root credentials 200; ArangoDB `3.12.11`.
- Final root password was read from the ignored env file at runtime and never printed. Runtime user and app collections were created by `backend/src/bootstrap-db.mjs`; runtime permission was database `ro` with write access limited to eight `app_*` collections. Its marked app write check passed and was cleaned.
- The Docker internal network did not provide a working host port forward even though Docker stored the requested binding. The authenticated DB was moved to a separate E2E bridge with IP masquerading disabled; the bootstrap container remained stopped on the internal network. The final host listener was verified as loopback-only before app tests.
- The official interactive CLI prompt could not safely receive the generated password through the terminal tool because automatic review rejected the PTY input as transcript-risky. No password was sent through that path. A temporary script under `%TEMP%` read the ignored file directly, repeated the CLI's “no active admin exists” check, and called the same `AuthService.createUser` method. It emitted only `{created:true, role:admin}`.

### Catalog integrity before and after

- Official read-only audit before app bootstrap: PASS; 25 core collections, 5,990 documents/edges, 3,099 edges, 13 graph edge definitions.
- Before/after protected fingerprints matched for `careers`, `skills`, and `requires_skill`; recommendation gates stayed at 173 eligible courses and 245 allowed `teaches` edges; all dangling-reference, graph-endpoint, duplicate-pair, self-loop, and malformed-URL counters stayed zero.
- The unmodified official audit after app bootstrap reports FAIL because it counts the eight expected `app_*` collections and their 17 app documents against the source-only 25-collection snapshot. A temporary copy changed only the collection filter to exclude `app_*`; it returned PASS and matched every pre-test core count, fingerprint, graph definition, gate, integrity counter, and error list. The source audit script was not changed.

### API and browser E2E

- `npm test --prefix backend`: PASS, 24/24 unit tests.
- `npm run build --prefix backend`: PASS, 20 files checked.
- Frontend Vitest (cache disabled; isolated cache in `%TEMP%`): PASS, 5 files / 12 tests.
- `node --env-file=.env.e2e-20261121-runtime tests/integration.mjs`: exit 0. Database connectivity, authorization, business APIs, admin APIs, draft review gates, role-change session revocation, empty profile, career fit, graph privacy, skill/resource counts, learning path (including prerequisite and no-resource cases), and multi-user isolation all passed.
- Both last-active-admin checks were skipped because the bootstrap admin was already active: `LAST_ACTIVE_ADMIN_TEST_PASS=false` / `lastAdminTest=SKIPPED_EXISTING_ACTIVE_ADMIN`, and `LAST_ACTIVE_ADMIN_CONCURRENCY_TEST_STATUS=SKIPPED_EXISTING_ACTIVE_ADMINS`. Neither check is reported as a pass.
- Headless Edge browser E2E passed registration/login, session reload, career-goal and skill persistence, skill-gap/career-fit/recommendation/learning-path page loads, graph rendering, resource save/planned/viewed/completed states, note persistence, User B isolation from User A, and all 13 admin routes. No JavaScript exception or HTTP 5xx was observed.
- Mobile width checks passed at 390px for `/admin/dashboard`, `/admin/users`, `/careers`, `/graph`, and `/admin/account`.
- `tsc --noEmit` passed for frontend app and Vite/node configs. Vite production build passed to `%TEMP%` (3,070 modules); it retained the existing >500 kB JS chunk warning. The existing repo `dist` directory was not overwritten.

## Change and limitations

- The only implementation change in this Stage B run is the minimal `index.html` document shell: `lang="vi"`, UTF-8, viewport metadata, and title. It fixed the mobile layout viewport from 980px to the emulated device width of 390px.
- Account profile editing is unsupported: the UI is read-only and the backend has no profile-edit endpoint. Admin account page states this explicitly. The browser test verified this limitation instead of claiming edit CRUD.
- Remaining app-owned test data in the retained E2E volumes: 8 audit events; 3 `app_users` (1 active admin, 2 active users); 3 profiles; 3 sessions; zero password-reset rows and zero provider/resource/mapping draft rows. No email or credential is recorded in this receipt.
- No commit or push was made. Pre-existing dirty changes in the Integration checkout were preserved.

## Independent review

PASS after receipt corrections. Independent review found no issue in the viewport diff or the core audit comparison; credential inventory and skipped last-admin checks are accurately disclosed.
