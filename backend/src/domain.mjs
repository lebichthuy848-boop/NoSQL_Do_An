export const COLLECTIONS = Object.freeze({
  careers: "careers",
  skills: "skills",
  courses: "courses",
  providers: "providers",
  requirements: "requires_skill",
  teaches: "teaches",
  offeredBy: "offered_by",
  skillGroups: "skill_groups",
  skillGroupEdges: "esco_skill_group",
  skillBroader: "esco_skill_broader",
  groupBroader: "esco_group_broader",
  skillKnowledge: "esco_skill_knowledge",
  skillPrerequisites: "skill_prerequisite",
});

export const APP_COLLECTIONS = Object.freeze([
  "app_users",
  "app_sessions",
  "app_password_resets",
  "app_profiles",
  "app_audit_log",
  "app_resource_drafts",
  "app_provider_drafts",
  "app_mapping_drafts",
]);

export const retainedMappingDecisions = new Set([
  "retain_with_scope",
  "retain_with_narrow_scope",
  "retain_with_scope_after_review",
  "retain_after_url_and_scope_review",
]);

export function documentId(collection, value) {
  const text = String(value || "").trim();
  const key = text.startsWith(`${collection}/`) ? text.slice(collection.length + 1) : text;
  if (!key || key.includes("/") || key.length > 254 || !/^[A-Za-z0-9_:.@()+,=;$!*'%~-]+$/.test(key)) return null;
  return `${collection}/${key}`;
}

export function documentKey(collection, value) {
  const id = documentId(collection, value);
  return id ? id.slice(collection.length + 1) : null;
}

export function skillRequirementGroups(requirements) {
  const essential = [...new Set(requirements.filter((edge) => edge.requirement_type === "essential").map((edge) => edge._to))];
  const optional = [...new Set(requirements.filter((edge) => edge.requirement_type === "optional").map((edge) => edge._to))];
  return { essential, optional };
}

export function careerFitScore(requirements, ownedSkillIds) {
  const groups = skillRequirementGroups(requirements);
  const owned = new Set(ownedSkillIds);
  const essentialRatio = groups.essential.length
    ? groups.essential.filter((id) => owned.has(id)).length / groups.essential.length
    : 0;
  const optionalRatio = groups.optional.length
    ? groups.optional.filter((id) => owned.has(id)).length / groups.optional.length
    : 0;
  return {
    score: 0.8 * essentialRatio + 0.2 * optionalRatio,
    essentialRatio,
    optionalRatio,
    essentialOwned: groups.essential.filter((id) => owned.has(id)).length,
    essentialTotal: groups.essential.length,
    optionalOwned: groups.optional.filter((id) => owned.has(id)).length,
    optionalTotal: groups.optional.length,
  };
}

export function buildSkillGap(requirements, ownedSkillIds) {
  const groups = skillRequirementGroups(requirements);
  const owned = new Set(ownedSkillIds);
  const allRequired = [...new Set([...groups.essential, ...groups.optional])];
  const missingEssential = groups.essential.filter((id) => !owned.has(id));
  const missingOptional = groups.optional.filter((id) => !owned.has(id));
  const missing = [...new Set([...missingEssential, ...missingOptional])];
  const completed = allRequired.length - missing.length;
  return {
    requiredSkillIds: allRequired,
    ownedRequiredSkillIds: allRequired.filter((id) => owned.has(id)),
    missingSkillIds: missing,
    missingEssentialSkillIds: missingEssential,
    missingOptionalSkillIds: missingOptional,
    essential: { required: groups.essential.length, owned: groups.essential.length - missingEssential.length, missing: missingEssential.length },
    optional: { required: groups.optional.length, owned: groups.optional.length - missingOptional.length, missing: missingOptional.length },
    completion: { completed, required: allRequired.length, ratio: allRequired.length ? completed / allRequired.length : 0 },
  };
}

export function passesRecommendationGates(course, teaches) {
  return course?.recommendation_eligible === true && teaches?.auto_recommendation_allowed === true;
}

export function validLearningPrerequisite(edge, skillIds) {
  return edge?.approved_for_learning_path === true && edge?.is_demo !== true &&
    edge?._from !== edge?._to && skillIds.has(edge?._from) && skillIds.has(edge?._to) &&
    typeof edge?.source_url === "string" && /^https?:\/\/[^\s]+$/i.test(edge.source_url);
}

export function orderSkillsForLearning(targetSkillIds, ownedSkillIds, prerequisites, knownSkillIds = null) {
  const owned = new Set(ownedSkillIds);
  const validSkills = knownSkillIds ? new Set(knownSkillIds) : new Set([...targetSkillIds, ...ownedSkillIds]);
  const edges = prerequisites.filter((edge) => validLearningPrerequisite(edge, validSkills));
  const ordered = [];
  const state = new Map();
  function visit(skillId) {
    const current = state.get(skillId);
    if (current === 1) throw new Error("Approved skill prerequisite cycle detected");
    if (current === 2) return;
    state.set(skillId, 1);
    for (const edge of edges) {
      if (edge._from === skillId) visit(edge._to);
    }
    state.set(skillId, 2);
    if (!owned.has(skillId) && !ordered.includes(skillId)) ordered.push(skillId);
  }
  for (const skillId of targetSkillIds) visit(skillId);
  return ordered;
}

export function publicCareer(doc) {
  return {
    key: doc._key,
    id: doc._id,
    name: doc.name || "",
    description: doc.description || "",
    careerGroup: doc.career_group || "",
    iscoGroup: doc.isco_group || "",
    escoUri: doc.esco_uri || "",
  };
}

export function publicSkill(doc) {
  return {
    key: doc._key,
    id: doc._id,
    name: doc.name || "",
    description: doc.description || "",
    skillType: doc.skill_type || "",
    escoUri: doc.esco_uri || "",
    reuseLevel: doc.reuse_level || null,
  };
}

export function publicProvider(doc) {
  return { key: doc._key, id: doc._id, name: doc.name || "", officialWebsite: doc.official_website || null };
}

export function publicResource(doc) {
  return {
    key: doc._key,
    id: doc._id,
    title: doc.title || "",
    canonicalUrl: doc.canonical_url || "",
    providerName: doc.provider_name || "",
    resourceType: doc.resource_type || "",
    language: doc.language || "",
    level: doc.level || null,
    certificateAvailable: typeof doc.certificate_available === "boolean" ? doc.certificate_available : null,
    recommendationEligible: doc.recommendation_eligible === true,
  };
}
