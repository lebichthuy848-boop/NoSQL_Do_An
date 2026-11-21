# ArangoDB operational clone and connection status

Updated 2026-11-20. This document contains no credentials.

## Authoritative input

- Database: `skill_graph_v366_acceptance`
- ArangoDB image/version: `arangodb:3.12.11`
- Backup: `database-expansion/reports/skillgraph_v366_coverage50_batch2_20261120.tar.gz`
- Required and verified SHA256: `cf9da1eb4b34b8b42f8a6960d5499cb673b97cd131414fca31e626e758efa6ca`
- Final verification reports 25 application collections, 5,990 documents/edges, 3,099 edges, 13 graph edge definitions, 173 recommendation-eligible courses and 245 allowed `teaches` mappings.
- Protected fingerprints: `careers` `93a4f72c1db9228311ee2739b1bfde7487bd3aeb52aedbe8bfc759e0d91f4e58`; `skills` `c3b591c544d00cd1d38756195b4baffab5b0bf15a7c23c45271f174442269288`; `requires_skill` `70201dcb8882acb561f864ec41a505f3fd864e7ed5dea9dbd087efe70d749e26`.

## Existing Docker resources

Docker Desktop was inspected read-only before setup. The existing Batch 2 source clone, expansion clone, prior backend attempt, restore-check containers and their volumes were not reused or modified. In particular, `skillgraph-v366-backend-20261120` remains stopped on its original `skillgraph-v366-backend-20261120-db` and `...-apps` volumes; its prior internal bridge had no published port.

The configured host port `127.0.0.1:39529` had no listener at the initial check. Recheck it immediately before publishing; do not select a different exposure if occupied.

## New operational clone

The verified backup was extracted read-only from the workspace into two new, independent volumes:

- `skillgraph-v366-backend-operational-20261120-db`
- `skillgraph-v366-backend-operational-20261120-apps`

The bootstrap container `skillgraph-v366-backend-operational-20261120-bootstrap` and a separate auth-check container were started only on `network none`, with no port mapping. The bootstrap set a randomly generated root password. The auth-check verified it and was then stopped. Both temporary containers were removed; their two named volumes were preserved.

The official read-only `database-expansion/tests/integrity-audit-coverage50.js` script ran against the restored clone and returned `status: PASS`: all 25 collection counts matched, total documents/edges were 5,990, edge count was 3,099, all three protected fingerprints matched, graph edge definitions were 13, no dangling/duplicate/malformed relationships were found, and the recommendation gates were 173/245 with zero gate violations.

Authentication was checked before any port publication. Correct root credentials returned ArangoDB version `3.12.11`; a wrong password failed; an HTTP request without Authorization returned `401 Unauthorized`. Only after those checks, the final container `skillgraph-v366-backend-operational-20261120` was started on the dedicated bridge `skillgraph-v366-backend-operational-20261120-net`. The sole mapping is `127.0.0.1:39529->8529/tcp`; the bridge has no other peers. A second host-side probe confirmed 401 without Authorization and 200/version `3.12.11` with root Authorization.

The Backend DB bootstrap then created eight `app_*` collections and indexes, provisioned `skillgraph_backend_runtime`, set database-level `ro`, and granted `rw` only to the eight app collections. The Arango user-permission API independently reported `rw` for `app_users`/`app_profiles` and `ro` for `careers`, `skills`, `requires_skill`, `courses`, and `teaches`. Bootstrap verified a real read of 12 careers and a temporary marked write/delete in `app_audit_log` (`appWriteCheck: PASS_AND_CLEANED`). The Backend HTTP integration then passed against the authenticated operational clone using this non-root runtime principal.

## Connection outcome

`DATABASE_CONNECTIVITY_PASS = true` based on the final real-DB integration run. Evidence:

1. The final clone starts with authentication enabled and its root password already set.
2. The runtime service principal is not root and has read-only access to official catalog collections plus write access only to the application collections, if collection-level grants are available and verified.
3. Unauthenticated access to ArangoDB is rejected after host binding. **PASS** — host-side probe returned 401.
4. The final DB host mapping, if used, is exactly `127.0.0.1:39529:8529`; no LAN/Internet binding is permitted. **PASS** — inspected mapping is loopback-only.
5. The Backend completes authenticated AQL requests and returns official Batch 2 records. **PASS** — live HTTP integration returned the 12-career catalog and exercised graph/business queries.
6. The Backend API is reachable on loopback and uses no DB root credential. **PASS** — the runtime service principal has scoped grants; root credentials are not loaded by the Backend.

Additional live verification passed for graph privacy, full-career fit, recommendation gates, prerequisites, progress, Admin draft CRUD, last-Admin concurrency, and multi-user isolation. See `RUBRIC_CHECKLIST.md` for the acceptance flags and `BACKEND_RUNBOOK.md` for repeatable commands.

If authentication or host binding cannot be confirmed, stop and leave the clone unpublished. The previously failed internal-bridge attempt is not evidence of Backend connectivity.

## Secret handling

Generated bootstrap credentials are held only in the ignored local file `backend/.secrets/bootstrap.env`; runtime-only credentials are in ignored `backend/.env`. Both are excluded from Git and the Docker build context. The bootstrap file ACL is limited to the current Windows user and local sandbox account. Neither file content may be copied to logs, docs, shell output, a commit, or an image. The Backend uses only the restricted runtime principal; never pass the root credential to the Backend process.
