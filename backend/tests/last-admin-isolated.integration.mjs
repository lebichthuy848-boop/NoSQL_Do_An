import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { ArangoClient } from "../src/arango.mjs";
import { ArangoError } from "../src/errors.mjs";
import { loadConfig } from "../src/config.mjs";
import { APP_COLLECTIONS } from "../src/domain.mjs";
import { migrate } from "../src/migrate.mjs";
import { AuthService } from "../src/auth.mjs";
import { createApplication } from "../src/server.mjs";

const E2E_ORIGIN = "http://127.0.0.1:39531";
const allowedOrigin = "http://127.0.0.1:4173";
const config = loadConfig();
if (process.env.STAGE_C_RUN_ISOLATED_ADMIN_TEST !== "YES") throw new Error("Explicit E2E safety flag is required");
if (config.databaseUrl !== E2E_ORIGIN || config.databaseName !== "skill_graph_v366_acceptance" || config.databaseUser !== "root") {
  throw new Error("This test is restricted to the authenticated Stage B E2E ArangoDB endpoint and database");
}
const bootstrapUsername = process.env.ARANGO_BOOTSTRAP_USERNAME;
const bootstrapPassword = process.env.ARANGO_BOOTSTRAP_PASSWORD;
if (bootstrapUsername !== "root" || !bootstrapPassword) throw new Error("E2E bootstrap credentials are required");

function localFetch(resource, init = {}) {
  const target = resource instanceof URL ? resource : new URL(String(resource));
  if (target.origin !== E2E_ORIGIN) return Promise.reject(new Error("Refusing a non-E2E ArangoDB endpoint"));
  return new Promise((resolve, reject) => {
    const headers = { ...(init.headers || {}) };
    if (init.body !== undefined && !Object.keys(headers).some((name) => name.toLowerCase() === "content-length")) headers["Content-Length"] = String(Buffer.byteLength(String(init.body)));
    const request = httpRequest(target, { method: init.method || "GET", headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
    });
    request.on("error", reject);
    if (init.signal) {
      if (init.signal.aborted) request.destroy(new Error("Request aborted"));
      else init.signal.addEventListener("abort", () => request.destroy(new Error("Request aborted")), { once: true });
    }
    if (init.body !== undefined) request.write(init.body);
    request.end();
  });
}

async function systemRequest(path, { method = "GET", body } = {}) {
  const headers = { Authorization: `Basic ${Buffer.from(`${bootstrapUsername}:${bootstrapPassword}`, "utf8").toString("base64")}`, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await localFetch(new URL(path, E2E_ORIGIN), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.error === true) { const error = new ArangoError(response.status, payload?.errorNum); error.errorMessage = payload?.errorMessage || null; throw error; }
  return payload;
}
function apiRequest(baseUrl, path, { method = "GET", body, cookie } = {}) {
  const target = new URL(String(path).replace(/^\/+/, ""), baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const headers = { Origin: allowedOrigin, Accept: "application/json" };
    if (payload !== null) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }
    if (cookie) headers.Cookie = cookie;
    import("node:http").then(({ request }) => {
      const requestHandle = request(target, { method, headers }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          let parsed = null;
          try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { parsed = null; }
          resolve({ status: response.statusCode, headers: response.headers, payload: parsed });
        });
      });
      requestHandle.on("error", reject);
      requestHandle.end(payload || undefined);
    }).catch(reject);
  });
}

function cookieFrom(response) {
  const setCookie = response.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : "";
  const match = String(cookie || "").match(/sg_session=[^;]+/);
  if (!match) throw new Error("Login did not set the session cookie");
  return match[0];
}

const suffix = randomBytes(5).toString("hex");
const databaseName = "sgscadmin_" + Date.now().toString(36) + "_" + suffix;
const runtimeUsername = "sgscadmin_" + suffix;
const runtimePassword = randomBytes(32).toString("hex");
let databaseCreated = false;
let runtimeUserCreated = false;
let server = null;
let result = { isolatedDatabaseCreated: false, finalAdminDisablePass: false, finalAdminDemotionPass: false, concurrentProtectionPass: false, sessionRevocationPass: false, cleanupPass: false };
let stage = "create-isolated-database";

try {
  await systemRequest("/_api/database", { method: "POST", body: { name: databaseName } });
  databaseCreated = true;
  result.isolatedDatabaseCreated = true;

  const rootDb = new ArangoClient({ url: config.databaseUrl, database: databaseName, username: bootstrapUsername, password: bootstrapPassword, fetchImpl: localFetch });
  await migrate(rootDb);

  await systemRequest("/_api/user", {
    method: "POST",
    body: { user: runtimeUsername, passwd: runtimePassword, active: true, extra: {}, databases: {} },
  });
  runtimeUserCreated = true;
  await systemRequest("/_api/user/" + encodeURIComponent(runtimeUsername) + "/database/" + encodeURIComponent(databaseName), { method: "PUT", body: { grant: "ro" } });
  for (const collection of APP_COLLECTIONS) {
    await systemRequest("/_api/user/" + encodeURIComponent(runtimeUsername) + "/database/" + encodeURIComponent(databaseName) + "/" + encodeURIComponent(collection), { method: "PUT", body: { grant: "rw" } });
  }

  const db = new ArangoClient({ url: config.databaseUrl, database: databaseName, username: runtimeUsername, password: runtimePassword, fetchImpl: localFetch });
  const testConfig = { ...config, databaseName, databaseUser: runtimeUsername, databasePassword: runtimePassword, host: "127.0.0.1", port: 0, nodeEnv: "test", allowedOrigins: [allowedOrigin], cookieSecure: false };
  const auth = new AuthService({ db, config: testConfig });
  const appServer = createServer(createApplication({ db, config: testConfig }));
  server = appServer;
  await new Promise((resolve, reject) => {
    appServer.once("error", reject);
    appServer.listen(0, "127.0.0.1", resolve);
  });
  const address = appServer.address();
  const baseUrl = "http://127.0.0.1:" + address.port + "/api/v1/";
  const passwords = [randomBytes(18).toString("hex") + "Aa9!", randomBytes(18).toString("hex") + "Bb8!"];
  const emails = ["stagec-admin-a-" + suffix + "@example.invalid", "stagec-admin-b-" + suffix + "@example.invalid"];
  const admins = [];

  stage = "seed-single-admin-and-check-blocks";
  admins.push(await auth.createUser({ email: emails[0], password: passwords[0], displayName: "TEST Stage C Admin A", role: "admin", isTest: true }));
  const firstLogin = await apiRequest(baseUrl, "/auth/login", { method: "POST", body: { email: emails[0], password: passwords[0] } });
  assert.equal(firstLogin.status, 200, "isolated Admin login should succeed");
  const firstCookie = cookieFrom(firstLogin);
  const disableLast = await apiRequest(baseUrl, "/admin/users/" + encodeURIComponent(admins[0]._key), { method: "PATCH", body: { status: "disabled" }, cookie: firstCookie });
  assert.equal(disableLast.status, 409, "the only active Admin cannot be disabled");
  assert.equal(disableLast.payload?.error?.code, "LAST_ACTIVE_ADMIN");
  const demoteLast = await apiRequest(baseUrl, "/admin/users/" + encodeURIComponent(admins[0]._key), { method: "PATCH", body: { role: "user" }, cookie: firstCookie });
  assert.equal(demoteLast.status, 409, "the only active Admin cannot be demoted");
  assert.equal(demoteLast.payload?.error?.code, "LAST_ACTIVE_ADMIN");
  result.finalAdminDisablePass = true;
  result.finalAdminDemotionPass = true;

  stage = "concurrent-admin-protection";
  admins.push(await auth.createUser({ email: emails[1], password: passwords[1], displayName: "TEST Stage C Admin B", role: "admin", isTest: true }));
  const secondLogin = await apiRequest(baseUrl, "/auth/login", { method: "POST", body: { email: emails[1], password: passwords[1] } });
  assert.equal(secondLogin.status, 200, "second isolated Admin login should succeed");
  const secondCookie = cookieFrom(secondLogin);
  const race = await Promise.all([
    apiRequest(baseUrl, "/admin/users/" + encodeURIComponent(admins[0]._key), { method: "PATCH", body: { status: "disabled" }, cookie: firstCookie }),
    apiRequest(baseUrl, "/admin/users/" + encodeURIComponent(admins[1]._key), { method: "PATCH", body: { role: "user" }, cookie: secondCookie }),
  ]);
  assert.equal(race.filter((response) => response.status === 200).length, 1, "exactly one concurrent last-Admin transition may commit");
  const rejected = race.find((response) => response.status !== 200);
  assert.equal(rejected?.status, 409, "the competing transition must be rejected");
  assert.equal(rejected?.payload?.error?.code, "LAST_ACTIVE_ADMIN");
  const winnerIndex = race[0].status === 200 ? 0 : 1;
  const winnerCookie = winnerIndex === 0 ? firstCookie : secondCookie;
  const oldSession = await apiRequest(baseUrl, "/auth/me", { cookie: winnerCookie });
  assert.equal(oldSession.status, 401, "changing the winning Admin status/role must revoke that session");
  const activeAdmins = await db.query("FOR user IN app_users FILTER user.role == 'admin' AND user.status == 'active' RETURN user._key");
  assert.equal(activeAdmins.length, 1, "the race must leave exactly one active Admin");
  const remainingIndex = winnerIndex === 0 ? 1 : 0;
  const remainingCookie = remainingIndex === 0 ? firstCookie : secondCookie;
  const finalDisable = await apiRequest(baseUrl, "/admin/users/" + encodeURIComponent(admins[remainingIndex]._key), { method: "PATCH", body: { status: "disabled" }, cookie: remainingCookie });
  const finalDemotion = await apiRequest(baseUrl, "/admin/users/" + encodeURIComponent(admins[remainingIndex]._key), { method: "PATCH", body: { role: "user" }, cookie: remainingCookie });
  assert.equal(finalDisable.status, 409);
  assert.equal(finalDisable.payload?.error?.code, "LAST_ACTIVE_ADMIN");
  assert.equal(finalDemotion.status, 409);
  assert.equal(finalDemotion.payload?.error?.code, "LAST_ACTIVE_ADMIN");
  result.concurrentProtectionPass = true;
  result.sessionRevocationPass = true;
  stage = "complete";
} catch (error) {
  process.stderr.write(JSON.stringify({ stage, name: error?.name || "Error", status: error?.status || null, errorNum: error?.errorNum || null, errorMessage: error?.errorMessage || null }) + "\n");
  process.exitCode = 1;
} finally {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  let cleanupOkay = true;
  if (databaseCreated) {
    try { await systemRequest("/_api/database/" + encodeURIComponent(databaseName), { method: "DELETE" }); }
    catch { cleanupOkay = false; }
  }
  if (runtimeUserCreated) {
    try { await systemRequest("/_api/user/" + encodeURIComponent(runtimeUsername), { method: "DELETE" }); }
    catch { cleanupOkay = false; }
  }
  result.cleanupPass = cleanupOkay;
  process.stdout.write(JSON.stringify({ ...result, testDatabase: databaseName, cleanupPass: cleanupOkay }) + "\n");
  if (!cleanupOkay) process.exitCode = 1;
}