# Backend evidence checklist for the NoSQL rubric

Updated 2026-11-20. This checklist records Backend and database evidence only; it does not claim an overall project score.

## Mục 5 — Database

| Evidence item | Status | Evidence |
|---|---|---|
| Official Database and Batch 2 source identified | PASS | Required backup SHA256 and final verification are recorded in `DATABASE_CONNECTION.md`. |
| Backup restore into an independent environment | PASS | Official Batch 2 backup was restored to two new operational volumes; the checked-in integrity audit passed. |
| Core counts and fingerprints after restore | PASS | 12 careers, 420 skills, 932 requirements, 5,990 documents/edges, 3,099 edges, 13 graph edge definitions; protected fingerprints matched. |
| Recommendation gate integrity | PASS | 173 eligible courses and 245 allowed mappings; zero gate violations in the restored clone. |
| Backend API querying live ArangoDB | PASS | Authenticated real-DB HTTP integration queried catalog, graph, profile, learning and Admin APIs on the operational clone. |
| Advanced AQL for business endpoints | PASS | Live integration verified career fit, skill/resource joins, recommendation gates, prerequisites, and learning path queries. |

## Mục 6 — Import/Export, Backup/Restore

| Evidence item | Status | Evidence |
|---|---|---|
| Source backup integrity | PASS | Required SHA256 verified before restore. |
| Restore verification on separate volumes | PASS | Official source backup restore passed the integrity audit on the new operational volumes. |
| Backend backup create/list/verify | PASS | `scripts/backup-db.ps1` created an authenticated `arangodump` archive; `list` and `verify` passed SHA256 and archive structure checks. |
| Restore of a Backend-generated archive | NOT RUN | The generated Backend archive was verified but not separately restored. The tested restore was the official Batch 2 source backup into the isolated operational clone. |
| Restore interface | CLI ONLY | No HTTP restore endpoint is exposed. Keep restore limited to a reviewed, independent clone workflow; never target LIVE, baseline, or accepted clones. |
| Demo evidence/instructions | PASS WITH LIMITS | Windows commands are documented in `BACKEND_RUNBOOK.md`; a newly generated archive can be listed and verified. |

## Mục 7 — Queries in ArangoDB GUI

| Evidence item | Status | Evidence |
|---|---|---|
| AQL scripts prepared for Web Interface demonstration | PREPARED | Read-only queries are in `scripts/demo-queries.aql`; required bind values are in `BACKEND_RUNBOOK.md`. |
| GUI query execution | NOT DONE | No ArangoDB Web Interface execution was performed. API/integration tests do not count as GUI evidence. |

## Mục 8 — Database connection to application

| Evidence item | Status | Evidence |
|---|---|---|
| Authenticated, isolated operational clone | PASS | New volumes/container, authentication, runtime principal, collection grants and loopback-only port are recorded in `DATABASE_CONNECTION.md`. |
| Backend connects to ArangoDB | PASS | Real HTTP integration used the non-root runtime account against ArangoDB 3.12.11. |
| API returns official database records | PASS | Live catalog endpoint returned 12 official careers; graph/business queries read the verified Batch 2 collections. |

## Mục 9 — Application demo

| Demo item | Status | Evidence |
|---|---|---|
| User administration | PASS | Real-DB Admin tests cover multiple users/Admin, roles, status changes, pagination, old-session revocation and last-active-Admin concurrency. |
| Database add/edit/delete | PASS WITH LIMITS | CRUD exercised only on test-marked `app_*` drafts; official catalog collections remain read-only. |
| Database backup/restore | PARTIAL | Backend backup create/list/verify passed; official source backup restore passed. Restore of the generated Backend archive was not run. |
| Skill Graph business functions | PASS | Live tests cover empty/full skill profiles, 12-career fit, skill gap, strict recommendation gates, prerequisite direction, no-resource path and progress. |
| Supporting features | PASS | Profile/progress, Admin statistics, audit behavior and multi-user isolation were exercised on the operational clone. |

## Final acceptance flags

| Flag | Current value | Reason |
|---|---:|---|
| `DATABASE_CONNECTIVITY_PASS` | `true` | Authenticated Backend HTTP queries succeeded against the operational ArangoDB clone. |
| `BACKEND_BUILD_PASS` | `true` | `npm run build --prefix backend` passed; 20 files checked. |
| `AUTHORIZATION_TEST_PASS` | `true` | Guest/User/Admin boundaries, ownership, trusted Origin, reset checks and invalidation of old cookies after role changes passed. |
| `BUSINESS_API_TEST_PASS` | `true` | Real-DB career, skill, gap, fit, recommendation, learning-path and progress checks passed. |
| `ADMIN_API_TEST_PASS` | `true` | Real-DB user/draft CRUD, approval gates and final-Admin protections passed. |
| `MULTI_USER_TEST_PASS` | `true` | At least two test users and Admin remained isolated; cleanup ran successfully. |
| `BACKEND_READY_FOR_FRONTEND_INTEGRATION` | `true` | Backend build, contract and live API verification passed. The current Frontend still needs its API adapter/session wiring and documented UI changes; no Frontend integration is claimed. |
| `FULL_APPLICATION_E2E_PASS` | `false` | The Frontend was not changed or integrated, so end-to-end application testing was not run. |
