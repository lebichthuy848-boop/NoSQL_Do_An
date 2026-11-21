import test from "node:test";
import assert from "node:assert/strict";
import { AdminService } from "../src/admin.mjs";

test("skill prerequisites are read-only and include only approved evidence-backed skill edges", async () => {
  const rows = [{
    key: "javascript-foundation",
    dependentSkillId: "skills/javascript",
    dependentSkillName: "JavaScript",
    foundationSkillId: "skills/markup",
    foundationSkillName: "use markup languages",
    direction: "dependent → foundation",
    status: "approved",
    source: "MDN Web Docs",
    sourceReviewStatus: "approved_for_learning_path_foundation",
    evidenceScope: "web_development_curriculum_foundation_not_global_javascript_requirement",
    sourceUrl: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting",
  }];
  let capturedQuery = "";
  const service = new AdminService({
    db: { query: async (query) => { capturedQuery = query; return rows; } },
    auth: { audit: async () => {} },
  });

  assert.deepEqual(await service.skillPrerequisites(), rows);
  assert.match(capturedQuery, /FOR edge IN skill_prerequisite/);
  assert.match(capturedQuery, /approved_for_learning_path == true/);
  assert.match(capturedQuery, /edge\.is_demo != true/);
  assert.match(capturedQuery, /edge\.source_url != null/);
  assert.match(capturedQuery, /dependentSkillId: edge\._from/);
  assert.match(capturedQuery, /foundationSkillId: edge\._to/);
  assert.doesNotMatch(capturedQuery, /\b(INSERT|UPDATE|REMOVE|REPLACE|UPSERT)\b/i);
});

test("database status separates the Batch 2, app_*, and ArangoDB system namespaces", async () => {
  const core = Array.from({ length: 25 }, (_, index) => ({ name: `core_${index + 1}` }));
  const application = Array.from({ length: 8 }, (_, index) => ({ name: `app_test_${index + 1}` }));
  const system = Array.from({ length: 8 }, (_, index) => ({ name: `_system_${index + 1}`, isSystem: true }));
  const service = new AdminService({
    db: {
      version: async () => ({ version: "3.12.11" }),
      request: async (path) => path === "/_api/collection"
        ? { result: [...core, ...application, ...system] }
        : { result: { name: "skill_graph_v366_acceptance" } },
    },
    auth: { audit: async () => {} },
  });

  const status = await service.databaseStatus();
  assert.equal(status.version, "3.12.11");
  assert.equal(status.database, "skill_graph_v366_acceptance");
  assert.equal(status.collectionCount, 41);
  assert.deepEqual({ core: status.collectionGroups.core.count, application: status.collectionGroups.application.count, system: status.collectionGroups.system.count }, { core: 25, application: 8, system: 8 });
  assert.match(status.checkedAt, /^\d{4}-\d\d-\d\dT/);
});
