import test from "node:test";
import assert from "node:assert/strict";
import { AdminService } from "../src/admin.mjs";
import { AuthService } from "../src/auth.mjs";
import { hashPassword } from "../src/security.mjs";

const actor = { _key: "admin-one" };
const resource = { _key: "resource-one", status: "pending", provider_name: "Existing Provider", recommendation_eligible: true };
const provider = { _key: "provider-one", status: "pending", name: "Pending Provider", official_website: "https://example.invalid" };
const mapping = { _key: "mapping-one", status: "pending", resource_key: "resource-one", skill_key: "skill-one", auto_recommendation_allowed: false };
const skill = { _key: "skill-two", _id: "skills/skill-two" };

function pendingWriteDb() {
  const writes = [];
  const db = {
    async query(query) {
      if (query === "FOR doc IN app_resource_drafts FILTER doc._key == @key LIMIT 1 RETURN doc") return [resource];
      if (query === "FOR doc IN app_provider_drafts FILTER doc._key == @key LIMIT 1 RETURN doc") return [provider];
      if (query === "FOR doc IN app_mapping_drafts FILTER doc._key == @key LIMIT 1 RETURN doc") return [mapping];
      if (query === "FOR item IN app_mapping_drafts FILTER item._key == @key LIMIT 1 RETURN item") return [mapping];
      if (query === "FOR doc IN app_resource_drafts FILTER doc._key == @key LIMIT 1 RETURN doc") return [resource];
      if (query.startsWith("FOR mapping IN app_mapping_drafts FILTER mapping.resource_key == @resourceKey")) return [];
      if (query === "LET item = DOCUMENT(@id) FILTER item != null RETURN item") return [skill];
      if (query.startsWith("RETURN LENGTH(FOR mapping IN app_mapping_drafts")) return [0];
      if (query.startsWith("RETURN LENGTH(FOR resource IN app_resource_drafts")) return [0];
      if (/^(FOR doc IN (app_resource_drafts|app_provider_drafts|app_mapping_drafts)|FOR mapping IN app_mapping_drafts).*(UPDATE|REMOVE)/.test(query)) {
        writes.push(query);
        return [];
      }
      throw new Error("Unexpected query in pending-write test");
    },
  };
  return { db, writes };
}

test("resource, provider, and mapping writes fail closed if a concurrent review wins", async () => {
  const operations = [
    ["resource edit", (service) => service.updateResourceDraft("resource-one", { title: "changed" }, actor)],
    ["resource delete", (service) => service.deleteResourceDraft("resource-one", actor)],
    ["resource review", (service) => service.reviewResourceDraft("resource-one", { decision: "approve", evidenceUrl: "https://example.invalid/evidence", sourceSummary: "review evidence" }, actor)],
    ["provider edit", (service) => service.updateProvider("provider-one", { officialWebsite: "https://example.invalid/updated" }, actor)],
    ["provider delete", (service) => service.deleteProvider("provider-one", actor)],
    ["provider review", (service) => service.reviewProvider("provider-one", { decision: "approve", evidenceUrl: "https://example.invalid/evidence", sourceSummary: "review evidence" }, actor)],
    ["mapping edit", (service) => service.updateMapping("mapping-one", { skillId: "skills/skill-two" }, actor)],
    ["mapping delete", (service) => service.deleteMapping("mapping-one", actor)],
    ["mapping review", (service) => service.reviewMapping("mapping-one", { decision: "approve", evidenceUrl: "https://example.invalid/evidence", evidenceScope: "direct_topic", sourceSummary: "review evidence" }, actor)],
  ];

  for (const [name, operation] of operations) {
    const { db, writes } = pendingWriteDb();
    const service = new AdminService({ db, auth: { audit: async () => {} } });
    await assert.rejects(operation(service), (error) => {
      assert.equal(error.status, 409, name);
      assert.equal(error.code, "ALREADY_REVIEWED", name);
      return true;
    });
    assert.equal(writes.length, 1, name);
    assert.match(writes[0], /status == 'pending'/, name + " must test status in the modifying AQL statement");
  }
});

test("duplicate mappings return 409 on precheck and on a concurrent unique-index conflict", async () => {
  const resourceDoc = { _key: "resource-one" };
  const skillDoc = { _key: "skill-one", _id: "skills/skill-one" };
  const mappingDoc = { _key: "mapping-one", status: "pending", resource_key: "resource-one", skill_key: "skill-one" };
  const duplicateDb = {
    async query(query) {
      if (query.startsWith("FOR doc IN app_resource_drafts")) return [resourceDoc];
      if (query.startsWith("LET doc = DOCUMENT(@id)")) return [skillDoc];
      if (query.startsWith("FOR mapping IN app_mapping_drafts FILTER mapping.resource_key")) return ["existing-mapping"];
      if (query.startsWith("FOR doc IN app_mapping_drafts FILTER doc._key")) return [mappingDoc];
      if (query.startsWith("LET item = DOCUMENT(@id)")) return [{ _key: "skill-two", _id: "skills/skill-two" }];
      throw new Error("Unexpected duplicate mapping query");
    },
  };
  const service = new AdminService({ db: duplicateDb, auth: { audit: async () => {} } });
  await assert.rejects(service.createMapping({ resourceId: "resource-one", skillId: "skills/skill-one" }, actor), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "DUPLICATE_MAPPING");
    return true;
  });
  await assert.rejects(service.updateMapping("mapping-one", { skillId: "skills/skill-two" }, actor), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "DUPLICATE_MAPPING");
    return true;
  });

  const raceDb = {
    async query(query) {
      if (query.startsWith("FOR doc IN app_resource_drafts")) return [resourceDoc];
      if (query.startsWith("LET doc = DOCUMENT(@id)")) return [skillDoc];
      if (query.startsWith("FOR mapping IN app_mapping_drafts FILTER mapping.resource_key")) return [];
      if (query.startsWith("INSERT @doc INTO app_mapping_drafts")) throw Object.assign(new Error("duplicate index"), { errorNum: 1210 });
      throw new Error("Unexpected unique-index race query");
    },
  };
  const raceService = new AdminService({ db: raceDb, auth: { audit: async () => {} } });
  await assert.rejects(raceService.createMapping({ resourceId: "resource-one", skillId: "skills/skill-one" }, actor), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "DUPLICATE_MAPPING");
    return true;
  });
});

test("password and session revocation share one transaction and abort together on revoke failure", async () => {
  const currentPassword = "Current-Strong-Password-123!";
  const newPassword = "Replacement-Strong-Password-456!";
  const credentials = await hashPassword(currentPassword);

  async function run(failRevoke) {
    const writes = [];
    let committed = false;
    let aborted = false;
    const stored = { _key: "user-one", status: "active", ...credentials };
    const db = {
      async beginTransaction(options) {
        assert.deepEqual(options, {
          write: ["app_users", "app_sessions", "app_audit_log"],
          exclusive: ["app_users", "app_sessions", "app_audit_log"],
          lockTimeout: 10,
        });
        return "password-transaction";
      },
      async commitTransaction(transactionId) {
        assert.equal(transactionId, "password-transaction");
        committed = true;
      },
      async abortTransaction(transactionId) {
        assert.equal(transactionId, "password-transaction");
        aborted = true;
        writes.length = 0;
      },
      async query(query, vars, options = {}) {
        if (query === "FOR user IN app_users FILTER user._key == @key LIMIT 1 RETURN user") return [stored];
        if (query.startsWith("FOR user IN app_users FILTER user._key == @key AND user.status == 'active'")) {
          assert.equal(options.transactionId, "password-transaction");
          assert.notEqual(vars.credentials.password_hash, credentials.password_hash);
          writes.push("password");
          return [{ ...stored, ...vars.credentials }];
        }
        if (query.startsWith("FOR session IN app_sessions")) {
          assert.equal(options.transactionId, "password-transaction");
          if (failRevoke) throw new Error("simulated session revoke failure");
          writes.push("sessions");
          return [];
        }
        if (query.startsWith("INSERT { _key: @key, actor_key: @actor")) {
          assert.equal(options.transactionId, "password-transaction");
          writes.push("audit");
          return [];
        }
        throw new Error("Unexpected password transaction query");
      },
    };
    const auth = new AuthService({ db, config: { sessionTtlSeconds: 3600 } });
    return { auth, writes, get committed() { return committed; }, get aborted() { return aborted; } };
  }

  const success = await run(false);
  await success.auth.changePassword({ _key: "user-one" }, currentPassword, newPassword);
  assert.deepEqual(success.writes, ["password", "sessions", "audit"]);
  assert.equal(success.committed, true);
  assert.equal(success.aborted, false);

  const failure = await run(true);
  await assert.rejects(failure.auth.changePassword({ _key: "user-one" }, currentPassword, newPassword), /simulated session revoke failure/);
  assert.deepEqual(failure.writes, [], "aborted transaction must not persist the password update");
  assert.equal(failure.committed, false);
  assert.equal(failure.aborted, true);
});