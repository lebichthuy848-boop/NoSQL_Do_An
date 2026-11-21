# Integration Provenance

| Artifact | Source / identity | Handling |
|---|---|---|
| Frontend | GitHub `lebichthuy848-boop/NoSQL_Do_An`, main commit `68ef12b8ae58d6d43b46195e6cefae6c4be3ec12` | Read-only clone; integration branch starts at this commit. |
| Local repository baseline | Workspace branch `agent/skill-graph-coverage-expansion`, HEAD `e75535dfecf6af85808d6ac022ee3d08963c85b9` | Local `main` was this different commit. Existing workspace had untracked `backend/` and `database-expansion/`; preserved. |
| Backend Node.js source | `backend/` from the workspace at the baseline above | Copied `src/`, `tests/`, `docs/`, `scripts/`, package metadata. Did not copy `.env` or `.secrets`. |
| Operational database | User-specified container `skillgraph-v366-backend-operational-20261120`, DB `skill_graph_v366_acceptance`, host `127.0.0.1:39529` | No container or volume was started/stopped/changed. No DB writes or bootstrap were performed. Port 39529 had no listener at the verification check, so live DB content was not queried in this run. |
| Integration output | Sibling folder `NoSQL_Do_An_Integration`, branch `agent/skill-graph-integration` | Application source edits are in this copy; no commit or push. Initial frontend verification created an ignored Vitest cache in the source workspace through the temporary dependency junction; see docs/VERIFICATION_RECEIPT.md. No tracked source changes were made there. |

The Backend source folder was untracked in the supplied workspace; this provenance records the exact local source state available at integration time. Backend docs contain prior Batch 2 integrity/connectivity reports, which are not presented here as a fresh live DB verification.
