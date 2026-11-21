import { HttpError } from "./errors.mjs";
import { buildSkillGap, careerFitScore, documentId, documentKey, orderSkillsForLearning, passesRecommendationGates, publicCareer, publicResource, publicSkill } from "./domain.mjs";
import { newId } from "./security.mjs";

const nowIso = () => new Date().toISOString();

function profileOutput(profile) {
  const resourceIds = (values) => (values || []).map((value) => String(value).includes("/") ? value : `courses/${value}`);
  return {
    careerGoalId: profile.career_key ? `careers/${profile.career_key}` : null,
    skillIds: (profile.skill_keys || []).map((key) => `skills/${key}`),
    savedResourceIds: resourceIds(profile.saved_resource_keys),
    plannedResourceIds: resourceIds(profile.planned_resource_keys),
    viewedResourceIds: resourceIds(profile.viewed_resource_keys),
    completedResourceIds: resourceIds(profile.completed_resource_keys),
    notes: profile.notes || {},
  };
}

export class UserDataService {
  constructor(db) { this.db = db; }

  async getProfile(user) {
    const rows = await this.db.query("FOR p IN app_profiles FILTER p._key == @key LIMIT 1 RETURN p", { key: user._key });
    const profile = rows[0];
    if (!profile) throw new HttpError(404, "PROFILE_NOT_FOUND", "User profile was not found");
    return { user: { id: user._key, email: user.email, displayName: user.display_name, role: user.role, status: user.status }, profile: profileOutput(profile) };
  }

  async updateProfile(user, displayName) {
    if (typeof displayName !== "string" || !displayName.trim() || displayName.trim().length > 120) {
      throw new HttpError(400, "VALIDATION_ERROR", "displayName must contain 1–120 characters");
    }
    const rows = await this.db.query("UPDATE @key WITH { display_name: @name, updated_at: @now } IN app_users RETURN NEW", {
      key: user._key, name: displayName.trim(), now: nowIso(),
    });
    if (!rows[0]) throw new HttpError(404, "NOT_FOUND", "User was not found");
    return { id: rows[0]._key, email: rows[0].email, displayName: rows[0].display_name, role: rows[0].role, status: rows[0].status, createdAt: rows[0].created_at };
  }

  async getStoredProfile(userKey) {
    const rows = await this.db.query("FOR p IN app_profiles FILTER p._key == @key LIMIT 1 RETURN p", { key: userKey });
    if (!rows[0]) throw new HttpError(404, "PROFILE_NOT_FOUND", "User profile was not found");
    return rows[0];
  }

  async setCareerGoal(user, careerId) {
    const fullId = documentId("careers", careerId);
    if (!fullId) throw new HttpError(400, "VALIDATION_ERROR", "careerId is invalid");
    const careers = await this.db.query("LET career = DOCUMENT(@id) FILTER career != null RETURN career", { id: fullId });
    if (!careers[0]) throw new HttpError(404, "CAREER_NOT_FOUND", "Career was not found");
    const rows = await this.db.query(
      "FOR p IN app_profiles FILTER p._key == @key UPDATE p WITH { career_key: @careerKey, updated_at: @now } IN app_profiles RETURN NEW",
      { key: user._key, careerKey: careers[0]._key, now: nowIso() },
    );
    if (!rows[0]) throw new HttpError(404, "PROFILE_NOT_FOUND", "User profile was not found");
    return { careerGoalId: `careers/${careers[0]._key}`, skillIds: (rows[0].skill_keys || []).map((key) => `skills/${key}`) };
  }

  async addSkill(user, skillId) {
    const fullId = documentId("skills", skillId);
    if (!fullId) throw new HttpError(400, "VALIDATION_ERROR", "skillId is invalid");
    const skill = (await this.db.query("LET skill = DOCUMENT(@id) FILTER skill != null RETURN skill", { id: fullId }))[0];
    if (!skill) throw new HttpError(404, "SKILL_NOT_FOUND", "Skill was not found");
    const rows = await this.db.query(
      "FOR p IN app_profiles FILTER p._key == @key UPDATE p WITH { skill_keys: UNIQUE(APPEND(p.skill_keys, @skillKey)), updated_at: @now } IN app_profiles RETURN NEW",
      { key: user._key, skillKey: skill._key, now: nowIso() },
    );
    if (!rows[0]) throw new HttpError(404, "PROFILE_NOT_FOUND", "User profile was not found");
    return { skillIds: rows[0].skill_keys.map((key) => `skills/${key}`) };
  }

  async removeSkill(user, skillId) {
    const skillKey = documentKey("skills", skillId);
    if (!skillKey) throw new HttpError(400, "VALIDATION_ERROR", "skillId is invalid");
    const rows = await this.db.query(
      "FOR p IN app_profiles FILTER p._key == @key UPDATE p WITH { skill_keys: REMOVE_VALUE(p.skill_keys, @skillKey), updated_at: @now } IN app_profiles RETURN NEW",
      { key: user._key, skillKey, now: nowIso() },
    );
    if (!rows[0]) throw new HttpError(404, "PROFILE_NOT_FOUND", "User profile was not found");
    return { skillIds: rows[0].skill_keys.map((key) => `skills/${key}`) };
  }

  async getCareerRequirements(careerId) {
    return this.db.query(
      "FOR edge IN requires_skill FILTER edge._from == @careerId LET skill = DOCUMENT(edge._to) FILTER skill != null RETURN { edge, skill }",
      { careerId },
    );
  }

  async skillGap(user, careerId = null) {
    const profile = await this.getStoredProfile(user._key);
    const requested = careerId || (profile.career_key ? `careers/${profile.career_key}` : null);
    if (!requested) throw new HttpError(400, "CAREER_GOAL_REQUIRED", "Choose a target career to calculate skill gaps");
    const fullId = documentId("careers", requested);
    if (!fullId) throw new HttpError(400, "VALIDATION_ERROR", "careerId is invalid");
    const career = (await this.db.query("LET career = DOCUMENT(@id) FILTER career != null RETURN career", { id: fullId }))[0];
    if (!career) throw new HttpError(404, "CAREER_NOT_FOUND", "Career was not found");
    const rows = await this.getCareerRequirements(career._id);
    const result = buildSkillGap(rows.map((row) => row.edge), (profile.skill_keys || []).map((key) => `skills/${key}`));
    const skills = new Map(rows.map((row) => [row.skill._id, publicSkill(row.skill)]));
    return {
      career: publicCareer(career),
      ...result,
      requiredSkills: result.requiredSkillIds.map((id) => skills.get(id)).filter(Boolean),
      missingEssentialSkills: result.missingEssentialSkillIds.map((id) => skills.get(id)).filter(Boolean),
      missingOptionalSkills: result.missingOptionalSkillIds.map((id) => skills.get(id)).filter(Boolean),
      note: "Skill presence is user-declared; no proficiency level is inferred.",
    };
  }

  async careerFit(user) {
    const profile = await this.getStoredProfile(user._key);
    const careers = await this.db.query("FOR career IN careers SORT LOWER(career.name) RETURN career");
    const requirements = await this.db.query("FOR edge IN requires_skill RETURN edge");
    const byCareer = new Map(careers.map((career) => [career._id, []]));
    for (const edge of requirements) byCareer.get(edge._from)?.push(edge);
    const owned = (profile.skill_keys || []).map((key) => `skills/${key}`);
    return careers.map((career) => ({ career: publicCareer(career), ...careerFitScore(byCareer.get(career._id) || [], owned) }))
      .sort((a, b) => b.score - a.score || a.career.name.localeCompare(b.career.name));
  }

  async recommendationData(careerId, profile, requestedSkillIds = null) {
    const fullId = documentId("careers", careerId);
    if (!fullId) throw new HttpError(400, "VALIDATION_ERROR", "careerId is invalid");
    const career = (await this.db.query("LET career = DOCUMENT(@id) FILTER career != null RETURN career", { id: fullId }))[0];
    if (!career) throw new HttpError(404, "CAREER_NOT_FOUND", "Career was not found");
    const requirementRows = await this.getCareerRequirements(career._id);
    const gap = buildSkillGap(requirementRows.map((row) => row.edge), (profile.skill_keys || []).map((key) => `skills/${key}`));
    const completed = new Set((profile.completed_resource_keys || []).map((value) => String(value).includes("/") ? value : `courses/${value}`));
    const missing = requestedSkillIds || gap.missingSkillIds;
    if (!missing.length) return { career, gap, items: [] };
    const rows = await this.db.query(
      "FOR edge IN teaches FILTER edge._to IN @skillIds LET course = DOCUMENT(edge._from) FILTER course != null RETURN { edge, course }",
      { skillIds: missing },
    );
    const grouped = new Map();
    for (const { edge, course } of rows) {
      if (!passesRecommendationGates(course, edge) || completed.has(course._id)) continue;
      const current = grouped.get(course._id) || { resource: publicResource(course), skillIds: [], evidence: [] };
      if (!current.skillIds.includes(edge._to)) current.skillIds.push(edge._to);
      current.evidence.push({ teachesId: edge._id, autoRecommendationAllowed: edge.auto_recommendation_allowed === true, evidenceScope: edge.evidence_scope || null, evidenceUrl: edge.reviewed_page_url || edge.evidence_url || null, mappingNote: edge.reviewed_page_summary || edge.review_note || null });
      grouped.set(course._id, current);
    }
    const appRows = await this.db.query(
      "FOR edge IN app_mapping_drafts FILTER edge.is_test != true AND edge.skill_key IN @skillKeys AND edge.status == 'approved' AND edge.auto_recommendation_allowed == true LET course = DOCUMENT(CONCAT('app_resource_drafts/', edge.resource_key)) FILTER course != null AND course.is_test != true AND course.status == 'approved' AND course.recommendation_eligible == true RETURN { edge, course }",
      { skillKeys: missing.map((id) => documentKey("skills", id)) },
    );
    for (const { edge, course } of appRows) {
      if (completed.has(course._id)) continue;
      const skillId = `skills/${edge.skill_key}`;
      const current = grouped.get(course._id) || { resource: publicResource(course), skillIds: [], evidence: [] };
      if (!current.skillIds.includes(skillId)) current.skillIds.push(skillId);
      current.evidence.push({ teachesId: `app_mapping_drafts/${edge._key}`, autoRecommendationAllowed: edge.auto_recommendation_allowed === true, evidenceScope: edge.evidence_scope || null, evidenceUrl: edge.evidence_url || null, mappingNote: edge.review_note || null });
      grouped.set(course._id, current);
    }
    const skillDocs = await this.db.query("FOR id IN @ids LET skill = DOCUMENT(id) FILTER skill != null RETURN skill", { ids: missing });
    const skillsById = new Map(skillDocs.map((skill) => [skill._id, publicSkill(skill)]));
    const items = [...grouped.values()].map((item) => ({
      ...item,
      skills: item.skillIds.map((id) => skillsById.get(id)).filter(Boolean),
      skillIds: item.skillIds,
    })).sort((a, b) => a.resource.title.localeCompare(b.resource.title));
    return { career, gap, items };
  }

  async recommendations(user, careerId = null) {
    const profile = await this.getStoredProfile(user._key);
    const target = careerId || (profile.career_key ? `careers/${profile.career_key}` : null);
    if (!target) throw new HttpError(400, "CAREER_GOAL_REQUIRED", "Choose a target career to get recommendations");
    const result = await this.recommendationData(target, profile);
    return { career: publicCareer(result.career), items: result.items, missingSkillIds: result.gap.missingSkillIds };
  }

  async learningPath(user, careerId = null) {
    const profile = await this.getStoredProfile(user._key);
    const target = careerId || (profile.career_key ? `careers/${profile.career_key}` : null);
    if (!target) throw new HttpError(400, "CAREER_GOAL_REQUIRED", "Choose a target career to build a learning path");
    const initial = await this.recommendationData(target, profile);
    const skillDocs = await this.db.query("FOR skill IN skills RETURN skill");
    const skillIds = new Set(skillDocs.map((skill) => skill._id));
    const prerequisiteEdges = await this.db.query("FOR edge IN skill_prerequisite FILTER edge.approved_for_learning_path == true AND edge.is_demo != true RETURN edge");
    const owned = (profile.skill_keys || []).map((key) => `skills/${key}`);
    const orderedIds = orderSkillsForLearning(initial.gap.missingSkillIds, owned, prerequisiteEdges, skillIds);
    const result = await this.recommendationData(target, profile, orderedIds);
    const skillsById = new Map(skillDocs.map((skill) => [skill._id, publicSkill(skill)]));
    const recsBySkill = new Map();
    for (const rec of result.items) {
      for (const skillId of rec.skillIds) {
        const list = recsBySkill.get(skillId) || [];
        list.push(rec);
        recsBySkill.set(skillId, list);
      }
    }
    const uniqueResourceIds = new Set();
    const steps = orderedIds.map((skillId, index) => {
      const resources = (recsBySkill.get(skillId) || []).filter((rec) => {
        if (uniqueResourceIds.has(rec.resource.id)) return false;
        uniqueResourceIds.add(rec.resource.id);
        return true;
      }).map((rec) => ({ ...rec.resource, coversSkillIds: rec.skillIds, evidence: rec.evidence }));
      return { order: index + 1, skill: skillsById.get(skillId) || { id: skillId }, resources, hasResources: resources.length > 0 };
    });
    return {
      career: publicCareer(result.career),
      steps,
      missingSkillCount: result.gap.missingSkillIds.length,
      skillsWithoutEligibleResources: steps.filter((step) => !step.hasResources).map((step) => step.skill.id),
      note: "Approved skill prerequisite edges are followed from dependent skill to foundation. Resource completion does not establish skill proficiency.",
    };
  }

  async updateResourceState(user, resourceId, changes) {
    const ref = resourceReference(resourceId);
    if (!ref) throw new HttpError(400, "VALIDATION_ERROR", "resourceId is invalid");
    const course = (await this.db.query("LET course = DOCUMENT(@id) FILTER course != null AND (@collection != 'app_resource_drafts' OR course.status == 'approved') RETURN course", { id: ref.id, collection: ref.collection }))[0];
    if (!course) throw new HttpError(404, "RESOURCE_NOT_FOUND", "Learning resource was not found");
    const allowed = ["saved", "planned", "viewed", "note"];
    if (Object.keys(changes).some((key) => !allowed.includes(key))) throw new HttpError(400, "VALIDATION_ERROR", "Unknown resource state field");
    for (const key of ["saved", "planned", "viewed"]) {
      if (key in changes && typeof changes[key] !== "boolean") throw new HttpError(400, "VALIDATION_ERROR", `${key} must be a boolean`);
    }
    if ("note" in changes && changes.note !== null && (typeof changes.note !== "string" || changes.note.length > 5000)) {
      throw new HttpError(400, "VALIDATION_ERROR", "note must be null or at most 5000 characters");
    }
    const patch = {};
    for (const name of ["saved", "planned", "viewed"]) patch[name] = name in changes;
    const rows = await this.db.query(
      "FOR p IN app_profiles FILTER p._key == @userKey UPDATE p WITH { saved_resource_keys: @hasSaved ? (@saved ? UNIQUE(APPEND(p.saved_resource_keys, @resourceId)) : REMOVE_VALUE(p.saved_resource_keys, @resourceId)) : p.saved_resource_keys, planned_resource_keys: @hasPlanned ? (@planned ? UNIQUE(APPEND(p.planned_resource_keys, @resourceId)) : REMOVE_VALUE(p.planned_resource_keys, @resourceId)) : p.planned_resource_keys, viewed_resource_keys: @hasViewed ? (@viewed ? UNIQUE(APPEND(p.viewed_resource_keys, @resourceId)) : REMOVE_VALUE(p.viewed_resource_keys, @resourceId)) : p.viewed_resource_keys, notes: @hasNote ? (@note == null ? UNSET(p.notes, @resourceId) : MERGE(p.notes, @notePatch)) : p.notes, updated_at: @now } IN app_profiles RETURN NEW",
      {
        userKey: user._key, resourceId: ref.id,
        hasSaved: patch.saved, saved: changes.saved ?? false,
        hasPlanned: patch.planned, planned: changes.planned ?? false,
        hasViewed: patch.viewed, viewed: changes.viewed ?? false,
        hasNote: "note" in changes, note: changes.note ?? null,
        notePatch: "note" in changes && changes.note !== null ? { [ref.id]: changes.note } : {},
        now: nowIso(),
      },
    );
    if (!rows[0]) throw new HttpError(404, "PROFILE_NOT_FOUND", "User profile was not found");
    return profileOutput(rows[0]);
  }

  async updateCompletion(user, resourceId, completed) {
    const ref = resourceReference(resourceId);
    if (!ref) throw new HttpError(400, "VALIDATION_ERROR", "resourceId is invalid");
    const course = (await this.db.query("LET course = DOCUMENT(@id) FILTER course != null AND (@collection != 'app_resource_drafts' OR course.status == 'approved') RETURN course", { id: ref.id, collection: ref.collection }))[0];
    if (!course) throw new HttpError(404, "RESOURCE_NOT_FOUND", "Learning resource was not found");
    const rows = await this.db.query(
      "FOR p IN app_profiles FILTER p._key == @userKey UPDATE p WITH { completed_resource_keys: @completed ? UNIQUE(APPEND(p.completed_resource_keys, @resourceId)) : REMOVE_VALUE(p.completed_resource_keys, @resourceId), updated_at: @now } IN app_profiles RETURN NEW",
      { userKey: user._key, resourceId: ref.id, completed, now: nowIso() },
    );
    if (!rows[0]) throw new HttpError(404, "PROFILE_NOT_FOUND", "User profile was not found");
    return { completedResourceIds: profileOutput(rows[0]).completedResourceIds, note: "Completion records user progress only; it does not imply skill proficiency." };
  }

  async progress(user) {
    const profile = await this.getStoredProfile(user._key);
    return profileOutput(profile);
  }
}

function resourceReference(value) {
  const text = String(value || "").trim();
  const collection = text.startsWith("app_resource_drafts/") ? "app_resource_drafts" : "courses";
  const id = documentId(collection, text);
  if (!id) return null;
  return { collection, id };
}
