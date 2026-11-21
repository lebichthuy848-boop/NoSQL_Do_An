import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSkillGap,
  careerFitScore,
  documentId,
  orderSkillsForLearning,
  passesRecommendationGates,
  validLearningPrerequisite,
} from "../src/domain.mjs";

const req = (skill, type) => ({ _to: `skills/${skill}`, requirement_type: type });

test("career fit uses unique essential and optional presence ratios", () => {
  const requirements = [req("e1", "essential"), req("e1", "essential"), req("e2", "essential"), req("o1", "optional"), req("o2", "optional")];
  assert.deepEqual(careerFitScore(requirements, []), {
    score: 0, essentialRatio: 0, optionalRatio: 0, essentialOwned: 0, essentialTotal: 2, optionalOwned: 0, optionalTotal: 2,
  });
  const fit = careerFitScore(requirements, ["skills/e1", "skills/o1"]);
  assert.equal(fit.essentialRatio, 0.5);
  assert.equal(fit.optionalRatio, 0.5);
  assert.equal(fit.score, 0.5);
  assert.equal(careerFitScore(requirements, ["skills/e1", "skills/e2"]).score, 0.8);
  assert.equal(careerFitScore(requirements, ["skills/e1", "skills/e2", "skills/o1", "skills/o2"]).score, 1);
});

test("skill gap separates Essential and Optional without proficiency claims", () => {
  const result = buildSkillGap([req("e1", "essential"), req("e2", "essential"), req("o1", "optional")], ["skills/e1", "skills/not-required"]);
  assert.deepEqual(result.missingEssentialSkillIds, ["skills/e2"]);
  assert.deepEqual(result.missingOptionalSkillIds, ["skills/o1"]);
  assert.deepEqual(result.essential, { required: 2, owned: 1, missing: 1 });
  assert.deepEqual(result.optional, { required: 1, owned: 0, missing: 1 });
  assert.equal(result.completion.ratio, 1 / 3);
  assert.equal(Object.hasOwn(result, "proficiency"), false);
});

test("recommendation gates require literal true on both course and teaches", () => {
  assert.equal(passesRecommendationGates({ recommendation_eligible: true }, { auto_recommendation_allowed: true }), true);
  assert.equal(passesRecommendationGates({ recommendation_eligible: false }, { auto_recommendation_allowed: true }), false);
  assert.equal(passesRecommendationGates({ recommendation_eligible: true }, { auto_recommendation_allowed: false }), false);
  assert.equal(passesRecommendationGates({ recommendation_eligible: null }, { auto_recommendation_allowed: null }), false);
  assert.equal(passesRecommendationGates({ recommendation_eligible: 1 }, { auto_recommendation_allowed: "true" }), false);
});

test("approved prerequisite direction is dependent to foundation and order reverses it", () => {
  const known = new Set(["skills/base", "skills/middle", "skills/target"]);
  const edges = [
    { _from: "skills/target", _to: "skills/middle", approved_for_learning_path: true, source_url: "https://example.test/target" },
    { _from: "skills/middle", _to: "skills/base", approved_for_learning_path: true, source_url: "https://example.test/middle" },
  ];
  assert.deepEqual(orderSkillsForLearning(["skills/target"], [], edges, known), ["skills/base", "skills/middle", "skills/target"]);
  assert.deepEqual(orderSkillsForLearning(["skills/target"], ["skills/base"], edges, known), ["skills/middle", "skills/target"]);
  assert.deepEqual(orderSkillsForLearning(["skills/target"], [], edges, known).slice(-1), ["skills/target"]);
});

test("unapproved, demo, invalid, or unknown-skill prerequisite edges are ignored", () => {
  const known = new Set(["skills/target", "skills/base"]);
  const edges = [
    { _from: "skills/target", _to: "skills/base", approved_for_learning_path: false, source_url: "https://example.test" },
    { _from: "skills/target", _to: "skills/base", approved_for_learning_path: true, is_demo: true, source_url: "https://example.test" },
    { _from: "skills/target", _to: "skills/ghost", approved_for_learning_path: true, source_url: "https://example.test" },
    { _from: "skills/target", _to: "skills/base", approved_for_learning_path: true, source_url: "javascript:alert(1)" },
  ];
  assert.equal(validLearningPrerequisite(edges[0], known), false);
  assert.deepEqual(orderSkillsForLearning(["skills/target"], [], edges, known), ["skills/target"]);
});

test("approved prerequisite cycles fail closed", () => {
  const known = new Set(["skills/a", "skills/b"]);
  const edges = [
    { _from: "skills/a", _to: "skills/b", approved_for_learning_path: true, source_url: "https://example.test/a" },
    { _from: "skills/b", _to: "skills/a", approved_for_learning_path: true, source_url: "https://example.test/b" },
  ];
  assert.throws(() => orderSkillsForLearning(["skills/a"], [], edges, known), /cycle/i);
});

test("document ids reject path traversal and malformed identifiers", () => {
  assert.equal(documentId("skills", "skill_one"), "skills/skill_one");
  assert.equal(documentId("skills", "skills/skill_one"), "skills/skill_one");
  assert.equal(documentId("skills", "skills/a/b"), null);
  assert.equal(documentId("skills", "../users/admin"), null);
  assert.equal(documentId("skills", ""), null);
});
