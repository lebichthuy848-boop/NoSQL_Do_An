import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApplication } from "../src/server.mjs";
import { HttpError } from "../src/errors.mjs";
import { CatalogService } from "../src/catalog.mjs";

const origin = "http://localhost:5173";

async function withApi(run, { catalog = null, admin = {} } = {}) {
  const db = { version: async () => ({ version: "3.12.11" }), query: async () => [] };
  const auth = {
    authenticate: async (token) => {
      if (token === "admin-token") return { user: { _key: "admin1", email: "admin@example.test", display_name: "Admin One", created_at: "2026-11-21T00:00:00.000Z", role: "admin", status: "active" }, session: { _key: "session1" } };
      if (token === "user-token") return { user: { _key: "user1", email: "user@example.test", display_name: "User One", created_at: "2026-11-21T00:00:00.000Z", role: "user", status: "active" }, session: { _key: "session2" } };
      return null;
    },
    createUser: async (input) => ({ _key: "new-user", email: input.email, display_name: input.displayName, role: input.role || "user", status: "active" }),
    login: async () => ({ token: "token", user: { id: "u", role: "user" }, expiresAt: "later" }),
    requestPasswordReset: async () => { throw new HttpError(503, "EMAIL_DELIVERY_NOT_CONFIGURED", "Password recovery is unavailable until an email delivery service is configured"); },
    audit: async () => {},
  };
  const services = {
    auth,
    userData: {
      getProfile: async () => ({ user: { id: "user1" }, profile: { careerGoalId: null, skillIds: [] } }),
      updateProfile: async (user, displayName) => {
        if (typeof displayName !== "string" || !displayName.trim() || displayName.trim().length > 120) throw new HttpError(400, "VALIDATION_ERROR", "displayName must contain 1–120 characters");
        return { id: user._key, email: user.email, displayName: displayName.trim(), role: user.role, status: user.status, createdAt: user.created_at };
      },
      setCareerGoal: async (_user, careerId) => ({ careerGoalId: careerId, skillIds: ["skills/keep-me"] }),
    },
    catalog: catalog || { careers: async () => ({ items: [{ id: "career1" }], total: 1, page: 1, pageSize: 25 }) },
    admin,
  };
  const config = { cookieName: "sg_session", cookieSecure: false, sessionTtlSeconds: 28800, allowedOrigins: [origin], nodeEnv: "test" };
  const server = createServer(createApplication({ db, config, services }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}/api/v1`, auth); }
  finally { server.close(); await once(server, "close"); }
}

test("guest cannot read private profile and user receives only their own profile", async () => {
  await withApi(async (base) => {
    const guest = await fetch(`${base}/me`);
    assert.equal(guest.status, 401);
    assert.deepEqual(await guest.json(), { error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required" } });
    const user = await fetch(`${base}/me`, { headers: { Cookie: "sg_session=user-token" } });
    assert.equal(user.status, 200);
    assert.deepEqual(await user.json(), { user: { id: "user1" }, profile: { careerGoalId: null, skillIds: [] } });
  });
});

test("authenticated users and admins can update only their display name through the account endpoint", async () => {
  await withApi(async (base) => {
    for (const [token, role, id] of [["user-token", "user", "user1"], ["admin-token", "admin", "admin1"]]) {
      const response = await fetch(`${base}/auth/me`, {
        method: "PATCH",
        headers: { Cookie: `sg_session=${token}`, Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated name" }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { id, email: `${role}@example.test`, displayName: "Updated name", role, status: "active", createdAt: "2026-11-21T00:00:00.000Z" });
    }

    const guest = await fetch(`${base}/auth/me`, {
      method: "PATCH", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Updated name" }),
    });
    assert.equal(guest.status, 401);

    const roleChange = await fetch(`${base}/auth/me`, {
      method: "PATCH", headers: { Cookie: "sg_session=admin-token", Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Updated name", role: "user" }),
    });
    assert.equal(roleChange.status, 400);
    assert.equal((await roleChange.json()).error.code, "VALIDATION_ERROR");

    const emailChange = await fetch(`${base}/auth/me`, {
      method: "PATCH", headers: { Cookie: "sg_session=admin-token", Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Updated name", email: "new@example.test" }),
    });
    assert.equal(emailChange.status, 400);
    assert.equal((await emailChange.json()).error.code, "VALIDATION_ERROR");

    const invalidName = await fetch(`${base}/auth/me`, {
      method: "PATCH", headers: { Cookie: "sg_session=admin-token", Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "   " }),
    });
    assert.equal(invalidName.status, 400);
    assert.equal((await invalidName.json()).error.code, "VALIDATION_ERROR");

    const adminCannotReadUserProfile = await fetch(`${base}/me`, { headers: { Cookie: "sg_session=admin-token" } });
    assert.equal(adminCannotReadUserProfile.status, 403);
    const adminCannotEditUserProfile = await fetch(`${base}/me`, {
      method: "PATCH", headers: { Cookie: "sg_session=admin-token", Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Should remain forbidden" }),
    });
    assert.equal(adminCannotEditUserProfile.status, 403);
  });
});
test("admin cannot use user learning endpoints and user cannot use admin endpoints", async () => {
  await withApi(async (base) => {
    const adminAsUser = await fetch(`${base}/me`, { headers: { Cookie: "sg_session=admin-token" } });
    assert.equal(adminAsUser.status, 403);
    const userAsAdmin = await fetch(`${base}/admin/users`, { headers: { Cookie: "sg_session=user-token" } });
    assert.equal(userAsAdmin.status, 403);
  });
});

test("approved prerequisite listing is Admin-only and exposes no write route", async () => {
  const prerequisites = [{ dependentSkillId: "skills/js", foundationSkillId: "skills/html", status: "approved" }];
  await withApi(async (base) => {
    const adminResponse = await fetch(`${base}/admin/skill-prerequisites`, { headers: { Cookie: "sg_session=admin-token" } });
    assert.equal(adminResponse.status, 200);
    assert.deepEqual(await adminResponse.json(), prerequisites);

    const userResponse = await fetch(`${base}/admin/skill-prerequisites`, { headers: { Cookie: "sg_session=user-token" } });
    assert.equal(userResponse.status, 403);

    const writeResponse = await fetch(`${base}/admin/skill-prerequisites`, {
      method: "POST",
      headers: { Cookie: "sg_session=admin-token", Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ dependentSkillId: "skills/js", foundationSkillId: "skills/html" }),
    });
    assert.equal(writeResponse.status, 404);
  }, { admin: { skillPrerequisites: async () => prerequisites } });
});

test("cookie-authenticated mutations require a trusted Origin", async () => {
  await withApi(async (base) => {
    const response = await fetch(`${base}/me/career-goal`, {
      method: "PUT",
      headers: { Cookie: "sg_session=user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ careerId: "careers/c1" }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "ORIGIN_REQUIRED");
  });
});

test("public catalog list preserves array shape and returns pagination headers", async () => {
  await withApi(async (base) => {
    const response = await fetch(`${base}/careers`, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ id: "career1" }]);
    assert.equal(response.headers.get("x-total-count"), "1");
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  });
});

test("guest graph neighborhood rejects private node types and filters private nodes and edges", async () => {
  const docs = {
    "careers/career1": { _key: "career1", _id: "careers/career1", name: "Public career" },
    "skills/skill1": { _key: "skill1", _id: "skills/skill1", name: "Public skill" },
    "users/private1": { _key: "private1", _id: "users/private1", name: "Sensitive User Name" },
    "learning_plans/private1": { _key: "private1", _id: "learning_plans/private1", name: "Sensitive Learning Plan" },
  };
  const db = {
    async query(aql, vars = {}) {
      if (aql.startsWith("LET doc = DOCUMENT(@id)")) return docs[vars.id] ? [docs[vars.id]] : [];
      if (aql.startsWith("FOR edge IN @@collection")) {
        assert.notEqual(vars["@collection"], "targets_career");
        return [
          { _id: "requires_skill/good", _from: "careers/career1", _to: "skills/skill1", edgeType: "requires_skill" },
          { _id: "requires_skill/private-user", _from: "users/private1", _to: "careers/career1", edgeType: "requires_skill" },
          { _id: "requires_skill/private-plan", _from: "learning_plans/private1", _to: "skills/skill1", edgeType: "requires_skill" },
        ].filter((edge) => edge.edgeType === vars["@collection"]);
      }
      if (aql.startsWith("FOR id IN @ids")) {
        return vars.ids.flatMap((id) => {
          const doc = docs[id];
          const type = vars.types[id.split("/")[0]];
          return doc && type ? [{ id, type, label: doc.name }] : [];
        });
      }
      return [];
    },
  };
  const catalog = new CatalogService(db);

  await withApi(async (base) => {
    for (const focusId of ["careers/career1", "skills/skill1"]) {
      const response = await fetch(`${base}/graph/neighborhood?focusId=${encodeURIComponent(focusId)}`);
      assert.equal(response.status, 200);
      const graph = await response.json();
      assert.ok(graph.nodes.every((node) => node.type !== "user" && node.type !== "learningPlan"));
      assert.ok(graph.edges.every((edge) => edge.type !== "targets_career"));
      assert.doesNotMatch(JSON.stringify(graph), /users\/|learning_plans\/|Sensitive User Name|Sensitive Learning Plan|targets_career/);
    }

    for (const sensitive of [
      "?focusId=users/private1", "?focusId=learning_plans/private1",
      "?focusId=careers/career1&nodeTypes=user", "?focusId=careers/career1&nodeTypes=learningPlan",
      "?focusId=careers/career1&edgeTypes=targets_career",
    ]) {
      const response = await fetch(`${base}/graph/neighborhood${sensitive}`);
      assert.equal(response.status, 400, `${sensitive} must be rejected for guests`);
    }
  }, { catalog });
});

test("public registration rejects client-controlled roles and disallowed origins", async () => {
  await withApi(async (base) => {
    const escalation = await fetch(`${base}/auth/register`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@example.test", password: "Strong-Pass-123!", displayName: "X", role: "admin" }),
    });
    assert.equal(escalation.status, 400);
    assert.equal((await escalation.json()).error.code, "ROLE_NOT_ALLOWED");
    const blocked = await fetch(`${base}/auth/register`, {
      method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@example.test", password: "Strong-Pass-123!", displayName: "X" }),
    });
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).error.code, "ORIGIN_NOT_ALLOWED");
  });
});

test("server errors do not expose stack traces or internal messages", async () => {
  await withApi(async (base) => {
    const response = await fetch(`${base}/auth/forgot-password`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@example.test" }),
    });
    assert.equal(response.status, 503);
    const json = await response.json();
    assert.equal(json.error.code, "EMAIL_DELIVERY_NOT_CONFIGURED");
    assert.equal(Object.hasOwn(json, "stack"), false);
    assert.equal(Object.hasOwn(json.error, "stack"), false);
  });
});
