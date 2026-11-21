# Integration Task Contract

## Goal

Deliver a separate React + Node.js application copy using Frontend commit `68ef12b8ae58d6d43b46195e6cefae6c4be3ec12`, with Backend APIs under `/api/v1` and ArangoDB Batch 2 as the runtime Catalog source.

## In scope

- Integrate public Catalog, graph, taxonomy, statistics and quality summary with Node APIs.
- Integrate cookie authentication, role routing, User profile/skills/progress and Admin supported endpoints.
- Keep official Catalog CRUD read-only; use app-owned resource/provider/mapping drafts with evidence and separate approval gates.
- Configure Vite loopback proxy and document runtime settings without credentials.
- Provide accurate API mapping, run instructions, NoSQL assessment and verification receipt.

## Non-goals

- Modify the accepted ArangoDB dataset or its schema.
- Start/stop/change protected Docker containers or volumes.
- Use Backend Python, install/update dependencies, commit, push, merge, publish or deploy.
- Add network Restore or claim Browser E2E without executing the flow.

## Constraints and invariants

- Only the separate integration copy may be edited.
- No `.env` or `.secrets` file is copied into the integration copy.
- DB and service bind to loopback (`127.0.0.1:39529`, `127.0.0.1:39530`); Vite uses `127.0.0.1:5174`.
- Browser session is an HttpOnly cookie. User-owned state is server-backed, not localStorage.
- Changing career goal preserves self-declared skills. Viewed/completed resources never imply skill mastery.
- Recommendation requires both course and mapping gates; graph edges preserve `_from → _to`.
- Official careers, skills and core relations are not writable through Admin UI. Draft CRUD stays in `app_*`.
- Backup/restore remains the approved offline workflow.

## Acceptance criteria

1. The integration branch is based on the exact requested Frontend SHA and contains the Node Backend source.
2. UI calls match actual request fields, response shapes, pagination and cookie/session behavior.
3. All supported public and User routes use live APIs with honest loading/error/empty states.
4. Admin UI uses supported APIs; unavailable capabilities are clearly read-only/unsupported.
5. Frontend and Backend build plus deterministic tests pass.
6. Any unverified live DB/browser paths and residual limitations are recorded accurately.

## Verification plan

- `npm test`, `npm run build`, `npm test --prefix backend`, `npm run build --prefix backend`.
- Read-only API GET smoke only if the already-running loopback services are available.
- Do not run Backend integration tests or mutation requests against the accepted operational DB; use an isolated test DB for user/Admin mutation E2E.
- Independent code review after deterministic verification.

## Risk

High: authentication/authorization and research data provenance. No live mutation verification is permitted against the protected operational database.
