# Backend security status

Updated 2026-11-20 after live integration and independent review repair. This report covers the Backend and isolated operational clone; it does not claim that the complete application has been security-tested end to end.

## Controls verified

- Backend work is confined to `backend/`. Frontend files, root/frontend configuration, `database-expansion/`, Git history and previously accepted Docker resources were not modified.
- The official Batch 2 backup SHA256 was checked before restore. The operational clone uses two new volumes, enabled ArangoDB authentication and a loopback-only host mapping.
- Anonymous ArangoDB access returned 401. The Backend connects as `skillgraph_backend_runtime`, not root. The runtime principal has database-level read access and write access only to eight `app_*` collections; official catalog collections remain read-only.
- Public catalog and graph APIs read the verified Batch 2 data. Guest graph queries reject private `users`/`learning_plans` node types and do not traverse `targets_career`; real-DB regressions check career and skill neighborhoods for user data.
- Registration defaults to `user` and rejects client-controlled Admin roles. Passwords use salted scrypt; sessions store token digests and use HttpOnly/SameSite cookies. Production cookie configuration enables Secure. State-changing cookie requests require a trusted Origin.
- Login failures are rate-limited. Reset tokens are stored as digests, expire, are single-use, and revoke existing sessions after a successful reset. Reset email delivery is not configured; the forgot-password endpoint correctly returns 503 rather than claiming an email was sent.
- User profile, skills, career goal, progress and resource state are scoped to the authenticated user. Live multi-user tests verify isolation and changing career goal preserves skills.
- Admin routes require the Admin role. Admin content is stored in app-owned draft collections; approval requires evidence and the recommendation gates. Concurrent demotion/disable uses an exclusive Arango transaction; the live race test returned one success and one `409 LAST_ACTIVE_ADMIN`, leaving one active test Admin. Role/status changes and session revocation share an exclusive transaction over `app_users` and `app_sessions`; live tests confirm old cookies return 401 after promotion and demotion.
- AQL uses bind parameters and input validation. Errors returned to clients are sanitized. Integration cleanup removes only run-associated test actors/audit rows and confirms cleanup.
- Independent Reviewer initially found a public graph leak, Admin concurrency race, and role-change session window. These were fixed and re-tested against the operational clone; final independent Reviewer verdict: **PASS**.

## Verification

- `npm run build --prefix backend` — PASS (20 source files checked).
- `npm test --prefix backend` — PASS (24/24).
- `npm run integration --prefix backend` — PASS against the authenticated operational ArangoDB clone. Connectivity, authorization, business, Admin, graph privacy, full-career fit, resource count, prerequisite, concurrency and multi-user flags passed.
- Backup create/list/verify ran with the restricted runtime account. Archive SHA256 and collection structure/data files verified. The official source backup restore was integrity-audited on the new volumes; a separately restored copy of the newly generated Backend archive was not tested.
- ArangoDB Web Interface GUI query execution was not performed. The AQL demo script is prepared but should be demonstrated separately.

## Remaining limitations

- Email transport for password recovery is not configured. Forgot-password returns 503; the reset implementation is tested with a marked single-use token fixture.
- Login throttling is in-memory for this single local Backend process; it is not a distributed rate limiter for multi-instance deployment.
- The current Frontend does not yet consume the API. Its HTTP adapter, cookie credentials, account/Admin pages and previously mapped store/UI behavior still need integration. Full application E2E has not been run.
- The generated Backend backup archive has passed create/list/verify but has not itself been restored. Restore remains an offline, reviewed operation; no HTTP restore endpoint is provided.
- Production deployment, HTTPS termination, proxy trust settings and production-origin CORS values have not been configured or tested.
