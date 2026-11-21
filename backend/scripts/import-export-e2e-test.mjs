import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { ArangoClient } from "../src/arango.mjs";
import { loadConfig } from "../src/config.mjs";

const config = loadConfig();
if (config.databaseUrl !== "http://127.0.0.1:39531" || config.databaseName !== "skill_graph_v366_acceptance" || config.databaseUser !== "skillgraph_e2e_runtime" || !config.databasePassword) {
  throw new Error("Import/export test refused: target is not the approved isolated E2E database and runtime principal");
}

const db = new ArangoClient({ url: config.databaseUrl, database: config.databaseName, username: config.databaseUser, password: config.databasePassword });
const database = await db.request("/_api/database/current");
if (database.result?.name !== "skill_graph_v366_acceptance") throw new Error("Import/export test refused: active database identity did not match");

const key = `codex_io_${randomUUID().replaceAll("-", "")}`;
const fixture = {
  _key: key,
  actor_key: "codex-final-release",
  event_type: "test.import_export_roundtrip",
  target_id: key,
  created_at: new Date().toISOString(),
  is_test: true,
  test_scenario: "final_import_export",
  metadata: { rowCount: 1, purpose: "isolated import/export evidence" },
};
let imported = false;
let output = null;
let cleanupSucceeded = false;
try {
  const importResult = await db.request("/_api/import?collection=app_audit_log&type=array&onDuplicate=error", { method: "POST", body: [fixture] });
  if (importResult.errors > 0 || importResult.created !== 1) throw new Error("Import endpoint did not report exactly one created document");
  imported = true;

  const exported = await db.query("FOR doc IN app_audit_log FILTER doc._key == @key RETURN doc", { key });
  assert.equal(exported.length, 1, "read-only cursor export should return exactly one imported test row");
  const { _id, _rev, ...exportedFields } = exported[0];
  assert.deepEqual(exportedFields, fixture, "imported fields should match the exported JSON row");
  const exportSha256 = createHash("sha256").update(JSON.stringify(exportedFields), "utf8").digest("hex");
  output = {
    status: "PASS",
    database: database.result.name,
    import: { tool: "ArangoDB HTTP API /_api/import (type=array)", rows: importResult.created },
    export: { tool: "ArangoDB AQL cursor JSON response", rows: exported.length, sha256: exportSha256 },
    roundTripFieldsMatch: true,
  };
} finally {
  if (imported) {
    const removed = await db.query("FOR doc IN app_audit_log FILTER doc._key == @key AND doc.test_scenario == 'final_import_export' REMOVE doc IN app_audit_log RETURN OLD._key", { key });
    const remaining = await db.query("RETURN LENGTH(FOR doc IN app_audit_log FILTER doc._key == @key RETURN 1)", { key });
    cleanupSucceeded = removed.length === 1 && remaining[0] === 0;
    if (!cleanupSucceeded) throw new Error("Import/export test could not remove its own test-marked app_* record");
  } else {
    const leftovers = await db.query("FOR doc IN app_audit_log FILTER doc._key == @key AND doc.test_scenario == 'final_import_export' REMOVE doc IN app_audit_log RETURN OLD._key", { key });
    cleanupSucceeded = leftovers.length === 0;
  }
}

process.stdout.write(`${JSON.stringify({ ...output, cleanup: cleanupSucceeded ? "PASS_AND_CLEANED" : "NOT_REQUIRED" }, null, 2)}\n`);
