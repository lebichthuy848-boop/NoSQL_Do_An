import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { ArangoClient } from "./arango.mjs";
import { AuthService } from "./auth.mjs";
import { AdminService } from "./admin.mjs";
import { CatalogService } from "./catalog.mjs";
import { loadConfig } from "./config.mjs";
import { HttpError, safeError } from "./errors.mjs";
import { UserDataService } from "./user-data.mjs";
import { clearSessionCookie, cookieValue, sessionCookie, userSafe } from "./security.mjs";
import { pathToFileURL } from "node:url";

const API_PREFIX = "/api/v1";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const BODY_LIMIT = 1024 * 1024;

function json(response, status, value, headers = {}) {
  const body = value === undefined ? "" : JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

function pageHeaders(page) {
  return {
    "X-Total-Count": String(page.total),
    "X-Page": String(page.page),
    "X-Page-Size": String(page.pageSize),
  };
}

function pageResponse(response, page) {
  json(response, 200, page.items, pageHeaders(page));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds the allowed size");
    chunks.push(chunk);
  }
  if (!size) return {};
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Request body must use application/json");
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid object");
    return parsed;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be a JSON object");
  }
}

function pathParam(value) {
  try { return decodeURIComponent(value); } catch { throw new HttpError(400, "INVALID_PATH", "Path parameter is invalid"); }
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => !(field in body));
  if (missing.length) throw new HttpError(400, "VALIDATION_ERROR", `Required fields missing: ${missing.join(", ")}`);
}

function rejectUnknownFields(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new HttpError(400, "VALIDATION_ERROR", `Unknown fields: ${unknown.join(", ")}`);
}

class LoginLimiter {
  constructor({ windowMs = 15 * 60 * 1000, limit = 10 } = {}) {
    this.windowMs = windowMs;
    this.limit = limit;
    this.attempts = new Map();
  }

  check(key) {
    const now = Date.now();
    const prior = this.attempts.get(key);
    const current = prior && prior.expiresAt > now ? prior : { count: 0, expiresAt: now + this.windowMs };
    if (current.count >= this.limit) throw new HttpError(429, "LOGIN_RATE_LIMITED", "Too many login attempts; try again later");
    current.count += 1;
    this.attempts.set(key, current);
    if (this.attempts.size > 10_000) {
      for (const [entryKey, value] of this.attempts) if (value.expiresAt <= now) this.attempts.delete(entryKey);
    }
  }

  clear(key) { this.attempts.delete(key); }
}

export function createApplication({ db, config = loadConfig(), services = null } = {}) {
  if (!db) throw new Error("A database client is required");
  const catalog = services?.catalog || new CatalogService(db);
  const auth = services?.auth || new AuthService({ db, config, sendResetEmail: null });
  const userData = services?.userData || new UserDataService(db);
  const admin = services?.admin || new AdminService({ db, auth, isTestMode: config.nodeEnv === "test" });
  const loginLimiter = new LoginLimiter();

  async function authenticated(request) {
    const token = cookieValue(request.headers.cookie, config.cookieName);
    const result = await auth.authenticate(token);
    if (!result) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    return result;
  }

  async function currentUser(request, role = "user") {
    const result = await authenticated(request);
    if (result.user.role !== role) throw new HttpError(403, "FORBIDDEN", "You are not allowed to use this endpoint");
    return result;
  }

  async function dispatch(request, response, requestId) {
    const url = new URL(request.url, "http://localhost");
    const path = url.pathname;
    const method = request.method || "GET";
    let body = {};
    if (MUTATING_METHODS.has(method)) body = await readBody(request);
    if (!path.startsWith(`${API_PREFIX}/`)) throw new HttpError(404, "NOT_FOUND", "Route was not found");
    const route = path.slice(API_PREFIX.length);

    if (method === "GET" && route === "/health") {
      try {
        const version = await db.version();
        return json(response, 200, { status: "ready", arangoVersion: version.version });
      } catch {
        return json(response, 503, { status: "unavailable" });
      }
    }
    if (method === "GET" && route === "/meta/release") return json(response, 200, await catalog.release());
    if (method === "GET" && route === "/careers") return pageResponse(response, await catalog.careers(url.searchParams));
    if (method === "GET" && /^\/careers\/[^/]+$/.test(route)) return json(response, 200, await catalog.career(pathParam(route.split("/")[2])));
    if (method === "GET" && /^\/careers\/[^/]+\/skills$/.test(route)) return json(response, 200, await catalog.careerSkills(pathParam(route.split("/")[2])));
    if (method === "GET" && route === "/skills") return pageResponse(response, await catalog.skills(url.searchParams));
    if (method === "GET" && /^\/skills\/[^/]+\/resources$/.test(route)) return pageResponse(response, await catalog.skillResources(pathParam(route.split("/")[2]), url.searchParams));
    if (method === "GET" && /^\/skills\/[^/]+$/.test(route)) return json(response, 200, await catalog.skill(pathParam(route.split("/")[2])));
    if (method === "GET" && route === "/resources") return pageResponse(response, await catalog.resources(url.searchParams));
    if (method === "GET" && /^\/resources\/[^/]+$/.test(route)) return json(response, 200, await catalog.resource(pathParam(route.split("/")[2])));
    if (method === "GET" && route === "/providers") return pageResponse(response, await catalog.providers(url.searchParams));
    if (method === "GET" && /^\/providers\/[^/]+\/resources$/.test(route)) return pageResponse(response, await catalog.providerResources(pathParam(route.split("/")[2]), url.searchParams));
    if (method === "GET" && route === "/skill-groups") return pageResponse(response, await catalog.skillGroups(url.searchParams));
    if (method === "GET" && /^\/skill-groups\/[^/]+\/skills$/.test(route)) return pageResponse(response, await catalog.skillsInGroup(pathParam(route.split("/")[2]), url.searchParams));
    if (method === "GET" && route === "/graph/neighborhood") return json(response, 200, await catalog.neighborhood(url.searchParams));
    if (method === "GET" && route === "/statistics/coverage") return json(response, 200, await catalog.coverage());

    if (method === "POST" && route === "/auth/register") {
      if ("role" in body) throw new HttpError(400, "ROLE_NOT_ALLOWED", "Public registration cannot set a role");
      rejectUnknownFields(body, ["email", "password", "displayName"]);
      requireFields(body, ["email", "password", "displayName"]);
      const user = await auth.createUser({ ...body, role: "user", isTest: config.nodeEnv === "test" });
      return json(response, 201, { user: userSafe(user) });
    }
    if (method === "POST" && route === "/auth/login") {
      rejectUnknownFields(body, ["email", "password"]);
      requireFields(body, ["email", "password"]);
      const key = request.socket.remoteAddress || "unknown";
      loginLimiter.check(key);
      const session = await auth.login({ email: body.email, password: body.password, ip: key });
      loginLimiter.clear(key);
      return json(response, 200, { user: session.user, expiresAt: session.expiresAt }, { "Set-Cookie": sessionCookie(config.cookieName, session.token, { maxAge: config.sessionTtlSeconds, secure: config.cookieSecure }) });
    }
    if (method === "POST" && route === "/auth/logout") {
      const token = cookieValue(request.headers.cookie, config.cookieName);
      const session = token ? await auth.authenticate(token) : null;
      if (session) await auth.logout(session.session._key, session.user._key);
      return json(response, 200, { loggedOut: true }, { "Set-Cookie": clearSessionCookie(config.cookieName, config.cookieSecure) });
    }
    if (method === "GET" && route === "/auth/me") {
      const session = await authenticated(request);
      return json(response, 200, userSafe(session.user));
    }
    if (method === "PATCH" && route === "/auth/me") {
      const { user } = await authenticated(request);
      rejectUnknownFields(body, ["displayName"]);
      requireFields(body, ["displayName"]);
      return json(response, 200, await userData.updateProfile(user, body.displayName));
    }
    if (method === "POST" && route === "/auth/forgot-password") {
      rejectUnknownFields(body, ["email"]);
      requireFields(body, ["email"]);
      return json(response, 202, await auth.requestPasswordReset(body.email));
    }
    if (method === "POST" && route === "/auth/reset-password") {
      rejectUnknownFields(body, ["token", "newPassword"]);
      requireFields(body, ["token", "newPassword"]);
      return json(response, 200, await auth.completePasswordReset(body.token, body.newPassword));
    }
    if (method === "POST" && route === "/auth/change-password") {
      rejectUnknownFields(body, ["currentPassword", "newPassword"]);
      requireFields(body, ["currentPassword", "newPassword"]);
      const { user } = await authenticated(request);
      await auth.changePassword(user, body.currentPassword, body.newPassword);
      return json(response, 200, { changed: true }, { "Set-Cookie": clearSessionCookie(config.cookieName, config.cookieSecure) });
    }

    if (route.startsWith("/me")) {
      const { user } = await currentUser(request, "user");
      if (method === "GET" && route === "/me") return json(response, 200, await userData.getProfile(user));
      if (method === "PATCH" && route === "/me") {
        rejectUnknownFields(body, ["displayName"]); requireFields(body, ["displayName"]);
        return json(response, 200, await userData.updateProfile(user, body.displayName));
      }
      if (method === "PUT" && route === "/me/career-goal") {
        rejectUnknownFields(body, ["careerId"]); requireFields(body, ["careerId"]);
        return json(response, 200, await userData.setCareerGoal(user, body.careerId));
      }
      if (method === "GET" && route === "/me/skills") {
        const profile = await userData.getStoredProfile(user._key);
        const ids = (profile.skill_keys || []).map((key) => `skills/${key}`);
        const rows = await db.query("FOR id IN @ids LET skill = DOCUMENT(id) FILTER skill != null SORT LOWER(skill.name) RETURN skill", { ids });
        return json(response, 200, rows.map((skill) => ({ key: skill._key, id: skill._id, name: skill.name, description: skill.description || "", skillType: skill.skill_type || "" })));
      }
      if (method === "POST" && route === "/me/skills") {
        rejectUnknownFields(body, ["skillId"]); requireFields(body, ["skillId"]);
        return json(response, 200, await userData.addSkill(user, body.skillId));
      }
      if (method === "DELETE" && /^\/me\/skills\/[^/]+$/.test(route)) return json(response, 200, await userData.removeSkill(user, pathParam(route.split("/")[3])));
      if (method === "GET" && route === "/me/skill-gap") return json(response, 200, await userData.skillGap(user, url.searchParams.get("careerId")));
      if (method === "GET" && route === "/me/career-fit") return json(response, 200, await userData.careerFit(user));
      if (method === "GET" && route === "/me/recommendations") return json(response, 200, await userData.recommendations(user, url.searchParams.get("careerId")));
      if (method === "GET" && route === "/me/learning-path") return json(response, 200, await userData.learningPath(user, url.searchParams.get("careerId")));
      if (method === "GET" && route === "/me/progress") return json(response, 200, await userData.progress(user));
      if (method === "POST" && route === "/me/completed-resources") {
        rejectUnknownFields(body, ["resourceId"]); requireFields(body, ["resourceId"]);
        return json(response, 200, await userData.updateCompletion(user, body.resourceId, true));
      }
      if (method === "DELETE" && /^\/me\/completed-resources\/[^/]+$/.test(route)) return json(response, 200, await userData.updateCompletion(user, pathParam(route.split("/")[3]), false));
      if (method === "PUT" && /^\/me\/resources\/[^/]+\/state$/.test(route)) {
        rejectUnknownFields(body, ["saved", "planned", "viewed", "note"]);
        return json(response, 200, await userData.updateResourceState(user, pathParam(route.split("/")[3]), body));
      }
    }

    if (route.startsWith("/admin")) {
      const { user } = await currentUser(request, "admin");
      if (method === "GET" && route === "/admin/users") return pageResponse(response, await admin.users(url.searchParams));
      if (method === "POST" && route === "/admin/users") {
        rejectUnknownFields(body, ["email", "password", "displayName", "role"]); requireFields(body, ["email", "password", "displayName"]);
        return json(response, 201, { user: await admin.createUser(body, user) });
      }
      if (method === "GET" && /^\/admin\/users\/[^/]+$/.test(route)) return json(response, 200, await admin.user(pathParam(route.split("/")[3])));
      if (method === "PATCH" && /^\/admin\/users\/[^/]+$/.test(route)) return json(response, 200, await admin.updateUser(pathParam(route.split("/")[3]), body, user));
      if (method === "GET" && route === "/admin/statistics") return json(response, 200, await admin.statistics());
      if (method === "GET" && route === "/admin/database/status") return json(response, 200, await admin.databaseStatus());
      if (method === "GET" && route === "/admin/audit-log") return pageResponse(response, await admin.auditLog(url.searchParams));

      if (method === "GET" && route === "/admin/resources") return pageResponse(response, await admin.resources(url.searchParams));
      if (method === "POST" && route === "/admin/resources") {
        rejectUnknownFields(body, ["title", "canonicalUrl", "providerName", "resourceType", "language"]);
        requireFields(body, ["title", "canonicalUrl", "providerName", "resourceType"]);
        return json(response, 201, await admin.createResourceDraft(body, user));
      }
      if (method === "GET" && /^\/admin\/resources\/[^/]+$/.test(route)) return json(response, 200, await admin.resourceDraft(pathParam(route.split("/")[3])));
      if (method === "PATCH" && /^\/admin\/resources\/[^/]+$/.test(route)) {
        rejectUnknownFields(body, ["title", "canonicalUrl", "providerName", "resourceType", "language"]);
        return json(response, 200, await admin.updateResourceDraft(pathParam(route.split("/")[3]), body, user));
      }
      if (method === "DELETE" && /^\/admin\/resources\/[^/]+$/.test(route)) return json(response, 200, await admin.deleteResourceDraft(pathParam(route.split("/")[3]), user));
      if (method === "POST" && /^\/admin\/resources\/[^/]+\/review$/.test(route)) {
        rejectUnknownFields(body, ["decision", "evidenceUrl", "sourceSummary"]); requireFields(body, ["decision", "evidenceUrl", "sourceSummary"]);
        return json(response, 200, await admin.reviewResourceDraft(pathParam(route.split("/")[3]), body, user));
      }
      if (method === "GET" && route === "/admin/providers") return pageResponse(response, await admin.providers(url.searchParams));
      if (method === "POST" && route === "/admin/providers") {
        rejectUnknownFields(body, ["name", "officialWebsite"]); requireFields(body, ["name", "officialWebsite"]);
        return json(response, 201, await admin.createProvider(body, user));
      }
      if (method === "GET" && /^\/admin\/providers\/[^/]+$/.test(route)) return json(response, 200, await admin.provider(pathParam(route.split("/")[3])));
      if (method === "PATCH" && /^\/admin\/providers\/[^/]+$/.test(route)) {
        rejectUnknownFields(body, ["name", "officialWebsite"]);
        return json(response, 200, await admin.updateProvider(pathParam(route.split("/")[3]), body, user));
      }
      if (method === "DELETE" && /^\/admin\/providers\/[^/]+$/.test(route)) return json(response, 200, await admin.deleteProvider(pathParam(route.split("/")[3]), user));
      if (method === "POST" && /^\/admin\/providers\/[^/]+\/review$/.test(route)) {
        rejectUnknownFields(body, ["decision", "evidenceUrl", "sourceSummary"]); requireFields(body, ["decision", "evidenceUrl", "sourceSummary"]);
        return json(response, 200, await admin.reviewProvider(pathParam(route.split("/")[3]), body, user));
      }
      if (method === "GET" && route === "/admin/mappings") return pageResponse(response, await admin.mappings(url.searchParams));
      if (method === "POST" && route === "/admin/mappings") {
        rejectUnknownFields(body, ["resourceId", "skillId"]); requireFields(body, ["resourceId", "skillId"]);
        return json(response, 201, await admin.createMapping(body, user));
      }
      if (method === "GET" && /^\/admin\/mappings\/[^/]+$/.test(route)) return json(response, 200, await admin.mapping(pathParam(route.split("/")[3])));
      if (method === "PATCH" && /^\/admin\/mappings\/[^/]+$/.test(route)) {
        rejectUnknownFields(body, ["resourceId", "skillId"]);
        return json(response, 200, await admin.updateMapping(pathParam(route.split("/")[3]), body, user));
      }
      if (method === "DELETE" && /^\/admin\/mappings\/[^/]+$/.test(route)) return json(response, 200, await admin.deleteMapping(pathParam(route.split("/")[3]), user));
      if (method === "POST" && /^\/admin\/mappings\/[^/]+\/review$/.test(route)) {
        rejectUnknownFields(body, ["decision", "evidenceUrl", "evidenceScope", "sourceSummary", "mappingQualityDecision"]);
        requireFields(body, ["decision", "evidenceUrl", "evidenceScope", "sourceSummary"]);
        return json(response, 200, await admin.reviewMapping(pathParam(route.split("/")[3]), body, user));
      }
      if (route.startsWith("/admin/database/backups")) throw new HttpError(501, "BACKUP_WORKFLOW_CLI_ONLY", "Backup and restore are handled by the offline administration workflow; no network restore endpoint is enabled");
    }

    throw new HttpError(404, "NOT_FOUND", "Route was not found");
  }

  return async function handler(request, response) {
    const started = Date.now();
    const requestId = request.headers["x-request-id"] && /^[\w-]{8,80}$/.test(request.headers["x-request-id"])
      ? request.headers["x-request-id"] : randomUUID();
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("Referrer-Policy", "no-referrer");
    const origin = request.headers.origin;
    if (origin) {
      if (!config.allowedOrigins.includes(origin)) {
        json(response, 403, { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed" } });
        return;
      }
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      response.setHeader("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      if (!origin || !config.allowedOrigins.includes(origin)) {
        json(response, 403, { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed" } });
        return;
      }
      response.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Request-Id",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      });
      response.end();
      return;
    }
    if (MUTATING_METHODS.has(request.method || "") && request.headers.cookie && (!origin || !config.allowedOrigins.includes(origin))) {
      json(response, 403, { error: { code: "ORIGIN_REQUIRED", message: "A trusted Origin header is required for cookie-authenticated changes" } });
      return;
    }
    let status = 200;
    try {
      await dispatch(request, response, requestId);
      status = response.statusCode || 200;
    } catch (error) {
      const safe = safeError(error);
      status = safe.status;
      json(response, safe.status, { error: { code: safe.code, message: safe.message, ...(safe.details ? { details: safe.details } : {}) } });
    } finally {
      const path = new URL(request.url, "http://localhost").pathname;
      process.stdout.write(`${JSON.stringify({ event: "http.request", requestId, method: request.method, path, status, durationMs: Date.now() - started })}\n`);
    }
  };
}

export function startServer({ config = loadConfig(), db = null } = {}) {
  const client = db || new ArangoClient({ url: config.databaseUrl, database: config.databaseName, username: config.databaseUser, password: config.databasePassword });
  if (!config.databaseUser || !config.databasePassword) throw new Error("ARANGO_USERNAME and ARANGO_PASSWORD are required");
  const server = createServer(createApplication({ db: client, config }));
  server.listen(config.port, config.host, () => {
    process.stdout.write(`${JSON.stringify({ event: "http.started", host: config.host, port: config.port, database: config.databaseName })}\n`);
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    startServer();
  } catch {
    process.stderr.write("Backend startup failed. Check required environment configuration without sharing secret values.\n");
    process.exitCode = 1;
  }
}
