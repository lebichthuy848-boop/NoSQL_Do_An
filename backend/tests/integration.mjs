import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { ArangoClient } from "../src/arango.mjs";
import { AuthService } from "../src/auth.mjs";
import { loadConfig } from "../src/config.mjs";
import { createApplication } from "../src/server.mjs";
import { newId, newOpaqueToken, tokenDigest } from "../src/security.mjs";

const config = loadConfig();
if (!config.databaseUser || !config.databasePassword) throw new Error("Set ARANGO_USERNAME and ARANGO_PASSWORD to the restricted runtime database account");
const db = new ArangoClient({ url: config.databaseUrl, database: config.databaseName, username: config.databaseUser, password: config.databasePassword });
const apiConfig = { ...config, host: "127.0.0.1", port: 0, nodeEnv: "test", cookieSecure: false, allowedOrigins: ["http://localhost:5173"] };
const server = createServer(createApplication({ db, config: apiConfig }));
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const origin = "http://localhost:5173";
const runId = randomUUID();
const password = `Test-${randomBytes(16).toString("hex")}aA9!`;
const emailA = `skillgraph-test-a+${runId}@example.invalid`;
const emailB = `skillgraph-test-b+${runId}@example.invalid`;
const emailFit = `skillgraph-test-fit+${runId}@example.invalid`;
let userKeys = [];
let results = { startedAt: new Date().toISOString(), DATABASE_CONNECTIVITY_PASS: false, BACKEND_BUILD_PASS: true, AUTHORIZATION_TEST_PASS: false, BUSINESS_API_TEST_PASS: false, ADMIN_API_TEST_PASS: false, ADMIN_PREREQUISITES_READ_TEST_PASS: false, DATABASE_COLLECTION_CATEGORIES_TEST_PASS: false, ADMIN_DRAFT_GATES_TEST_PASS: false, ADMIN_MAPPING_DUPLICATE_TEST_PASS: false, PASSWORD_CHANGE_TRANSACTION_PASS: false, ADMIN_ROLE_CHANGE_SESSION_REVOCATION_TEST_PASS: false, LAST_ACTIVE_ADMIN_TEST_PASS: false, LAST_ACTIVE_ADMIN_CONCURRENCY_TEST_STATUS: "UNVERIFIED", EMPTY_PROFILE_TEST_PASS: false, FULL_CAREER_FIT_TEST_PASS: false, GRAPH_PRIVACY_TEST_PASS: false, SKILL_RESOURCE_COUNT_TEST_PASS: false, LEARNING_PATH_TEST_PASS: false, LEARNING_PATH_PREREQUISITE_TEST_PASS: false, LEARNING_PATH_NO_RESOURCE_TEST_PASS: false, MULTI_USER_TEST_PASS: false };
let stage = "startup";

function headers(cookie = null, jsonBody = false) {
  return { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(jsonBody ? { "Content-Type": "application/json" } : {}) };
}

async function api(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: headers(cookie, body !== undefined),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  return { response, payload };
}

function cookieFrom(response) {
  const raw = response.headers.get("set-cookie") || "";
  const pair = raw.split(";", 1)[0];
  assert.ok(pair.startsWith(`${config.cookieName}=`), "login response must set the session cookie");
  return pair;
}

async function createLogin(email, displayName) {
  const registered = await api("/auth/register", { method: "POST", body: { email, password, displayName } });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.payload));
  assert.equal(registered.payload.user.role, "user");
  assert.equal(Object.hasOwn(registered.payload.user, "password_hash"), false);
  const loggedIn = await api("/auth/login", { method: "POST", body: { email, password } });
  assert.equal(loggedIn.response.status, 200, JSON.stringify(loggedIn.payload));
  return { cookie: cookieFrom(loggedIn.response), user: loggedIn.payload.user };
}

async function cleanup() {
  await db.query("FOR doc IN app_mapping_drafts FILTER doc.test_scenario == 'backend_http_integration' REMOVE doc IN app_mapping_drafts");
  await db.query("FOR doc IN app_resource_drafts FILTER doc.test_scenario == 'backend_http_integration' REMOVE doc IN app_resource_drafts");
  await db.query("FOR doc IN app_provider_drafts FILTER doc.test_scenario == 'backend_http_integration' REMOVE doc IN app_provider_drafts");
  const discovered = await db.query("FOR user IN app_users FILTER user.is_test == true AND user.test_scenario == 'backend_http_integration' RETURN user._key");
  const keys = [...new Set([...userKeys, ...discovered])];
  if (!keys.length) return;
  const vars = { keys };
  await db.query("FOR doc IN app_sessions FILTER doc.user_key IN @keys REMOVE doc IN app_sessions", vars);
  await db.query("FOR doc IN app_password_resets FILTER doc.user_key IN @keys REMOVE doc IN app_password_resets", vars);
  await db.query("FOR doc IN app_profiles FILTER doc._key IN @keys REMOVE doc IN app_profiles", vars);
  await db.query("FOR doc IN app_audit_log FILTER doc.actor_key IN @keys OR doc.metadata.targetUserKey IN @keys REMOVE doc IN app_audit_log", vars);
  await db.query("FOR doc IN app_users FILTER doc._key IN @keys AND doc.is_test == true REMOVE doc IN app_users", vars);
  const remainingAudit = await db.query("FOR doc IN app_audit_log FILTER doc.actor_key IN @keys OR doc.metadata.targetUserKey IN @keys RETURN doc._key", vars);
  assert.deepEqual(remainingAudit, [], "cleanup must remove audit rows correlated to its own TEST user keys");
}

try {
  const version = await db.version();
  assert.equal(version.version, "3.12.11", `Expected ArangoDB 3.12.11, got ${version.version}`);
  const noAuth = await fetch(`${config.databaseUrl}/_db/${encodeURIComponent(config.databaseName)}/_api/collection`).catch(() => null);
  assert.ok(noAuth && [401, 403].includes(noAuth.status), "unauthenticated database access must be rejected");
  results.DATABASE_CONNECTIVITY_PASS = true;
  await cleanup();

  const [careersResult, skillsResult, releaseResult, coverageResult] = await Promise.all([
    api("/careers?page=1&pageSize=100"), api("/skills?page=1&pageSize=100"), api("/meta/release"), api("/statistics/coverage"),
  ]);
  assert.equal(careersResult.response.status, 200);
  assert.equal(Number(careersResult.response.headers.get("x-total-count")), 12);
  assert.equal(skillsResult.response.status, 200);
  assert.equal(Number(skillsResult.response.headers.get("x-total-count")), 420);
  assert.equal(releaseResult.payload.requiresSkillRelations, 932);
  assert.equal(coverageResult.payload.overall.covered, 227);
  assert.equal(coverageResult.payload.essential.covered, 143);
  assert.equal(coverageResult.payload.optional.covered, 136);
  assert.equal(coverageResult.payload.overall.total, 420);
  assert.equal(careersResult.payload.length, 12);
  assert.equal(skillsResult.payload.length, 100);

  const firstSkill = skillsResult.payload[0];
  const secondSkill = skillsResult.payload[1];
  const thirdSkill = skillsResult.payload[2];
  const firstCareer = careersResult.payload[0];
  const secondCareer = careersResult.payload[1];
  assert.ok(firstSkill?.id && secondSkill?.id && thirdSkill?.id && firstCareer?.id && secondCareer?.id);

  stage = "graph privacy";
  const targetCareerIds = await db.query("FOR edge IN targets_career FILTER STARTS_WITH(edge._from, 'careers/') OR STARTS_WITH(edge._to, 'careers/') RETURN (STARTS_WITH(edge._from, 'careers/') ? edge._from : edge._to)");
  const graphFocusIds = [...new Set([firstCareer.id, firstSkill.id, ...targetCareerIds])];
  for (const focusId of graphFocusIds) {
    const graphResult = await api(`/graph/neighborhood?focusId=${encodeURIComponent(focusId)}`);
    assert.equal(graphResult.response.status, 200, `public graph query must work for ${focusId}`);
    assert.ok(graphResult.payload.nodes.every((node) => node.type !== "user" && node.type !== "learningPlan"));
    assert.ok(graphResult.payload.edges.every((edge) => edge.type !== "targets_career"));
    assert.doesNotMatch(JSON.stringify(graphResult.payload), /users\/|learning_plans\/|targets_career/);
  }
  for (const query of [
    "focusId=users/private", "focusId=learning_plans/private",
    `focusId=${encodeURIComponent(firstCareer.id)}&nodeTypes=user`, `focusId=${encodeURIComponent(firstCareer.id)}&nodeTypes=learningPlan`,
    `focusId=${encodeURIComponent(firstCareer.id)}&edgeTypes=targets_career`,
  ]) {
    const denied = await api(`/graph/neighborhood?${query}`);
    assert.equal(denied.response.status, 400, `guest graph request must reject private graph type: ${query}`);
  }
  results.GRAPH_PRIVACY_TEST_PASS = true;

  const skillDetail = await api(`/skills/${encodeURIComponent(firstSkill.key)}`);
  assert.equal(skillDetail.response.status, 200);
  const skillCareerAndResourceCounts = await db.query("LET careerCount = LENGTH(FOR edge IN requires_skill FILTER edge._to == @id RETURN 1) LET resourceCount = LENGTH(FOR edge IN teaches FILTER edge._to == @id RETURN 1) RETURN { careerCount, resourceCount }", { id: firstSkill.id });
  assert.equal(skillDetail.payload.linkedResourceCount, skillCareerAndResourceCounts[0].resourceCount);
  results.SKILL_RESOURCE_COUNT_TEST_PASS = true;

  const badRegister = await api("/auth/register", { method: "POST", body: { email: `escalation+${runId}@example.invalid`, password, displayName: "TEST escalation", role: "admin" } });
  assert.equal(badRegister.response.status, 400);
  const guest = await api("/me");
  assert.equal(guest.response.status, 401);

  stage = "auth and learning";
  const a = await createLogin(emailA, `TEST Integration A ${runId}`);
  userKeys = [a.user.id];
  const b = await createLogin(emailB, `TEST Integration B ${runId}`);
  userKeys.push(b.user.id);
  const fitUser = await createLogin(emailFit, `TEST Integration Fit ${runId}`);
  userKeys.push(fitUser.user.id);
  assert.equal(a.user.role, "user");
  assert.equal(b.user.role, "user");
  const wrongPassword = await api("/auth/login", { method: "POST", body: { email: emailA, password: "Wrong-Password-123!" } });
  assert.equal(wrongPassword.response.status, 401);
  const failedLoginAudit = await db.query("FOR row IN app_audit_log FILTER row.event_type == 'auth.login_failed' AND row.actor_key == @actorKey SORT row.created_at DESC LIMIT 1 RETURN row", { actorKey: a.user.id });
  assert.equal(failedLoginAudit.length, 1, "wrong-password audit entry must be correlated to the TEST account for precise cleanup");
  assert.equal(failedLoginAudit[0].metadata.ip, "127.0.0.1");
  const parallelLogin = await api("/auth/login", { method: "POST", body: { email: emailA, password } });
  assert.equal(parallelLogin.response.status, 200);
  const changedPassword = "Changed-" + randomBytes(16).toString("hex") + "aA9!";
  const passwordChange = await api("/auth/change-password", { method: "POST", cookie: a.cookie, body: { currentPassword: password, newPassword: changedPassword } });
  assert.equal(passwordChange.response.status, 200);
  assert.deepEqual((await Promise.all([api("/auth/me", { cookie: a.cookie }), api("/auth/me", { cookie: cookieFrom(parallelLogin.response) })])).map((item) => item.response.status), [401, 401]);
  assert.equal((await api("/auth/login", { method: "POST", body: { email: emailA, password } })).response.status, 401);
  const changedLogin = await api("/auth/login", { method: "POST", body: { email: emailA, password: changedPassword } });
  assert.equal(changedLogin.response.status, 200);
  a.cookie = cookieFrom(changedLogin.response);
  results.PASSWORD_CHANGE_TRANSACTION_PASS = true;

  const emptyFit = await api("/me/career-fit", { cookie: a.cookie });
  const emptyGap = await api(`/me/skill-gap?careerId=${encodeURIComponent(firstCareer.id)}`, { cookie: a.cookie });
  const emptyPath = await api(`/me/learning-path?careerId=${encodeURIComponent(firstCareer.id)}`, { cookie: a.cookie });
  assert.equal(emptyFit.payload.length, 12);
  assert.ok(emptyFit.payload.every((item) => item.score === 0), "a user with no owned skills should have zero fit for all careers");
  assert.equal(emptyGap.payload.essential.owned, 0);
  assert.equal(emptyGap.payload.optional.owned, 0);
  assert.ok(emptyGap.payload.missingSkillIds.length > 0);
  assert.ok(Array.isArray(emptyPath.payload.steps));
  assert.equal(new Set(emptyPath.payload.steps.flatMap((step) => step.resources.map((resource) => resource.id))).size, emptyPath.payload.steps.flatMap((step) => step.resources).length, "learning path must not repeat resources");
  results.EMPTY_PROFILE_TEST_PASS = true;
  results.LEARNING_PATH_TEST_PASS = true;

  const officialRequiredSkillRows = await db.query("FOR edge IN requires_skill FILTER edge._from == @careerId RETURN edge._to", { careerId: firstCareer.id });
  const officialRequiredSkillIds = [...new Set(officialRequiredSkillRows)];
  assert.ok(officialRequiredSkillIds.length > 0, "chosen career must have official required skills");
  for (const skillId of officialRequiredSkillIds) {
    const addSkill = await api("/me/skills", { method: "POST", cookie: fitUser.cookie, body: { skillId } });
    assert.equal(addSkill.response.status, 200, `test user must be able to own official skill ${skillId}`);
  }
  const completeFit = await api("/me/career-fit", { cookie: fitUser.cookie });
  assert.equal(completeFit.response.status, 200);
  const completeCareerFit = completeFit.payload.find((item) => item.career.id === firstCareer.id);
  assert.ok(completeCareerFit, "career-fit response must include the chosen career");
  assert.equal(completeCareerFit.essentialRatio, 1);
  if (completeCareerFit.optionalTotal > 0) assert.equal(completeCareerFit.optionalRatio, 1);
  assert.equal(completeCareerFit.score, 1);
  results.FULL_CAREER_FIT_TEST_PASS = true;

  const missingResource = await db.query(
    "FOR req IN requires_skill LET eligible = (FOR edge IN teaches FILTER edge._to == req._to AND edge.auto_recommendation_allowed == true LET course = DOCUMENT(edge._from) FILTER course != null AND course.recommendation_eligible == true RETURN 1) FILTER LENGTH(eligible) == 0 LIMIT 1 RETURN { careerId: req._from, skillId: req._to }",
  );
  if (missingResource[0]) {
    const path = await api(`/me/learning-path?careerId=${encodeURIComponent(missingResource[0].careerId)}`, { cookie: a.cookie });
    assert.ok(path.payload.skillsWithoutEligibleResources.includes(missingResource[0].skillId), "learning path must identify a required skill without eligible resources");
    results.LEARNING_PATH_NO_RESOURCE_TEST_PASS = true;
  }
  const prereqTargets = await db.query(
    "FOR edge IN skill_prerequisite FILTER edge.approved_for_learning_path == true AND edge.is_demo != true AND edge.source_url != null AND edge.source_url != '' LET dependent = DOCUMENT(edge._from) LET foundation = DOCUMENT(edge._to) FILTER dependent != null AND foundation != null LET careerIds = (FOR req IN requires_skill FILTER req._to == edge._from RETURN req._from) FILTER LENGTH(careerIds) > 0 LIMIT 1 RETURN { careerId: FIRST(careerIds), dependent: edge._from, foundation: edge._to }",
  );
  if (prereqTargets[0]) {
    const path = await api(`/me/learning-path?careerId=${encodeURIComponent(prereqTargets[0].careerId)}`, { cookie: a.cookie });
    const foundationIndex = path.payload.steps.findIndex((step) => step.skill.id === prereqTargets[0].foundation);
    const dependentIndex = path.payload.steps.findIndex((step) => step.skill.id === prereqTargets[0].dependent);
    assert.ok(foundationIndex >= 0 && dependentIndex >= 0 && foundationIndex < dependentIndex, "approved foundation must precede its dependent skill");
    results.LEARNING_PATH_PREREQUISITE_TEST_PASS = true;
  }

  const [adminFromUser, aChanges, bChanges] = await Promise.all([
    api("/admin/statistics", { cookie: a.cookie }),
    (async () => {
      const goal = await api("/me/career-goal", { method: "PUT", cookie: a.cookie, body: { careerId: firstCareer.id } });
      const skill = await api("/me/skills", { method: "POST", cookie: a.cookie, body: { skillId: firstSkill.id } });
      return { goal, skill };
    })(),
    (async () => {
      const goal = await api("/me/career-goal", { method: "PUT", cookie: b.cookie, body: { careerId: secondCareer.id } });
      const skill = await api("/me/skills", { method: "POST", cookie: b.cookie, body: { skillId: secondSkill.id } });
      return { goal, skill };
    })(),
  ]);
  assert.equal(adminFromUser.response.status, 403);
  assert.equal(aChanges.goal.response.status, 200);
  assert.equal(bChanges.goal.response.status, 200);
  assert.equal(aChanges.skill.response.status, 200);
  assert.equal(bChanges.skill.response.status, 200);

  const [profileA, profileB, fit, gap, recs] = await Promise.all([
    api("/me", { cookie: a.cookie }), api("/me", { cookie: b.cookie }),
    api("/me/career-fit", { cookie: a.cookie }), api("/me/skill-gap", { cookie: a.cookie }),
    api(`/me/recommendations?careerId=${encodeURIComponent(firstCareer.id)}`, { cookie: a.cookie }),
  ]);
  assert.deepEqual(profileA.payload.profile.skillIds, [firstSkill.id]);
  assert.deepEqual(profileB.payload.profile.skillIds, [secondSkill.id]);
  assert.equal(profileA.payload.profile.careerGoalId, firstCareer.id);
  assert.equal(profileB.payload.profile.careerGoalId, secondCareer.id);
  const changedGoal = await api("/me/career-goal", { method: "PUT", cookie: a.cookie, body: { careerId: secondCareer.id } });
  assert.deepEqual(changedGoal.payload.skillIds, [firstSkill.id], "changing target career must preserve owned skills");
  assert.equal(fit.payload.length, 12);
  assert.ok(fit.payload.every((item) => typeof item.score === "number" && item.score >= 0 && item.score <= 1));
  assert.ok(gap.payload.missingEssentialSkillIds && gap.payload.missingOptionalSkillIds);
  assert.equal(recs.response.status, 200);

  const dbApprovedPairs = await db.query(
    "FOR edge IN teaches FILTER edge.auto_recommendation_allowed == true LET course = DOCUMENT(edge._from) FILTER course != null AND course.recommendation_eligible == true RETURN CONCAT(course._id, '|', edge._to)",
  );
  const approvedPairs = new Set(dbApprovedPairs);
  for (const item of recs.payload.items) {
    assert.equal(item.resource.recommendationEligible, true);
    assert.ok(item.skillIds.some((skillId) => approvedPairs.has(`${item.resource.id}|${skillId}`)), "each recommended mapping must satisfy both true gates in ArangoDB");
  }

  let completionIsolationPass = true;
  if (recs.payload.items.length) {
    const chosen = recs.payload.items[0].resource;
    const saved = await api(`/me/resources/${encodeURIComponent(chosen.id)}/state`, { method: "PUT", cookie: a.cookie, body: { saved: true } });
    assert.equal(saved.response.status, 200);
    assert.ok(saved.payload.savedResourceIds.includes(chosen.id));
    const noted = await api(`/me/resources/${encodeURIComponent(chosen.id)}/state`, { method: "PUT", cookie: a.cookie, body: { note: "TEST integration note" } });
    assert.equal(noted.response.status, 200);
    assert.equal(noted.payload.notes[chosen.id], "TEST integration note");
    const bProgressBefore = await api("/me/progress", { cookie: b.cookie });
    assert.ok(!bProgressBefore.payload.savedResourceIds.includes(chosen.id));
    const mark = await api("/me/completed-resources", { method: "POST", cookie: a.cookie, body: { resourceId: chosen.id } });
    assert.equal(mark.response.status, 200);
    const afterCompletion = await api(`/me/recommendations?careerId=${encodeURIComponent(firstCareer.id)}`, { cookie: a.cookie });
    assert.ok(!afterCompletion.payload.items.some((item) => item.resource.id === chosen.id), "completed resource must be excluded for the same user");
    const profileBAfter = await api("/me/progress", { cookie: b.cookie });
    assert.ok(!profileBAfter.payload.completedResourceIds.includes(chosen.id), "another user must not inherit completion state");
  } else {
    completionIsolationPass = false;
  }
  assert.equal(completionIsolationPass, true, "test career must have at least one allowed recommendation");

  const lock = await db.query("FOR user IN app_users FILTER user._key == @key UPDATE user WITH { status: 'locked' } IN app_users RETURN NEW", { key: a.user.id });
  assert.equal(lock.length, 1);
  const lockedAccess = await api("/auth/me", { cookie: a.cookie });
  assert.equal(lockedAccess.response.status, 401);
  await db.query("FOR user IN app_users FILTER user._key == @key UPDATE user WITH { status: 'active' } IN app_users", { key: a.user.id });

  const sessionValue = a.cookie.slice(a.cookie.indexOf("=") + 1);
  const digest = tokenDigest(sessionValue);
  await db.query("FOR session IN app_sessions FILTER session.token_hash == @hash UPDATE session WITH { expires_at: @past } IN app_sessions", { hash: digest, past: new Date(Date.now() - 1000).toISOString() });
  const expired = await api("/auth/me", { cookie: a.cookie });
  assert.equal(expired.response.status, 401);

  const unavailableRecovery = await api("/auth/forgot-password", { method: "POST", body: { email: emailB } });
  assert.equal(unavailableRecovery.response.status, 503, "password recovery must disclose missing email transport instead of faking delivery");
  const resetToken = newOpaqueToken();
  await db.query("INSERT @reset INTO app_password_resets", { reset: { _key: newId(), token_hash: tokenDigest(resetToken), user_key: b.user.id, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), used_at: null } });
  const resetPassword = `Reset-${randomBytes(16).toString("hex")}aA9!`;
  const reset = await api("/auth/reset-password", { method: "POST", body: { token: resetToken, newPassword: resetPassword } });
  assert.equal(reset.response.status, 200, JSON.stringify(reset.payload));
  const replay = await api("/auth/reset-password", { method: "POST", body: { token: resetToken, newPassword: password } });
  assert.equal(replay.response.status, 400, "reset token must be single use");
  const oldSession = await api("/auth/me", { cookie: b.cookie });
  assert.equal(oldSession.response.status, 401, "password reset must revoke active sessions");
  const relogin = await api("/auth/login", { method: "POST", body: { email: emailB, password: resetPassword } });
  assert.equal(relogin.response.status, 200, "reset password must be usable");

  const priorAdmins = await db.query("RETURN LENGTH(FOR user IN app_users FILTER user.role == 'admin' AND user.status == 'active' RETURN 1)");
  const adminEmail = `skillgraph-test-admin+${runId}@example.invalid`;
  const adminPassword = `Admin-${randomBytes(16).toString("hex")}aA9!`;
  const adminAuth = new AuthService({ db, config: apiConfig });
  const seededAdmin = await adminAuth.createUser({ email: adminEmail, password: adminPassword, displayName: `TEST Integration Admin ${runId}`, role: "admin", isTest: true });
  userKeys.push(seededAdmin._key);
  const adminLogin = await api("/auth/login", { method: "POST", body: { email: adminEmail, password: adminPassword } });
  assert.equal(adminLogin.response.status, 200);
  const adminCookie = cookieFrom(adminLogin.response);
  const prerequisites = await api("/admin/skill-prerequisites", { cookie: adminCookie });
  assert.equal(prerequisites.response.status, 200);
  assert.equal(prerequisites.payload.length, 6, "only the six source-backed approved Batch 2 prerequisite edges should be listed");
  assert.ok(prerequisites.payload.every((edge) => edge.status === "approved" && edge.sourceUrl?.startsWith("https://") && edge.direction === "dependent → foundation" && edge.dependentSkillName && edge.foundationSkillName));
  assert.ok(prerequisites.payload.every((edge) => edge.dependentSkillId.startsWith("skills/") && edge.foundationSkillId.startsWith("skills/")));
  const regularUserLogin = await api("/auth/login", { method: "POST", body: { email: emailA, password: changedPassword } });
  assert.equal(regularUserLogin.response.status, 200);
  const regularUserCookie = cookieFrom(regularUserLogin.response);
  assert.equal((await api("/admin/skill-prerequisites", { cookie: regularUserCookie })).response.status, 403, "regular User cannot read Admin prerequisite list");
  results.ADMIN_PREREQUISITES_READ_TEST_PASS = true;
  const databaseStatus = await api("/admin/database/status", { cookie: adminCookie });
  assert.equal(databaseStatus.response.status, 200);
  assert.equal(databaseStatus.payload.collectionCount, 41);
  assert.deepEqual({ core: databaseStatus.payload.collectionGroups.core.count, app: databaseStatus.payload.collectionGroups.application.count, system: databaseStatus.payload.collectionGroups.system.count }, { core: 25, app: 8, system: 8 });
  results.DATABASE_COLLECTION_CATEGORIES_TEST_PASS = true;
  const stats = await api("/admin/statistics", { cookie: adminCookie });
  assert.equal(stats.response.status, 200);
  const userPage = await api("/admin/users?page=1&pageSize=100", { cookie: adminCookie });
  assert.equal(userPage.response.status, 200);
  assert.ok(userPage.payload.every((user) => !("password_hash" in user) && !("password_salt" in user) && !("password_scheme" in user)));
  const adminCannotUseUserApi = await api("/me", { cookie: adminCookie });
  assert.equal(adminCannotUseUserApi.response.status, 403);

  stage = "admin role-change session revocation";
  const originalDbFetch = db.fetchImpl;
  let releaseCommit;
  let signalCommit;
  let holdingCommit = false;
  const commitReleased = new Promise((resolve) => { releaseCommit = resolve; });
  const commitObserved = new Promise((resolve) => { signalCommit = resolve; });
  db.fetchImpl = async (input, init) => {
    const response = await originalDbFetch(input, init);
    const requestUrl = new URL(input instanceof URL ? input.href : (input?.url || String(input)));
    if (!holdingCommit && init?.method === "PUT" && /\/_api\/transaction\/[^/]+$/.test(requestUrl.pathname)) {
      holdingCommit = true;
      signalCommit();
      await commitReleased;
    }
    return response;
  };
  let promotionPromise;
  try {
    promotionPromise = api(`/admin/users/${fitUser.user.id}`, { method: "PATCH", cookie: adminCookie, body: { role: "admin" } });
    let timeout;
    await Promise.race([
      commitObserved,
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Admin role-change transaction commit was not observed")), 10_000); }),
    ]).finally(() => clearTimeout(timeout));
    const oldCookieDuringCommitResponse = await api("/auth/me", { cookie: fitUser.cookie });
    assert.equal(oldCookieDuringCommitResponse.response.status, 401, "the prior User cookie must already be revoked when the role transaction commits");
  } finally {
    releaseCommit();
    db.fetchImpl = originalDbFetch;
  }
  const promoted = await promotionPromise;
  assert.equal(promoted.response.status, 200, JSON.stringify(promoted.payload));
  const oldCookieAfterPromotion = await api("/auth/me", { cookie: fitUser.cookie });
  assert.equal(oldCookieAfterPromotion.response.status, 401, "promotion must revoke the prior User session");

  const elevatedLogin = await api("/auth/login", { method: "POST", body: { email: emailFit, password } });
  assert.equal(elevatedLogin.response.status, 200);
  const elevatedCookie = cookieFrom(elevatedLogin.response);
  const demoted = await api(`/admin/users/${fitUser.user.id}`, { method: "PATCH", cookie: adminCookie, body: { role: "user" } });
  assert.equal(demoted.response.status, 200, JSON.stringify(demoted.payload));
  const oldElevatedCookie = await api("/auth/me", { cookie: elevatedCookie });
  assert.equal(oldElevatedCookie.response.status, 401, "demotion must revoke the prior Admin session");
  results.ADMIN_ROLE_CHANGE_SESSION_REVOCATION_TEST_PASS = true;

  stage = "last-admin concurrency";
  if ((priorAdmins[0] || 0) === 0) {
    const lastAdmin = await api(`/admin/users/${seededAdmin._key}`, { method: "PATCH", cookie: adminCookie, body: { status: "disabled" } });
    assert.equal(lastAdmin.response.status, 409, "the last active admin must not be disabled");
    assert.equal(lastAdmin.payload.error.code, "LAST_ACTIVE_ADMIN");
    results.LAST_ACTIVE_ADMIN_TEST_PASS = true;
  }

  stage = "admin draft gates";
  const suffix = runId.replaceAll("-", "");
  stage = "admin provider draft CRUD";
  const providerPending = await api("/admin/providers", { method: "POST", cookie: adminCookie, body: { name: `TEST Provider Pending ${suffix}`, officialWebsite: `https://example.invalid/providers/pending-${suffix}` } });
  assert.equal(providerPending.response.status, 201, JSON.stringify(providerPending.payload));
  assert.equal(providerPending.payload.isTest, true);
  const providerRead = await api(`/admin/providers/${providerPending.payload.key}`, { cookie: adminCookie });
  assert.equal(providerRead.response.status, 200);
  const providerUpdate = await api(`/admin/providers/${providerPending.payload.key}`, { method: "PATCH", cookie: adminCookie, body: { name: `TEST Provider Edited ${suffix}` } });
  assert.equal(providerUpdate.response.status, 200);
  const providerDelete = await api(`/admin/providers/${providerPending.payload.key}`, { method: "DELETE", cookie: adminCookie });
  assert.equal(providerDelete.response.status, 200);

  const provider = await api("/admin/providers", { method: "POST", cookie: adminCookie, body: { name: `TEST Provider Approved ${suffix}`, officialWebsite: `https://example.invalid/providers/approved-${suffix}` } });
  assert.equal(provider.response.status, 201);
  const providerReview = await api(`/admin/providers/${provider.payload.key}/review`, { method: "POST", cookie: adminCookie, body: { decision: "approve", evidenceUrl: `https://example.invalid/providers/evidence-${suffix}`, sourceSummary: "TEST only; synthetic integration fixture, must never be presented as a real provider." } });
  assert.equal(providerReview.response.status, 200);
  assert.equal(providerReview.payload.status, "approved");

  stage = "admin resource draft CRUD";
  const resource = await api("/admin/resources", { method: "POST", cookie: adminCookie, body: { title: `TEST Resource ${suffix}`, canonicalUrl: `https://example.invalid/resources/${suffix}`, providerName: provider.payload.name, resourceType: "article", language: "en" } });
  assert.equal(resource.response.status, 201, JSON.stringify(resource.payload));
  assert.equal(resource.payload.isTest, true);
  assert.equal(resource.payload.recommendationEligible, false);
  const resourceRead = await api(`/admin/resources/${resource.payload.key}`, { cookie: adminCookie });
  assert.equal(resourceRead.response.status, 200);
  const resourceUpdate = await api(`/admin/resources/${resource.payload.key}`, { method: "PATCH", cookie: adminCookie, body: { title: `TEST Resource Edited ${suffix}` } });
  assert.equal(resourceUpdate.response.status, 200);

  stage = "admin mapping duplicate guards";
  const mapping = await api("/admin/mappings", { method: "POST", cookie: adminCookie, body: { resourceId: resource.payload.key, skillId: firstSkill.id } });
  assert.equal(mapping.response.status, 201);
  assert.equal(mapping.payload.autoRecommendationAllowed, false);
  const duplicateMappingCreate = await api("/admin/mappings", { method: "POST", cookie: adminCookie, body: { resourceId: resource.payload.key, skillId: firstSkill.id } });
  assert.equal(duplicateMappingCreate.response.status, 409);
  assert.equal(duplicateMappingCreate.payload.error.code, "DUPLICATE_MAPPING");
  const siblingMapping = await api("/admin/mappings", { method: "POST", cookie: adminCookie, body: { resourceId: resource.payload.key, skillId: secondSkill.id } });
  assert.equal(siblingMapping.response.status, 201);
  const duplicateMappingUpdate = await api("/admin/mappings/" + mapping.payload.key, { method: "PATCH", cookie: adminCookie, body: { skillId: secondSkill.id } });
  assert.equal(duplicateMappingUpdate.response.status, 409);
  assert.equal(duplicateMappingUpdate.payload.error.code, "DUPLICATE_MAPPING");
  const siblingMappingDelete = await api("/admin/mappings/" + siblingMapping.payload.key, { method: "DELETE", cookie: adminCookie });
  assert.equal(siblingMappingDelete.response.status, 200);
  const concurrentMappingResults = await Promise.all([
    api("/admin/mappings", { method: "POST", cookie: adminCookie, body: { resourceId: resource.payload.key, skillId: thirdSkill.id } }),
    api("/admin/mappings", { method: "POST", cookie: adminCookie, body: { resourceId: resource.payload.key, skillId: thirdSkill.id } }),
  ]);
  assert.deepEqual(concurrentMappingResults.map((item) => item.response.status).sort((left, right) => left - right), [201, 409]);
  assert.equal(concurrentMappingResults.find((item) => item.response.status === 409)?.payload.error.code, "DUPLICATE_MAPPING");
  results.ADMIN_MAPPING_DUPLICATE_TEST_PASS = true;
  stage = "admin mapping review gates";
  const mappingList = await api("/admin/mappings?page=1&pageSize=100", { cookie: adminCookie });
  assert.equal(mappingList.response.status, 200);
  assert.equal(mappingList.payload.find((item) => item.key === mapping.payload.key)?.isTest, true, "admin mapping list must expose its test-only marker");
  const mappingRead = await api(`/admin/mappings/${mapping.payload.key}`, { cookie: adminCookie });
  assert.equal(mappingRead.response.status, 200);
  const mappingUpdate = await api(`/admin/mappings/${mapping.payload.key}`, { method: "PATCH", cookie: adminCookie, body: { skillId: secondSkill.id } });
  assert.equal(mappingUpdate.response.status, 200);
  const prematureApproval = await api(`/admin/mappings/${mapping.payload.key}/review`, { method: "POST", cookie: adminCookie, body: { decision: "approve", evidenceUrl: `https://example.invalid/mappings/${suffix}`, evidenceScope: "partial", sourceSummary: "TEST only; synthetic fixture." } });
  assert.equal(prematureApproval.response.status, 409, "mapping gate cannot pass before the resource gate");
  assert.equal(prematureApproval.payload.error.code, "COURSE_GATE_REQUIRED");
  const resourceReview = await api(`/admin/resources/${resource.payload.key}/review`, { method: "POST", cookie: adminCookie, body: { decision: "approve", evidenceUrl: `https://example.invalid/resources/evidence-${suffix}`, sourceSummary: "TEST only; synthetic fixture, not real learning evidence." } });
  assert.equal(resourceReview.response.status, 200);
  assert.equal(resourceReview.payload.recommendationEligible, true);
  const mappingReview = await api(`/admin/mappings/${mapping.payload.key}/review`, { method: "POST", cookie: adminCookie, body: { decision: "approve", evidenceUrl: `https://example.invalid/mappings/evidence-${suffix}`, evidenceScope: "partial", sourceSummary: "TEST only; synthetic fixture, not real learning evidence." } });
  assert.equal(mappingReview.response.status, 200);
  assert.equal(mappingReview.payload.autoRecommendationAllowed, true);
  const gates = await db.query("LET resource = DOCUMENT(CONCAT('app_resource_drafts/', @resourceKey)) LET mapping = DOCUMENT(CONCAT('app_mapping_drafts/', @mappingKey)) RETURN { isTest: resource.is_test == true AND mapping.is_test == true, courseGate: resource.recommendation_eligible == true, teachesGate: mapping.auto_recommendation_allowed == true }", { resourceKey: resource.payload.key, mappingKey: mapping.payload.key });
  assert.deepEqual(gates[0], { isTest: true, courseGate: true, teachesGate: true });
  const publicResources = await api(`/resources?search=${encodeURIComponent(`TEST Resource Edited ${suffix}`)}`);
  assert.ok(!publicResources.payload.some((item) => item.id === resource.payload.id), "TEST resource must stay hidden from public catalog");
  const publicProviders = await api(`/providers?search=${encodeURIComponent(provider.payload.name)}`);
  assert.ok(!publicProviders.payload.some((item) => item.id === provider.payload.id), "TEST provider must stay hidden from public catalog");
  results.ADMIN_DRAFT_GATES_TEST_PASS = true;
  results.ADMIN_API_TEST_PASS = true;

  if ((priorAdmins[0] || 0) === 0) {
    const concurrentEmail = `skillgraph-test-admin-race+${runId}@example.invalid`;
    const concurrentAdmin = await adminAuth.createUser({ email: concurrentEmail, password: adminPassword, displayName: `TEST Concurrent Admin ${runId}`, role: "admin", isTest: true });
    userKeys.push(concurrentAdmin._key);
    const raceResults = await Promise.allSettled([
      adminAuth.adminUpdateUser(seededAdmin._key, { status: "disabled" }, seededAdmin),
      adminAuth.adminUpdateUser(concurrentAdmin._key, { role: "user" }, seededAdmin),
    ]);
    process.stdout.write(`${JSON.stringify({ event: "last_admin_race", results: raceResults.map((result) => result.status === "fulfilled" ? { status: result.status } : { status: result.status, errorName: result.reason?.name || "Error", errorCode: result.reason?.code || null, httpStatus: result.reason?.status || null })})}\n`);
    assert.equal(raceResults.filter((result) => result.status === "fulfilled").length, 1, "exactly one of two parallel last-admin transitions may commit");
    const rejected = raceResults.find((result) => result.status === "rejected");
    assert.equal(rejected?.reason?.code, "LAST_ACTIVE_ADMIN", "the competing admin transition must be rejected by the serialized guard");
    const activeAdmins = await db.query("RETURN LENGTH(FOR user IN app_users FILTER user.role == 'admin' AND user.status == 'active' RETURN 1)");
    assert.equal(activeAdmins[0], 1, "parallel demotion/disable must leave exactly one active TEST admin");
    results.LAST_ACTIVE_ADMIN_CONCURRENCY_TEST_STATUS = "PASS";
  } else {
    results.LAST_ACTIVE_ADMIN_CONCURRENCY_TEST_STATUS = "SKIPPED_EXISTING_ACTIVE_ADMINS";
  }

  results.AUTHORIZATION_TEST_PASS = true;
  results.BUSINESS_API_TEST_PASS = results.EMPTY_PROFILE_TEST_PASS && results.FULL_CAREER_FIT_TEST_PASS && results.LEARNING_PATH_TEST_PASS && results.LEARNING_PATH_NO_RESOURCE_TEST_PASS && results.LEARNING_PATH_PREREQUISITE_TEST_PASS;
  results.MULTI_USER_TEST_PASS = true;
  stage = "complete";
  process.stdout.write(`${JSON.stringify({ ...results, lastAdminTest: results.LAST_ACTIVE_ADMIN_TEST_PASS ? "PASS" : "SKIPPED_EXISTING_ACTIVE_ADMIN" })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ event: "integration.failed", stage, name: error?.name || "Error", message: "Integration test failed; inspect assertions without sharing credentials." })}\n`);
  process.exitCode = 1;
} finally {
  try { await cleanup(); } catch { process.stderr.write("Integration fixture cleanup failed. Keep this database clone isolated and inspect TEST-marked app_users records.\n"); process.exitCode = 1; }
  const closed = once(server, "close");
  server.close();
  await closed;
}
