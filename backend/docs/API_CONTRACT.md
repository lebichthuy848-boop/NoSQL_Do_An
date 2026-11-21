# Backend API contract

Base URL: `http://127.0.0.1:39530/api/v1` for the local operational setup. All endpoints use UTF-8 JSON unless noted. API version: `v1`.

This contract describes the current React routes and Node/ArangoDB Backend API on the integration branch.

## Shared conventions

- Catalog collection endpoints return a JSON array. Pagination is sent in `X-Total-Count`, `X-Page`, and `X-Page-Size`; query parameters are `page` (default 1) and `pageSize` (default 25, maximum 100).
- Detail and mutation endpoints return the resource object directly (or the named object shown below), without a `data` wrapper.
- Errors use `{ "error": { "code": "...", "message": "..." } }`. Internal database details, stack traces and secrets are not returned.
- Catalog IDs accept a key or a full `collection/key` identifier. IDs are validated against the corresponding collection before use.
- Browser authentication uses the opaque `sg_session` cookie (`HttpOnly`, `SameSite=Strict`, `Path=/api/v1`, expiring with the configured session TTL; `Secure` in production). Cookie-authenticated mutations require a trusted `Origin`. CORS allows only configured exact origins and credentials.
- Common failures: `400 VALIDATION_ERROR` / `INVALID_JSON`, `401 AUTHENTICATION_REQUIRED` / `INVALID_CREDENTIALS`, `403 FORBIDDEN` / `ORIGIN_NOT_ALLOWED`, `404 NOT_FOUND`, `409 CONFLICT`, `429 LOGIN_RATE_LIMITED`, `500 INTERNAL_ERROR`, `503` for unavailable DB or unconfigured email delivery.

## Public catalog APIs

Guest, User, and Admin may read these endpoints. They expose catalog data only; private profile data always requires a User session.

| Method and endpoint | Request | Response and validation | Collections | Frontend use |
|---|---|---|---|---|
| `GET /meta/release` | None | Release/count object from live DB: release label, Arango version, database name, career/skill/course/requirement counts and source label. | `careers`, `skills`, `courses`, `requires_skill`, Arango version endpoint | Home and catalog provenance |
| `GET /careers` | `search` or `q`, `group`, `page`, `pageSize` | Array of `{key,id,name,description,careerGroup,iscoGroup,escoUri}` plus pagination headers. Search is literal text; paging is bounded. | `careers` | `/careers` |
| `GET /careers/:id` | Career key or ID | Career object plus `skillCounts: {essential,optional,total}`; 404 if missing. | `careers`, `requires_skill` | `/careers/:id` |
| `GET /careers/:id/skills` | Career key or ID | Array of requirement records with `requirementType`, `requiredLevel: null`, related skill object, edge identity and `resourceCount`. No proficiency is inferred. | `careers`, `requires_skill`, `skills`, `teaches` | `/careers/:id` |
| `GET /skills` | `search` or `q`, `type`, `page`, `pageSize` | Array of `{key,id,name,description,skillType,escoUri,reuseLevel}` plus pagination headers. | `skills` | `/skills` |
| `GET /skills/:id` | Skill key or ID | Skill object, linked careers with Essential/Optional type, approved prerequisites and linked-resource count from `teaches` edges. | `skills`, `requires_skill`, `skill_prerequisite`, `teaches` | `/skills/:id` |
| `GET /skills/:id/resources` | Skill key or ID; `page`, `pageSize` | Paged `{resource,edge}` rows with mapping evidence. Only application drafts with both gates approved are included; official mapped resources remain available for catalog browsing. | `skills`, `teaches`, `courses`, `app_mapping_drafts`, `app_resource_drafts` | `/skills/:id` |
| `GET /resources` | `search` or `q`, `provider`, `type`, `page`, `pageSize` | Paged public resources. Official catalog entries are returned as catalog records; application drafts are visible only after approval and recommendation eligibility. | `courses`, `providers`, `offered_by`, approved app drafts | `/resources` |
| `GET /resources/:id` | Resource key or ID | `{resource,skills}` with evidence scope/URL/note. Unapproved application drafts are indistinguishable from missing records (404). | `courses`, `teaches`, `skills`, `app_*` approved drafts | `/resources/:id` |
| `GET /providers` | `search` or `q`, `page`, `pageSize` | Provider array with `resourceCount`; approved provider drafts may be included. | `providers`, `offered_by`, `courses`, approved app drafts | `/providers` |
| `GET /providers/:id/resources` | Provider key or ID; `page`, `pageSize` | `{provider,items,total,page,pageSize}`. | `providers`, `offered_by`, `courses`, approved app drafts | Provider detail / resource browsing |
| `GET /skill-groups` | `search` or `q`, `page`, `pageSize` | Paged skill-group records. | `skill_groups` | `/skill-taxonomy` |
| `GET /skill-groups/:id/skills` | Group key or ID; `page`, `pageSize` | `{group,items,total,page,pageSize}`. | `skill_groups`, `esco_skill_group`, `skills` | `/skill-taxonomy` |
| `GET /graph/neighborhood` | Required public catalog `focusId`; optional public `nodeTypes`, public `edgeTypes` (comma-separated), `limit` (1–200) | `{nodes,edges}` with source edge direction retained. User and learning-plan nodes and `targets_career` edges are not available to guests. Unsupported types fail validation. Prerequisite edges are included only when source-approved, non-demo and evidence-backed. | Public catalog graph collections | `/graph` |
| `GET /statistics/coverage` | None | Live Overall, Essential, Optional and per-career coverage calculated only from database records that satisfy both recommendation gates. | `careers`, `skills`, `requires_skill`, `courses`, `teaches` | Home, Statistics, Data Quality |

`courses.recommendation_eligible === true` and `teaches.auto_recommendation_allowed === true` are both required for recommendation coverage or recommendations. A general catalog listing does not assert that a resource is recommended.

## Authentication APIs

All paths below are under `/api/v1`. Public registration always creates role `user`; clients cannot set a role.

| Method and endpoint | Request body | Role | Response and rules | Collections |
|---|---|---|---|---|
| `POST /auth/register` | `{email,password,displayName}` | Guest | `201 {user}`. Unknown fields, including `role`, are rejected. Password is scrypt-hashed; raw password/hash are never returned. Duplicate email is `409`. | `app_users`, `app_profiles`, `app_audit_log` |
| `POST /auth/login` | `{email,password}` | Guest | `200 {user,expiresAt}` and sets `sg_session`. Bad credentials/status return generic `401`; repeated failures are rate-limited (`429`). | `app_users`, `app_sessions` |
| `POST /auth/logout` | None | Guest or authenticated | `200 {loggedOut:true}`; revokes a valid session and clears cookie. | `app_sessions` |
| `GET /auth/me` | Session cookie | Authenticated User or Admin | Safe account projection `{id,email,displayName,role,status}`; expired, revoked or locked sessions return `401`. | `app_users`, `app_sessions` |
| `PATCH /auth/me` | `{displayName}` | Authenticated User or Admin | Updates only the current account display name (1–120 trimmed characters); email, role, status and profile fields are rejected. | `app_users` |
| `POST /auth/change-password` | `{currentPassword,newPassword}` | Authenticated User or Admin | `200 {changed:true}`; validates current password, hashes the new one and revokes sessions. | `app_users`, `app_sessions`, `app_audit_log` |
| `POST /auth/forgot-password` | `{email}` | Guest | When an email adapter exists, returns `202 {accepted:true}` without disclosing account existence. Currently returns `503 EMAIL_DELIVERY_NOT_CONFIGURED`; it does not pretend an email was sent. | `app_users`, `app_password_resets` |
| `POST /auth/reset-password` | `{token,newPassword}` | Guest with reset token | `200 {changed:true}` for a valid unexpired single-use token; invalid, expired or replayed token is `400`. | `app_password_resets`, `app_users`, `app_sessions` |

## Current user and learning APIs

These endpoints require role `user`. Admins use a separate User account for learning features. Ownership is derived from the authenticated session, never from a user ID supplied by the client.

| Method and endpoint | Request | Response / behavior | Collections | Frontend use |
|---|---|---|---|---|
| `GET /me` | Session cookie | `{user,profile}`. Profile includes `careerGoalId`, `skillIds`, `savedResourceIds`, `plannedResourceIds`, `viewedResourceIds`, `completedResourceIds`, and `notes`. | `app_users`, `app_profiles` | `/dashboard`, `/my-learning` |
| `PATCH /me` | `{displayName}` | Updated safe profile/account. | `app_users`, `app_audit_log` | Account page (not yet present) |
| `PUT /me/career-goal` | `{careerId}` | Updated profile. Changing a goal preserves the owned skill IDs. Career key must exist. | `app_profiles`, `careers` | `/careers/:id`, `/career-goal` |
| `GET /me/skills` | Session cookie | Array of owned skill catalog records. | `app_profiles`, `skills` | `/my-skills` |
| `POST /me/skills` | `{skillId}` | Adds one validated skill to the current user only. | `app_profiles`, `skills` | `/my-skills` |
| `DELETE /me/skills/:skillId` | Skill key or ID | Removes the skill from the current user only. | `app_profiles`, `skills` | `/my-skills` |
| `GET /me/skill-gap` | Optional `careerId` | Target career, owned skills, Essential/Optional required, present and missing lists, counts and presence ratios. No proficiency claim. | `app_profiles`, `careers`, `requires_skill`, `skills` | `/skill-gap` |
| `GET /me/career-fit` | Session cookie | 12 careers ranked by `0.8 × essential presence ratio + 0.2 × optional presence ratio`; binary presence only. | `app_profiles`, `careers`, `requires_skill` | Career-fit display (current route uses local calculation) |
| `GET /me/recommendations` | Optional `careerId` | `{items}` of nonduplicate eligible resources for missing skills; both gates must be literal `true`; completed resources for this user are excluded. | `app_profiles`, `requires_skill`, `teaches`, `courses`, approved app drafts | `/learning-path` and recommendation views |
| `GET /me/learning-path` | Optional `careerId` | Ordered skill/resource steps. Owned skills are omitted; dependencies are ordered from approved `dependent → foundation` relations; unavailable resources are represented without invention. | `app_profiles`, `requires_skill`, `skill_prerequisite`, `teaches`, `courses` | `/learning-path` |
| `GET /me/progress` | Session cookie | Current user’s goal, owned skill IDs, saved/planned/viewed/completed resource IDs and summary counts. | `app_profiles` | `/dashboard`, `/my-learning` |
| `PUT /me/resources/:resourceId/state` | Any subset of `{saved:boolean,planned:boolean,viewed:boolean,note:string}` | Updated state for the current user; `viewed` is not completion. Unknown fields fail validation. | `app_profiles`, `courses` or approved app resource |
| `POST /me/completed-resources` | `{resourceId}` | Adds a completed resource for this user. Does not grant a skill or proficiency. | `app_profiles`, resource catalog |
| `DELETE /me/completed-resources/:resourceId` | Resource key or ID | Removes completion for this user only. | `app_profiles` |

## Admin APIs

All Admin routes require role `admin`; Guest/User requests return `401`/`403`. These APIs operate on application-owned `app_*` data. Official `careers`, `skills`, `requires_skill`, `courses`, `providers`, and `teaches` collections are not directly edited. Recommendation-affecting drafts require evidence and separate resource/mapping approval gates.

| Method and endpoint | Request | Response / validation | Collections |
|---|---|---|---|
| `GET /admin/users` | `search`, `role`, `status`, `page`, `pageSize` | Paged safe user projections; never includes password fields. | `app_users` |
| `POST /admin/users` | `{email,password,displayName,role?}` | Creates account through Admin flow; role/status are validated and audited. | `app_users`, `app_profiles`, `app_audit_log` |
| `GET /admin/users/:id` | User key or ID | Safe user detail; 404 if missing. | `app_users` |
| `PATCH /admin/users/:id` | `{displayName?,role?,status?}` | Updates permitted fields, revokes sessions on role/status change, refuses demotion/disable of final active Admin (`409 LAST_ACTIVE_ADMIN`). | `app_users`, `app_sessions`, `app_audit_log` |
| `GET /admin/statistics` | None | Counts and coverage calculated from actual collections; no fabricated values. | `app_users`, official catalog collections, draft collections |
| `GET /admin/database/status` | None | Connection/version/database, check time, total collections, and names/counts split into core, `app_*`, and ArangoDB system groups. It does not expose credentials or claim an integrity audit. | Arango version, current database, and collection APIs |
| `GET /admin/skill-prerequisites` | None | Read-only list of approved, non-demo, evidence-backed `dependent → foundation` skill edges with both skill names, approval state, source URL, and review metadata. There is no write route. | `skill_prerequisite`, `skills` |
| `GET /admin/audit-log` | `page`, `pageSize` | Paged audit records. | `app_audit_log` |
| `GET/POST /admin/resources` | List: `status,page,pageSize`; create: `{title,canonicalUrl,providerName,resourceType,language?}` | App-owned resource drafts. Create starts `pending` and recommendation-ineligible. | `app_resource_drafts`, `app_audit_log` |
| `GET/PATCH/DELETE /admin/resources/:id` | Patch accepts the same resource fields; delete requires no mappings | Pending drafts only. Reviewed records cannot be edited/deleted. | `app_resource_drafts`, `app_mapping_drafts`, `app_audit_log` |
| `POST /admin/resources/:id/review` | `{decision:'approve'|'reject',evidenceUrl,sourceSummary}` | Requires valid URL and evidence summary; records reviewer/time. Approval sets resource gate; rejection keeps it false. | `app_resource_drafts`, `app_audit_log` |
| `GET/POST /admin/providers` | List: `status,page,pageSize`; create: `{name,officialWebsite}` | Provider drafts start `pending`; official providers are read-only. | `app_provider_drafts`, `app_audit_log` |
| `GET/PATCH/DELETE /admin/providers/:id` | Patch accepts `{name?,officialWebsite?}`; delete requires no linked resource draft | Pending drafts only. | `app_provider_drafts`, `app_resource_drafts`, `app_audit_log` |
| `POST /admin/providers/:id/review` | `{decision,evidenceUrl,sourceSummary}` | Records evidence/reviewer/time; approved providers can be referenced by new resource drafts. | `app_provider_drafts`, `app_audit_log` |
| `GET/POST /admin/mappings` | List: `status,page,pageSize`; create: `{resourceId,skillId}` | Mapping draft begins with `autoRecommendationAllowed:false`; the resource draft must exist and the skill must be official. | `app_mapping_drafts`, `app_resource_drafts`, `skills`, `app_audit_log` |
| `GET/PATCH/DELETE /admin/mappings/:id` | Patch accepts `{resourceId?,skillId?}` | Pending mappings only; reviewed mappings are immutable through these routes. | `app_mapping_drafts`, `app_audit_log` |
| `POST /admin/mappings/:id/review` | `{decision,evidenceUrl,evidenceScope,sourceSummary,mappingQualityDecision?}` | Approval requires resource gate already approved, valid evidence, scope `direct_topic` or `partial`, and an accepted mapping decision. Rejection leaves mapping gate false. | `app_mapping_drafts`, `app_resource_drafts`, `app_audit_log` |
| `GET /admin/database/backups...` | Any network backup/restore route | `501 BACKUP_WORKFLOW_CLI_ONLY`. Backup/restore is an offline PowerShell workflow; no remote restore endpoint exists. | Local backup artifacts; no direct DB restore API |

Admin draft approval records evidence, actor and time. Approved app-owned resources may participate in public catalog/recommendation queries only when both gates are true. They are not silently written into the official Batch 2 source collections.

## Frontend integration notes

- The Integration checkout uses the Node API client for catalog, graph, account, User and Admin flows; requests include the HttpOnly session cookie.
- `GET/PATCH /auth/me` supports safe account display-name editing for User and Admin. Email remains read-only; `/me` business endpoints remain User-only.
- `/my-learning` “viewed” state remains separate from completion.
- The current `setCareer` clears locally declared skills; the Backend preserves skills when target career changes. The Frontend owner should align this during their later integration.
- The Integration checkout wires its login, registration, User, and Admin screens to the documented Node API routes.
