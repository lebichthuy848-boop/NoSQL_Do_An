# Backend runbook (Windows / PowerShell)

> Historical runbook for the previously verified local clone. For a new member setup, use the root Integration Runbook. Do not start or modify the fixed-name operational clone described below.

Updated 2026-11-20. Commands below use the isolated operational clone for this task; do not substitute LIVE, baseline or previously accepted clones.

## Prerequisites and current local setup

- Windows PowerShell, Node.js 22+, and Docker Desktop running.
- The backend has no third-party npm dependencies, so `npm install` is not required.
- Authenticated operational database container: `skillgraph-v366-backend-operational-20261120`.
- Database host endpoint: `http://127.0.0.1:39529`; it is bound to loopback only and rejects requests without authentication.
- Database volumes: `skillgraph-v366-backend-operational-20261120-db` and `skillgraph-v366-backend-operational-20261120-apps`.
- Runtime credentials are not in source control. Bootstrap credentials are in ignored `backend/.secrets/bootstrap.env`; runtime credentials are written separately to ignored `backend/.env`.

## Start the operational database and prepare the Backend account

From the repository root:

```powershell
docker start skillgraph-v366-backend-operational-20261120
```

The container already has authentication enabled and the verified mapping `127.0.0.1:39529->8529/tcp`. Confirm unauthenticated HTTP is still blocked:

```powershell
try { Invoke-WebRequest 'http://127.0.0.1:39529/_api/version' -UseBasicParsing } catch { $_.Exception.Response.StatusCode }
```

Expected status: `401`. Do not publish another address or port.

Run the idempotent app-collection/runtime-user bootstrap once (or after restoring a new isolated clone):

```powershell
Set-Location .\backend
node --env-file-if-exists=.secrets/bootstrap.env src/bootstrap-db.mjs
```

It creates only `app_*` collections/indexes and a separate runtime database principal. It sets the database grant to read-only, adds read/write grants only for application collections, verifies a real catalog read and temporary marked app write, then removes that test record. It does not change core collections.

Create runtime-only configuration if `backend/.env` is not present:

```powershell
.\scripts\prepare-runtime-env.ps1
```

That script copies only the non-root service account into `.env`; it refuses to overwrite an existing file. The default local Backend bind is `127.0.0.1:39530`, with Vite development origins allow-listed.

## Start and check the Backend

From `backend/`:

```powershell
npm start
```

The Backend binds to `127.0.0.1:39530`. In another PowerShell window:

```powershell
Invoke-RestMethod 'http://127.0.0.1:39530/api/v1/health' | ConvertTo-Json
Invoke-RestMethod 'http://127.0.0.1:39530/api/v1/meta/release' | ConvertTo-Json -Depth 5
```

The health response includes the connected ArangoDB version. The release response reads counts live from `skill_graph_v366_acceptance`. API schemas and endpoint details are in `API_CONTRACT.md`; no Swagger UI is currently provided.

For a secure initial Admin account, run this in a separate PowerShell window from `backend/`:

```powershell
node --env-file-if-exists=.secrets/bootstrap.env src/cli.mjs create-initial-admin
```

The CLI requires an interactive terminal, prompts for account details, hides password entry, refuses to create a second initial Admin, and prints no password. Public registration cannot assign Admin.

## Tests

From the repository root:

```powershell
npm test --prefix backend
npm run integration --prefix backend
```

The integration command uses the restricted runtime account from `backend/.env`, starts a real local HTTP server on a random loopback port, and queries the authenticated operational ArangoDB. It creates test-marked accounts/profile/session/reset fixtures only in `app_*`, then removes them. If cleanup reports failure, keep the clone isolated and inspect only `is_test` records in `app_*` before continuing.

The deterministic unit suite has no external package install or network requirement.

## AQL GUI demonstration

Open `http://127.0.0.1:39529`, authenticate with the locally stored root credential, and select database `skill_graph_v366_acceptance`. Queries are in `scripts/demo-queries.aql`; run each commented query separately in the ArangoDB Web Interface. The queries are read-only.

Bind variables for the parameterized queries:

- Requirements: `{ "careerId": "careers/<key copied from query 1>" }`
- Career Fit: `{ "skillIds": ["skills/<existing-key>"] }` (use `[]` to show an empty skill profile)
- Recommendation: `{ "skillId": "skills/<existing-key>" }`
- Prerequisite: `{ "dependentSkillId": "skills/<existing-key>" }`

The Career Fit query uses binary presence only and is not proficiency. The prerequisite query uses only approved, evidence-backed `dependent → foundation` edges. The recommendation query requires both literal-true gates.

## Backup and restore workflow

Create a logical ArangoDB backup using the restricted service account:

```powershell
.\scripts\backup-db.ps1 -Action backup
.\scripts\backup-db.ps1 -Action list
.\scripts\backup-db.ps1 -Action verify -BackupName '<name from list>'
```

Archives and `index.json` are stored in ignored `backend/.backups/`; `verify` checks archive readability, required collection structure/data files and SHA256. Each backup has a unique name; the script refuses to overwrite prior archives.

Restore must be tested only in a new independent clone with new DB/app volumes. Never restore into LIVE, the operational container, baseline, or an accepted clone. A restore of the official Batch 2 source backup into separate new volumes was performed for this task and passed the checked-in integrity audit. There is no network restore endpoint (`501 BACKUP_WORKFLOW_CLI_ONLY`); keep restore as a reviewed offline operation.

## Stop services

- Stop the Backend with `Ctrl+C` in its PowerShell window.
- Stop the operational clone, preserving its volumes, when not in use:

```powershell
docker stop skillgraph-v366-backend-operational-20261120
```

Restart it with the `docker start` command above. Do not remove the operational volumes as part of routine shutdown.

## Stage C AQL demo bind variables

Run each read-only query in backend/scripts/demo-queries.aql separately in ArangoDB Web Interface. Select skill_graph_v366_acceptance. Query 1 returns a career key; the skill queries or career skills query provide skill keys for later binds.

- Skill search/filter: { "search": "data", "skillType": "" }
- Skill Gap: { "careerId": "careers/<existing-key>", "skillIds": [] }
- Learning-path prerequisite chain: { "dependentSkillId": "skills/<existing-key>" }
- Multi-hop graph traversal: { "startVertex": "careers/<existing-key>" }
- Coverage and unfiltered skills list: no bind variables.

All recommendation/resource results require both recommendation_eligible and auto_recommendation_allowed to be literal true. Skill Gap and Career Fit measure declared skill presence only, not proficiency.

## Final release checks (2026-11-21)

From the repository root and only against the isolated E2E DB, run the read-only Batch 2 integrity audit:

```powershell
node --env-file=backend/.env.e2e-20261121-runtime backend/scripts/audit-e2e-integrity.mjs
```

To record a small Import/Export round trip, the script creates one marked row in `app_audit_log`, exports it through an AQL cursor, compares fields and SHA-256, and removes its own row:

```powershell
node --env-file=backend/.env.e2e-20261121-runtime backend/scripts/import-export-e2e-test.mjs
```

Both scripts reject a database URL/name or runtime principal outside the approved E2E target. The integrity report is in `docs/evidence/integrity-audit-e2e-2026-11-21.json`. The UI displays that dated PASS snapshot only when DB/version/core collection names match; it is not a live content check. Query 13 in `scripts/demo-queries.aql` still needs a separate Web Interface run and screenshot if GUI evidence is required. Do not restore the unavailable historical archive or create a restore on the demo volume.
