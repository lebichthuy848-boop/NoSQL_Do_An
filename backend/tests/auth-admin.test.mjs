import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../src/auth.mjs";
import { AdminService } from "../src/admin.mjs";

const admin = { _key: "admin-one", role: "admin", status: "active", display_name: "Administrator" };

test("last active administrator cannot be demoted or disabled", async () => {
  const writes = [];
  let aborted = false;
  const db = {
    async beginTransaction(options) { assert.deepEqual(options, { write: ["app_users", "app_sessions"], exclusive: ["app_users", "app_sessions"], lockTimeout: 10 }); return "tx"; },
    async commitTransaction() { throw new Error("the rejected transaction must not commit"); },
    async abortTransaction() { aborted = true; },
    async query(query, _vars, options = {}) {
      assert.equal(options.transactionId, "tx");
      if (query.includes("FILTER user._key == @key")) return [admin];
      if (query.includes("FILTER user.role == 'admin' AND user.status == 'active'")) return [1];
      writes.push(query);
      return [];
    },
  };
  const auth = new AuthService({ db, config: { sessionTtlSeconds: 3600 } });
  await assert.rejects(auth.adminUpdateUser(admin._key, { status: "disabled" }, { _key: admin._key }), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "LAST_ACTIVE_ADMIN");
    return true;
  });
  assert.deepEqual(writes, [], "the rejected operation must not issue writes");
  assert.equal(aborted, true, "the exclusive transaction must release its lock after rejection");
});

test("an admin can be disabled when another active administrator remains", async () => {
  const writes = [];
  const steps = [];
  let committed = false;
  const db = {
    async beginTransaction(options) { assert.deepEqual(options, { write: ["app_users", "app_sessions"], exclusive: ["app_users", "app_sessions"], lockTimeout: 10 }); return "tx"; },
    async commitTransaction() { steps.push("commit"); committed = true; },
    async abortTransaction() { throw new Error("successful update must not abort"); },
    async query(query, vars, options = {}) {
      if (query.includes("app_users") || query.includes("app_sessions")) assert.equal(options.transactionId, "tx");
      if (query.includes("FILTER user._key == @key")) return [admin];
      if (query.includes("FILTER user.role == 'admin' AND user.status == 'active'")) return [2];
      writes.push(query);
      if (query.startsWith("UPDATE @key WITH { role:")) {
        steps.push("update-user");
        return [{ ...admin, status: vars.status }];
      }
      if (query.startsWith("FOR session IN app_sessions")) steps.push("revoke-sessions");
      return [];
    },
  };
  const auth = new AuthService({ db, config: { sessionTtlSeconds: 3600 } });
  const updated = await auth.adminUpdateUser(admin._key, { status: "disabled" }, { _key: "admin-two" });
  assert.equal(updated.status, "disabled");
  assert.ok(writes.some((query) => query.includes("UPDATE @key WITH { role:")));
  assert.ok(writes.some((query) => query.includes("FOR session IN app_sessions")));
  assert.ok(writes.some((query) => query.includes("INSERT { _key: @key, actor_key: @actor")));
  assert.deepEqual(steps, ["update-user", "revoke-sessions", "commit"], "user state and active sessions must change before the same transaction commits");
  assert.equal(committed, true);
});

test("password reset claims a single-use token before changing the user in a separate AQL write", async () => {
  const calls = [];
  let tokenAvailable = true;
  const db = {
    async query(query, vars) {
      calls.push({ query, vars });
      if (query.startsWith("FOR reset IN app_password_resets")) {
        if (!tokenAvailable) return [];
        if (query.includes("UPDATE reset WITH")) tokenAvailable = false;
        else return ["user-one"];
        return [{ userKey: "user-one" }];
      }
      if (query.startsWith("FOR user IN app_users FILTER user._key == @userKey")) return [{ _key: vars.userKey }];
      return [];
    },
  };
  const auth = new AuthService({ db, config: { sessionTtlSeconds: 3600 } });
  const token = "single-use-test-reset-token-1234567890";
  const first = await auth.completePasswordReset(token, "New-Strong-Password-123!");
  assert.deepEqual(first, { changed: true });

  const writes = calls.filter(({ query }) => /\b(?:INSERT|UPDATE|REPLACE|REMOVE|UPSERT)\b/.test(query));
  assert.equal(writes.length, 4, "claim, user password, session revocation, and audit are separate writes");
  assert.match(writes[0].query, /UPDATE reset WITH \{ used_at: @now \} IN app_password_resets/);
  assert.match(writes[1].query, /UPDATE user WITH MERGE\(@credentials/);
  for (const { query } of writes) {
    assert.equal((query.match(/\b(?:INSERT|UPDATE|REPLACE|REMOVE|UPSERT)\b/g) || []).length, 1, "each AQL query must contain one data-modification operation");
  }

  await assert.rejects(auth.completePasswordReset(token, "Another-Strong-Password-123!"), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.code, "INVALID_RESET_TOKEN");
    return true;
  });
  assert.equal(calls.filter(({ query }) => query.startsWith("FOR user IN app_users FILTER user._key == @userKey")).length, 1, "replayed token cannot update the password again");
});

test("admin-created accounts inherit test-only marking only in test mode", async () => {
  for (const isTestMode of [false, true]) {
    const calls = [];
    const auth = {
      async createUser(input) {
        calls.push(input);
        return { _key: "created-user", email: input.email, display_name: input.displayName, role: input.role, status: "active", created_at: "2026-11-21T00:00:00.000Z", updated_at: "2026-11-21T00:00:00.000Z" };
      },
    };
    const service = new AdminService({ db: {}, auth, isTestMode });
    const created = await service.createUser({ email: "test@example.invalid", password: "Strong-Password-123!", displayName: "Test User" }, { _key: "admin-one" });
    assert.equal(calls[0].isTest, isTestMode);
    assert.deepEqual(created, { id: "created-user", email: "test@example.invalid", displayName: "Test User", role: "user", status: "active", createdAt: "2026-11-21T00:00:00.000Z", updatedAt: "2026-11-21T00:00:00.000Z" });
  }
});