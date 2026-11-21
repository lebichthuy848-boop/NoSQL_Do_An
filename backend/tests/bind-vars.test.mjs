import test from "node:test";
import assert from "node:assert/strict";
import { AdminService } from "../src/admin.mjs";
import { CatalogService } from "../src/catalog.mjs";

class BindVarCheckingDb {
  calls = [];

  async query(aql, bindVars = {}) {
    const names = new Set();
    for (const match of aql.matchAll(/(@@?)([A-Za-z][A-Za-z0-9_]*)/g)) {
      if (match[1] === "@") names.add(match[2]);
    }
    assert.deepEqual(
      [...Object.keys(bindVars)].sort(),
      [...names].sort(),
      `AQL bind variables must exactly match placeholders: ${aql}`,
    );
    this.calls.push({ aql, bindVars });
    return aql.includes("RETURN LENGTH(") ? [0] : [];
  }
}

const query = (params = {}) => new URLSearchParams(params);

test("catalog count queries receive only their filter bind variables", async () => {
  const db = new BindVarCheckingDb();
  const catalog = new CatalogService(db);

  await catalog.careers(query({ search: "engineer", group: "tech" }));
  await catalog.skills(query({ search: "data", type: "technical" }));
  await catalog.resources(query({ search: "course", type: "course", provider: "Example" }));
  await catalog.providers(query({ search: "Example" }));
  await catalog.skillGroups(query({ search: "data" }));

  assert.equal(db.calls.length, 11);
});

test("admin paginated count queries exclude offset and limit bind variables", async () => {
  const db = new BindVarCheckingDb();
  const admin = new AdminService({ db, auth: {} });

  await admin.users(query({ search: "person", status: "active", role: "user" }));
  await admin.resources(query({ search: "course", status: "pending" }));
  await admin.mappings(query({ status: "pending" }));

  assert.equal(db.calls.length, 6);
});
