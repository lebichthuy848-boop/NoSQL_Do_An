# Legacy database workflow

This directory previously contained a local ArangoDB dump and a fixed-credential restore workflow. The old dump is excluded from the current integration branch tree; copies left in the local Integration checkout are ignored and are not part of the handoff.

Do not use `database/restore.ps1`. It is intentionally disabled because it targeted a shared legacy volume and used fixed test credentials. For the current React + Node.js application, use [the new-member runbook](../docs/INTEGRATION_RUNBOOK.md) with the separately supplied Batch 2 archive, a unique Compose project, a new test volume, and local secrets.

`docker-compose.yml` is only an isolated test template. Supply an ignored secret environment file and a unique project name. Never reuse a project/volume from another environment.

GitHub history before the integration handoff still contains the earlier dump and credential values. Treat historical values as exposed; this branch does not rewrite remote history.