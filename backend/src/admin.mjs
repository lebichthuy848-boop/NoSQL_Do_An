import { HttpError } from "./errors.mjs";
import { documentId, documentKey, publicResource, publicSkill, publicProvider, retainedMappingDecisions } from "./domain.mjs";
import { newId } from "./security.mjs";

const nowIso = () => new Date().toISOString();

function requiredText(value, name, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new HttpError(400, "VALIDATION_ERROR", `${name} must contain 1–${max} characters`);
  }
  return value.trim();
}

function safeUrl(value, name) {
  const text = requiredText(value, name, 2000);
  let url;
  try { url = new URL(text); } catch { throw new HttpError(400, "VALIDATION_ERROR", `${name} must be an HTTP(S) URL`); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new HttpError(400, "VALIDATION_ERROR", `${name} must be an HTTP(S) URL without credentials`);
  }
  return url.toString();
}

export class AdminService {
  constructor({ db, auth, isTestMode = false }) {
    this.db = db;
    this.auth = auth;
    this.isTestMode = isTestMode;
  }

  async audit(actor, eventType, metadata) {
    await this.auth.audit(actor._key, eventType, metadata);
  }

  async updatePendingDraft(collection, key, patch, actor) {
    const rows = await this.db.query(
      "FOR doc IN " + collection + " FILTER doc._key == @key AND doc.status == 'pending' UPDATE doc WITH MERGE(@patch, { updated_by: @actor, updated_at: @now }) IN " + collection + " RETURN NEW",
      { key, patch, actor: actor._key, now: nowIso() },
    );
    if (!rows[0]) throw new HttpError(409, "ALREADY_REVIEWED", "The draft was reviewed before the operation could complete");
    return rows;
  }

  async deletePendingDraft(collection, key) {
    const rows = await this.db.query(
      "FOR doc IN " + collection + " FILTER doc._key == @key AND doc.status == 'pending' REMOVE doc IN " + collection + " RETURN OLD",
      { key },
    );
    if (!rows[0]) throw new HttpError(409, "ALREADY_REVIEWED", "The draft was reviewed before the operation could complete");
    return rows[0];
  }

  async assertMappingAvailable(resourceKey, skillKey, excludeKey = null) {
    const duplicates = await this.db.query(
      "FOR mapping IN app_mapping_drafts FILTER mapping.resource_key == @resourceKey AND mapping.skill_key == @skillKey AND (@excludeKey == null OR mapping._key != @excludeKey) LIMIT 1 RETURN mapping._key",
      { resourceKey, skillKey, excludeKey },
    );
    if (duplicates[0]) throw new HttpError(409, "DUPLICATE_MAPPING", "A mapping for this resource and skill already exists");
  }

  async writeMapping(query, vars) {
    try {
      return await this.db.query(query, vars);
    } catch (error) {
      if (error?.errorNum === 1210) throw new HttpError(409, "DUPLICATE_MAPPING", "A mapping for this resource and skill already exists");
      throw error;
    }
  }

  async users(query) {
    const page = Number(query.get("page") || 1);
    const pageSize = Number(query.get("pageSize") || 25);
    const search = String(query.get("search") || "").trim();
    const status = String(query.get("status") || "").trim();
    const role = String(query.get("role") || "").trim();
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || search.length > 100) {
      throw new HttpError(400, "VALIDATION_ERROR", "Invalid pagination or search parameters");
    }
    if (status && !["active", "locked", "disabled"].includes(status)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid user status");
    if (role && !["user", "admin"].includes(role)) throw new HttpError(400, "VALIDATION_ERROR", "Invalid role");
    const filterVars = { search, status, role };
    const pageVars = { ...filterVars, offset: (page - 1) * pageSize, limit: pageSize };
    const filter = "(@search == '' OR CONTAINS(LOWER(user.email), LOWER(@search)) OR CONTAINS(LOWER(user.display_name), LOWER(@search))) AND (@status == '' OR user.status == @status) AND (@role == '' OR user.role == @role)";
    const [totalRows, users] = await Promise.all([
      this.db.query(`RETURN LENGTH(FOR user IN app_users FILTER ${filter} RETURN 1)`, filterVars),
      this.db.query(`FOR user IN app_users FILTER ${filter} SORT user.created_at DESC LIMIT @offset, @limit RETURN UNSET(user, 'password_hash', 'password_salt', 'password_scheme')`, pageVars),
    ]);
    return { items: users, total: totalRows[0] || 0, page, pageSize };
  }

  async createUser(body, actor) {
    const user = await this.auth.createUser({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      role: body.role || "user",
      actor: actor._key,
      isTest: this.isTestMode,
    });
    return this.safeUser(user);
  }

  async user(userKey) {
    const user = await this.auth.findUserByKey(userKey);
    if (!user) throw new HttpError(404, "NOT_FOUND", "User was not found");
    const profile = (await this.db.query("FOR p IN app_profiles FILTER p._key == @key LIMIT 1 RETURN p", { key: userKey }))[0] || null;
    return { ...this.safeUser(user), profile: profile ? {
      careerGoalId: profile.career_key ? `careers/${profile.career_key}` : null,
      skillCount: (profile.skill_keys || []).length,
      completedResourceCount: (profile.completed_resource_keys || []).length,
    } : null };
  }

  async updateUser(userKey, body, actor) {
    const allowed = new Set(["role", "status", "displayName"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) throw new HttpError(400, "VALIDATION_ERROR", "Unknown user field");
    const user = await this.auth.adminUpdateUser(userKey, body, actor);
    return this.safeUser(user);
  }

  safeUser(user) {
    return { id: user._key, email: user.email, displayName: user.display_name, role: user.role, status: user.status, createdAt: user.created_at, updatedAt: user.updated_at };
  }

  async statistics() {
    const [users, careers, skills, courses, providers, eligible, mappings, allowedMappings, approvedProviders, approvedResources, availableMappings, pendingResources, pendingMappings, coverage] = await Promise.all([
      this.db.query("FOR user IN app_users COLLECT status = user.status WITH COUNT INTO count RETURN { status, count }"),
      this.db.query("FOR doc IN careers COLLECT WITH COUNT INTO count RETURN count"),
      this.db.query("FOR doc IN skills COLLECT WITH COUNT INTO count RETURN count"),
      this.db.query("FOR doc IN courses COLLECT WITH COUNT INTO count RETURN count"),
      this.db.query("FOR doc IN providers COLLECT WITH COUNT INTO count RETURN count"),
      this.db.query("RETURN LENGTH(FOR doc IN courses FILTER doc.recommendation_eligible == true RETURN 1)"),
      this.db.query("FOR doc IN teaches COLLECT WITH COUNT INTO count RETURN count"),
      this.db.query("RETURN LENGTH(FOR edge IN teaches FILTER edge.auto_recommendation_allowed == true RETURN 1)"),
      this.db.query("RETURN LENGTH(FOR doc IN app_provider_drafts FILTER doc.is_test != true AND doc.status == 'approved' RETURN 1)"),
      this.db.query("RETURN LENGTH(FOR doc IN app_resource_drafts FILTER doc.is_test != true AND doc.status == 'approved' AND doc.recommendation_eligible == true RETURN 1)"),
      this.db.query("RETURN LENGTH(FOR edge IN app_mapping_drafts FILTER edge.is_test != true AND edge.status == 'approved' AND edge.auto_recommendation_allowed == true LET resource = DOCUMENT(CONCAT('app_resource_drafts/', edge.resource_key)) FILTER resource != null AND resource.is_test != true AND resource.status == 'approved' AND resource.recommendation_eligible == true RETURN 1)"),
      this.db.query("RETURN LENGTH(FOR doc IN app_resource_drafts FILTER doc.status == 'pending' RETURN 1)"),
      this.db.query("RETURN LENGTH(FOR doc IN app_mapping_drafts FILTER doc.status == 'pending' RETURN 1)"),
      this.coverage(),
    ]);
    const officialProviders = providers[0] || 0;
    const approvedProviderDrafts = approvedProviders[0] || 0;
    const officialResources = courses[0] || 0;
    const approvedResourceDrafts = approvedResources[0] || 0;
    const officialMappings = mappings[0] || 0;
    const approvedMappingDrafts = availableMappings[0] || 0;
    return {
      users: { total: users.reduce((sum, row) => sum + row.count, 0), byStatus: users },
      careers: careers[0] || 0,
      skills: skills[0] || 0,
      resources: {
        total: officialResources,
        official: officialResources,
        approvedDrafts: approvedResourceDrafts,
        publicTotal: officialResources + approvedResourceDrafts,
        recommendationEligible: eligible[0] || 0,
        recommendationEligibleTotal: (eligible[0] || 0) + approvedResourceDrafts,
      },
      providers: officialProviders,
      providerCounts: {
        official: officialProviders,
        approvedDrafts: approvedProviderDrafts,
        publicTotal: officialProviders + approvedProviderDrafts,
      },
      mappings: {
        total: officialMappings,
        official: officialMappings,
        approvedDrafts: approvedMappingDrafts,
        availableTotal: officialMappings + approvedMappingDrafts,
        autoRecommendationAllowed: allowedMappings[0] || 0,
        autoRecommendationAllowedTotal: (allowedMappings[0] || 0) + approvedMappingDrafts,
      },
      pendingReview: { resources: pendingResources[0] || 0, mappings: pendingMappings[0] || 0 },
      coverage,
    };
  }

  async coverage() {
    const [careers, requirements, totalSkills, eligibleSkills, appEligibleSkills] = await Promise.all([
      this.db.query("FOR career IN careers SORT LOWER(career.name) RETURN career"),
      this.db.query("FOR edge IN requires_skill RETURN edge"),
      this.db.query("FOR skill IN skills COLLECT WITH COUNT INTO count RETURN count"),
      this.db.query("FOR edge IN teaches LET course = DOCUMENT(edge._from) FILTER course != null AND course.recommendation_eligible == true AND edge.auto_recommendation_allowed == true RETURN edge._to"),
      this.db.query("FOR edge IN app_mapping_drafts FILTER edge.is_test != true AND edge.status == 'approved' AND edge.auto_recommendation_allowed == true LET course = DOCUMENT(CONCAT('app_resource_drafts/', edge.resource_key)) FILTER course != null AND course.is_test != true AND course.status == 'approved' AND course.recommendation_eligible == true RETURN CONCAT('skills/', edge.skill_key)"),
    ]);
    const covered = new Set([...eligibleSkills, ...appEligibleSkills]);
    const requiredEssential = new Set();
    const requiredOptional = new Set();
    const byCareer = new Map(careers.map((career) => [career._id, { career: career.name, essential: new Set(), optional: new Set() }]));
    for (const edge of requirements) {
      const entry = byCareer.get(edge._from);
      if (edge.requirement_type === "essential") { requiredEssential.add(edge._to); entry?.essential.add(edge._to); }
      if (edge.requirement_type === "optional") { requiredOptional.add(edge._to); entry?.optional.add(edge._to); }
    }
    const count = (ids) => [...ids].filter((id) => covered.has(id)).length;
    return {
      overall: { covered: covered.size, total: totalSkills[0] || 0, ratio: totalSkills[0] ? covered.size / totalSkills[0] : 0 },
      essential: { covered: count(requiredEssential), total: requiredEssential.size, ratio: requiredEssential.size ? count(requiredEssential) / requiredEssential.size : 0 },
      optional: { covered: count(requiredOptional), total: requiredOptional.size, ratio: requiredOptional.size ? count(requiredOptional) / requiredOptional.size : 0 },
      byCareer: [...byCareer.values()].map((entry) => ({ career: entry.career, essential: { covered: count(entry.essential), total: entry.essential.size, ratio: entry.essential.size ? count(entry.essential) / entry.essential.size : 0 }, optional: { covered: count(entry.optional), total: entry.optional.size, ratio: entry.optional.size ? count(entry.optional) / entry.optional.size : 0 } })),
      basis: "Live ArangoDB records; a skill counts as covered only when it has a course and teaches edge passing both strict recommendation gates.",
    };
  }

  async databaseStatus() {
    try {
      const version = await this.db.version();
      const [collections, database] = await Promise.all([
        this.db.request("/_api/collection", { system: false }),
        this.db.request("/_api/database/current", { system: false }),
      ]);
      const rows = collections.result || [];
      const collectionGroups = { core: [], application: [], system: [] };
      for (const collection of rows) {
        const name = collection.name;
        if (typeof name !== "string") continue;
        if (collection.isSystem === true || name.startsWith("_")) collectionGroups.system.push(name);
        else if (name.startsWith("app_")) collectionGroups.application.push(name);
        else collectionGroups.core.push(name);
      }
      for (const names of Object.values(collectionGroups)) names.sort((a, b) => a.localeCompare(b));
      return {
        status: "available",
        version: version.version,
        database: database.result?.name || null,
        collectionCount: rows.length,
        collectionGroups: Object.fromEntries(Object.entries(collectionGroups).map(([group, names]) => [group, { count: names.length, names }])),
        checkedAt: nowIso(),
      };
    } catch {
      throw new HttpError(503, "DATABASE_UNAVAILABLE", "Database status could not be read");
    }
  }

  async skillPrerequisites() {
    return this.db.query(
      "FOR edge IN skill_prerequisite FILTER edge.approved_for_learning_path == true AND edge.is_demo != true AND edge._from != edge._to AND STARTS_WITH(edge._from, 'skills/') AND STARTS_WITH(edge._to, 'skills/') AND edge.source_url != null AND edge.source_url != '' AND (STARTS_WITH(LOWER(edge.source_url), 'https://') OR STARTS_WITH(LOWER(edge.source_url), 'http://')) LET dependent = DOCUMENT(edge._from) LET foundation = DOCUMENT(edge._to) FILTER dependent != null AND foundation != null SORT LOWER(dependent.name), LOWER(foundation.name) RETURN { key: edge._key, dependentSkillId: edge._from, dependentSkillName: dependent.name, foundationSkillId: edge._to, foundationSkillName: foundation.name, direction: 'dependent → foundation', status: 'approved', source: edge.source || null, sourceReviewStatus: edge.source_review_status || null, evidenceScope: edge.evidence_scope || null, sourceUrl: edge.source_url }",
    );
  }

  async resources(query) {
    const page = Number(query.get("page") || 1);
    const pageSize = Number(query.get("pageSize") || 25);
    const search = String(query.get("search") || "").trim();
    const status = String(query.get("status") || "").trim();
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || search.length > 100) throw new HttpError(400, "VALIDATION_ERROR", "Invalid pagination or search parameters");
    const filterVars = { search, status };
    const pageVars = { ...filterVars, offset: (page - 1) * pageSize, limit: pageSize };
    const filter = "(@search == '' OR CONTAINS(LOWER(doc.title), LOWER(@search)) OR CONTAINS(LOWER(doc.provider_name), LOWER(@search))) AND (@status == '' OR doc.status == @status)";
    const [totals, items] = await Promise.all([
      this.db.query(`RETURN LENGTH(FOR doc IN app_resource_drafts FILTER ${filter} RETURN 1)`, filterVars),
      this.db.query(`FOR doc IN app_resource_drafts FILTER ${filter} SORT doc.created_at DESC LIMIT @offset, @limit RETURN doc`, pageVars),
    ]);
    return { items: items.map(this.resourceDraftOutput), total: totals[0] || 0, page, pageSize };
  }

  resourceDraftOutput(doc) {
    if (!doc) return null;
    return {
      key: doc._key, id: `app_resource_drafts/${doc._key}`, title: doc.title,
      canonicalUrl: doc.canonical_url, providerName: doc.provider_name,
      resourceType: doc.resource_type, language: doc.language,
      recommendationEligible: doc.recommendation_eligible === true, status: doc.status,
      isTest: doc.is_test === true,
      createdBy: doc.created_by, createdAt: doc.created_at, updatedBy: doc.updated_by,
      updatedAt: doc.updated_at, approvalEvidence: doc.approval_evidence || null,
    };
  }

  async resourceDraft(key) {
    const doc = (await this.db.query("FOR doc IN app_resource_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key }))[0];
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Resource draft was not found");
    return this.resourceDraftOutput(doc);
  }

  async createResourceDraft(body, actor) {
    const providerName = requiredText(body.providerName, "providerName", 200);
    const providers = await this.db.query("LET matches = UNION((FOR doc IN providers FILTER LOWER(doc.name) == LOWER(@name) RETURN doc), (FOR doc IN app_provider_drafts FILTER LOWER(doc.name) == LOWER(@name) AND doc.status == 'approved' RETURN doc)) RETURN LENGTH(matches)", { name: providerName });
    if ((providers[0] || 0) === 0) throw new HttpError(400, "PROVIDER_REQUIRED", "providerName must match an existing official provider or an approved provider draft");
    const doc = {
      _key: newId(),
      title: requiredText(body.title, "title", 300),
      canonical_url: safeUrl(body.canonicalUrl, "canonicalUrl"),
      provider_name: providerName,
      resource_type: requiredText(body.resourceType, "resourceType", 80),
      language: requiredText(body.language || "unknown", "language", 20),
      recommendation_eligible: false,
      status: "pending",
      ...(this.isTestMode ? { is_test: true, test_scenario: "backend_http_integration" } : {}),
      approval_evidence: null,
      created_by: actor._key,
      created_at: nowIso(),
      updated_by: actor._key,
      updated_at: nowIso(),
    };
    await this.db.query("INSERT @doc INTO app_resource_drafts RETURN NEW", { doc });
    await this.audit(actor, "resource_draft.created", { resourceKey: doc._key });
    return this.resourceDraftOutput(doc);
  }

  async updateResourceDraft(key, body, actor) {
    const doc = (await this.db.query("FOR doc IN app_resource_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key }))[0];
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Resource draft was not found");
    if (doc.status !== "pending") throw new HttpError(409, "ALREADY_REVIEWED", "Reviewed resource drafts cannot be edited");
    const patch = {};
    if ("title" in body) patch.title = requiredText(body.title, "title", 300);
    if ("canonicalUrl" in body) patch.canonical_url = safeUrl(body.canonicalUrl, "canonicalUrl");
    if ("providerName" in body) {
      patch.provider_name = requiredText(body.providerName, "providerName", 200);
      const providers = await this.db.query("LET matches = UNION((FOR item IN providers FILTER LOWER(item.name) == LOWER(@name) RETURN item), (FOR item IN app_provider_drafts FILTER LOWER(item.name) == LOWER(@name) AND item.status == 'approved' RETURN item)) RETURN LENGTH(matches)", { name: patch.provider_name });
      if ((providers[0] || 0) === 0) throw new HttpError(400, "PROVIDER_REQUIRED", "providerName must match an existing official provider or an approved provider draft");
    }
    if ("resourceType" in body) patch.resource_type = requiredText(body.resourceType, "resourceType", 80);
    if ("language" in body) patch.language = requiredText(body.language, "language", 20);
    if (!Object.keys(patch).length) throw new HttpError(400, "VALIDATION_ERROR", "No editable resource fields were supplied");
    const rows = await this.updatePendingDraft("app_resource_drafts", key, patch, actor);
    await this.audit(actor, "resource_draft.updated", { resourceKey: key });
    return this.resourceDraftOutput(rows[0]);
  }

  async deleteResourceDraft(key, actor) {
    const rows = await this.db.query("FOR doc IN app_resource_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key });
    if (!rows[0]) throw new HttpError(404, "NOT_FOUND", "Resource draft was not found");
    if (rows[0].status !== "pending") throw new HttpError(409, "ALREADY_REVIEWED", "Reviewed resource drafts cannot be deleted");
    const references = await this.db.query("RETURN LENGTH(FOR mapping IN app_mapping_drafts FILTER mapping.resource_key == @key RETURN 1)", { key });
    if ((references[0] || 0) > 0) throw new HttpError(409, "RESOURCE_HAS_MAPPINGS", "Remove pending mappings before deleting this resource draft");
    await this.deletePendingDraft("app_resource_drafts", key);
    await this.audit(actor, "resource_draft.deleted", { resourceKey: key });
    return { deleted: true };
  }

  async reviewResourceDraft(key, body, actor) {
    const doc = (await this.db.query("FOR doc IN app_resource_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key }))[0];
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Resource draft was not found");
    if (doc.status !== "pending") throw new HttpError(409, "ALREADY_REVIEWED", "Resource draft was already reviewed");
    const decision = body.decision;
    if (!["approve", "reject"].includes(decision)) throw new HttpError(400, "VALIDATION_ERROR", "decision must be approve or reject");
    const evidenceUrl = safeUrl(body.evidenceUrl, "evidenceUrl");
    const summary = requiredText(body.sourceSummary, "sourceSummary", 2000);
    const evidence = { evidenceUrl, summary, decision, reviewedBy: actor._key, reviewedAt: nowIso() };
    const updates = decision === "approve"
      ? { recommendation_eligible: true, status: "approved", approval_evidence: evidence }
      : { recommendation_eligible: false, status: "rejected", approval_evidence: evidence };
    const rows = await this.updatePendingDraft("app_resource_drafts", key, updates, actor);
    await this.audit(actor, `resource_draft.${decision}d`, { resourceKey: key, evidenceUrl });
    return this.resourceDraftOutput(rows[0]);
  }

  async providers(query) {
    const page = Number(query.get("page") || 1);
    const pageSize = Number(query.get("pageSize") || 25);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new HttpError(400, "VALIDATION_ERROR", "Invalid pagination");
    const vars = { offset: (page - 1) * pageSize, limit: pageSize };
    const [total, items] = await Promise.all([
      this.db.query("RETURN LENGTH(FOR doc IN app_provider_drafts RETURN 1)"),
      this.db.query("FOR doc IN app_provider_drafts SORT doc.created_at DESC LIMIT @offset, @limit RETURN doc", vars),
    ]);
    return { items: items.map((doc) => this.providerDraftOutput(doc)), total: total[0] || 0, page, pageSize };
  }

  async provider(key) {
    const doc = (await this.db.query("FOR doc IN app_provider_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key }))[0];
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Provider draft was not found");
    return this.providerDraftOutput(doc);
  }

  providerDraftOutput(doc) {
    if (!doc) return null;
    return { key: doc._key, id: `app_provider_drafts/${doc._key}`, name: doc.name, officialWebsite: doc.official_website, status: doc.status, isTest: doc.is_test === true, createdBy: doc.created_by, createdAt: doc.created_at, updatedBy: doc.updated_by, updatedAt: doc.updated_at, approvalEvidence: doc.approval_evidence || null };
  }

  async createProvider(body, actor) {
    const name = requiredText(body.name, "name", 200);
    const duplicates = await this.db.query("LET matches = UNION((FOR doc IN providers FILTER LOWER(doc.name) == LOWER(@name) RETURN doc), (FOR doc IN app_provider_drafts FILTER LOWER(doc.name) == LOWER(@name) RETURN doc)) RETURN LENGTH(matches)", { name });
    if ((duplicates[0] || 0) > 0) throw new HttpError(409, "PROVIDER_EXISTS", "A provider with this name already exists");
    const doc = { _key: newId(), name, name_normalized: name.toLowerCase(), official_website: safeUrl(body.officialWebsite, "officialWebsite"), status: "pending", ...(this.isTestMode ? { is_test: true, test_scenario: "backend_http_integration" } : {}), created_by: actor._key, created_at: nowIso(), updated_by: actor._key, updated_at: nowIso() };
    await this.db.query("INSERT @doc INTO app_provider_drafts RETURN NEW", { doc });
    await this.audit(actor, "provider_draft.created", { providerKey: doc._key });
    return this.providerDraftOutput(doc);
  }

  async updateProvider(key, body, actor) {
    const doc = (await this.db.query("FOR doc IN app_provider_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key }))[0];
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Provider draft was not found");
    if (doc.status !== "pending") throw new HttpError(409, "ALREADY_REVIEWED", "Reviewed provider drafts cannot be edited");
    const patch = {};
    if ("name" in body) {
      patch.name = requiredText(body.name, "name", 200);
      patch.name_normalized = patch.name.toLowerCase();
      const duplicates = await this.db.query("LET matches = UNION((FOR item IN providers FILTER LOWER(item.name) == LOWER(@name) RETURN item), (FOR item IN app_provider_drafts FILTER item._key != @key AND LOWER(item.name) == LOWER(@name) RETURN item)) RETURN LENGTH(matches)", { name: patch.name, key });
      if ((duplicates[0] || 0) > 0) throw new HttpError(409, "PROVIDER_EXISTS", "A provider with this name already exists");
    }
    if ("officialWebsite" in body) patch.official_website = safeUrl(body.officialWebsite, "officialWebsite");
    if (!Object.keys(patch).length) throw new HttpError(400, "VALIDATION_ERROR", "No editable provider fields were supplied");
    const rows = await this.updatePendingDraft("app_provider_drafts", key, patch, actor);
    await this.audit(actor, "provider_draft.updated", { providerKey: key });
    return this.providerDraftOutput(rows[0]);
  }

  async deleteProvider(key, actor) {
    const doc = (await this.db.query("FOR doc IN app_provider_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key }))[0];
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Provider draft was not found");
    if (doc.status !== "pending") throw new HttpError(409, "ALREADY_REVIEWED", "Reviewed provider drafts cannot be deleted");
    const rows = await this.db.query("RETURN LENGTH(FOR resource IN app_resource_drafts FILTER resource.provider_draft_key == @key RETURN 1)", { key });
    if ((rows[0] || 0) > 0) throw new HttpError(409, "PROVIDER_HAS_RESOURCES", "Remove resource drafts before deleting this provider");
    await this.deletePendingDraft("app_provider_drafts", key);
    await this.audit(actor, "provider_draft.deleted", { providerKey: key });
    return { deleted: true };
  }

  async reviewProvider(key, body, actor) {
    const doc = (await this.db.query("FOR doc IN app_provider_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key }))[0];
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Provider draft was not found");
    if (doc.status !== "pending") throw new HttpError(409, "ALREADY_REVIEWED", "Provider draft was already reviewed");
    if (!["approve", "reject"].includes(body.decision)) throw new HttpError(400, "VALIDATION_ERROR", "decision must be approve or reject");
    const evidenceUrl = safeUrl(body.evidenceUrl, "evidenceUrl");
    const summary = requiredText(body.sourceSummary, "sourceSummary", 2000);
    const evidence = { evidenceUrl, summary, decision: body.decision, reviewedBy: actor._key, reviewedAt: nowIso() };
    const status = body.decision === "approve" ? "approved" : "rejected";
    const rows = await this.updatePendingDraft("app_provider_drafts", key, { status, approval_evidence: evidence }, actor);
    await this.audit(actor, `provider_draft.${body.decision}d`, { providerKey: key, evidenceUrl });
    return this.providerDraftOutput(rows[0]);
  }

  async createMapping(body, actor) {
    const resourceKey = documentKey("app_resource_drafts", body.resourceId);
    const skillId = documentId("skills", body.skillId);
    if (!resourceKey || !skillId) throw new HttpError(400, "VALIDATION_ERROR", "resourceId or skillId is invalid");
    const [resource, skill] = await Promise.all([
      this.db.query("FOR doc IN app_resource_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key: resourceKey }),
      this.db.query("LET doc = DOCUMENT(@id) FILTER doc != null RETURN doc", { id: skillId }),
    ]);
    if (!resource[0]) throw new HttpError(404, "RESOURCE_NOT_FOUND", "Resource draft was not found");
    if (!skill[0]) throw new HttpError(404, "SKILL_NOT_FOUND", "Skill was not found");
    await this.assertMappingAvailable(resourceKey, skill[0]._key);
    const doc = { _key: newId(), resource_key: resourceKey, skill_key: skill[0]._key, auto_recommendation_allowed: false, status: "pending", evidence_url: null, evidence_scope: null, mapping_quality_decision: null, review_note: null, ...(this.isTestMode ? { is_test: true, test_scenario: "backend_http_integration" } : {}), created_by: actor._key, created_at: nowIso(), updated_by: actor._key, updated_at: nowIso() };
    await this.writeMapping("INSERT @doc INTO app_mapping_drafts RETURN NEW", { doc });
    await this.audit(actor, "mapping_draft.created", { mappingKey: doc._key, resourceKey, skillId: skill[0]._id });
    return { key: doc._key, resourceId: `app_resource_drafts/${resourceKey}`, skillId: skill[0]._id, autoRecommendationAllowed: false, status: "pending" };
  }

  async mappings(query) {
    const page = Number(query.get("page") || 1);
    const pageSize = Number(query.get("pageSize") || 25);
    const status = String(query.get("status") || "").trim();
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || (status && !["pending", "approved", "rejected"].includes(status))) throw new HttpError(400, "VALIDATION_ERROR", "Invalid pagination or status");
    const filterVars = { status };
    const pageVars = { ...filterVars, offset: (page - 1) * pageSize, limit: pageSize };
    const filter = "@status == '' OR doc.status == @status";
    const [total, items] = await Promise.all([
      this.db.query(`RETURN LENGTH(FOR doc IN app_mapping_drafts FILTER ${filter} RETURN 1)`, filterVars),
      this.db.query(`FOR doc IN app_mapping_drafts FILTER ${filter} SORT doc.created_at DESC LIMIT @offset, @limit RETURN doc`, pageVars),
    ]);
    return { items: items.map((doc) => ({ key: doc._key, id: `app_mapping_drafts/${doc._key}`, resourceId: `app_resource_drafts/${doc.resource_key}`, skillId: `skills/${doc.skill_key}`, autoRecommendationAllowed: doc.auto_recommendation_allowed === true, status: doc.status, evidenceUrl: doc.evidence_url, evidenceScope: doc.evidence_scope, mappingQualityDecision: doc.mapping_quality_decision, reviewNote: doc.review_note, reviewedBy: doc.reviewed_by || null, reviewedAt: doc.reviewed_at || null, isTest: doc.is_test === true })), total: total[0] || 0, page, pageSize };
  }

  async mapping(key) {
    const doc = (await this.db.query("FOR doc IN app_mapping_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key }))[0];
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Mapping draft was not found");
    return this.mappingDraftOutput(doc);
  }

  mappingDraftOutput(doc) {
    return { key: doc._key, id: `app_mapping_drafts/${doc._key}`, resourceId: `app_resource_drafts/${doc.resource_key}`, skillId: `skills/${doc.skill_key}`, autoRecommendationAllowed: doc.auto_recommendation_allowed === true, status: doc.status, isTest: doc.is_test === true, evidenceUrl: doc.evidence_url || null, evidenceScope: doc.evidence_scope || null, mappingQualityDecision: doc.mapping_quality_decision || null, reviewNote: doc.review_note || null, reviewedBy: doc.reviewed_by || null, reviewedAt: doc.reviewed_at || null };
  }

  async updateMapping(key, body, actor) {
    const doc = (await this.db.query("FOR doc IN app_mapping_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key }))[0];
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Mapping draft was not found");
    if (doc.status !== "pending") throw new HttpError(409, "ALREADY_REVIEWED", "Reviewed mapping drafts cannot be edited");
    const patch = {};
    if ("resourceId" in body) {
      const resourceKey = documentKey("app_resource_drafts", body.resourceId);
      if (!resourceKey) throw new HttpError(400, "VALIDATION_ERROR", "resourceId is invalid");
      const resource = (await this.db.query("FOR item IN app_resource_drafts FILTER item._key == @key LIMIT 1 RETURN item", { key: resourceKey }))[0];
      if (!resource) throw new HttpError(404, "RESOURCE_NOT_FOUND", "Resource draft was not found");
      patch.resource_key = resourceKey;
    }
    if ("skillId" in body) {
      const skillId = documentId("skills", body.skillId);
      if (!skillId) throw new HttpError(400, "VALIDATION_ERROR", "skillId is invalid");
      const skill = (await this.db.query("LET item = DOCUMENT(@id) FILTER item != null RETURN item", { id: skillId }))[0];
      if (!skill) throw new HttpError(404, "SKILL_NOT_FOUND", "Skill was not found");
      patch.skill_key = skill._key;
    }
    if (!Object.keys(patch).length) throw new HttpError(400, "VALIDATION_ERROR", "No editable mapping fields were supplied");
    const resourceKey = patch.resource_key ?? doc.resource_key;
    const skillKey = patch.skill_key ?? doc.skill_key;
    await this.assertMappingAvailable(resourceKey, skillKey, key);
    const rows = await this.writeMapping("FOR mapping IN app_mapping_drafts FILTER mapping._key == @key AND mapping.status == 'pending' UPDATE mapping WITH MERGE(@patch, { updated_by: @actor, updated_at: @now }) IN app_mapping_drafts RETURN NEW", { key, patch, actor: actor._key, now: nowIso() });
    if (!rows[0]) throw new HttpError(409, "ALREADY_REVIEWED", "Mapping draft was reviewed before the update could complete");
    await this.audit(actor, "mapping_draft.updated", { mappingKey: key });
    return this.mappingDraftOutput(rows[0]);
  }

  async deleteMapping(key, actor) {
    const doc = (await this.db.query("FOR item IN app_mapping_drafts FILTER item._key == @key LIMIT 1 RETURN item", { key }))[0];
    if (!doc) throw new HttpError(404, "NOT_FOUND", "Mapping draft was not found");
    if (doc.status !== "pending") throw new HttpError(409, "ALREADY_REVIEWED", "Reviewed mapping drafts cannot be deleted");
    await this.deletePendingDraft("app_mapping_drafts", key);
    await this.audit(actor, "mapping_draft.deleted", { mappingKey: key });
    return { deleted: true };
  }

  async reviewMapping(key, body, actor) {
    const mapping = (await this.db.query("FOR doc IN app_mapping_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key }))[0];
    if (!mapping) throw new HttpError(404, "NOT_FOUND", "Mapping draft was not found");
    if (mapping.status !== "pending") throw new HttpError(409, "ALREADY_REVIEWED", "Mapping draft was already reviewed");
    const decision = body.decision;
    if (!["approve", "reject"].includes(decision)) throw new HttpError(400, "VALIDATION_ERROR", "decision must be approve or reject");
    const resource = (await this.db.query("FOR doc IN app_resource_drafts FILTER doc._key == @key LIMIT 1 RETURN doc", { key: mapping.resource_key }))[0];
    if (!resource) throw new HttpError(404, "RESOURCE_NOT_FOUND", "Resource draft was not found");
    const evidenceUrl = safeUrl(body.evidenceUrl, "evidenceUrl");
    const evidenceScope = body.evidenceScope;
    if (!new Set(["direct_topic", "partial"]).has(evidenceScope)) throw new HttpError(400, "VALIDATION_ERROR", "evidenceScope must be direct_topic or partial");
    const summary = requiredText(body.sourceSummary, "sourceSummary", 2000);
    let mappingQualityDecision = body.mappingQualityDecision || "retain_with_scope_after_review";
    if (decision === "approve" && !retainedMappingDecisions.has(mappingQualityDecision)) throw new HttpError(400, "VALIDATION_ERROR", "mappingQualityDecision is not an approved retained decision");
    if (decision === "approve" && resource.recommendation_eligible !== true) throw new HttpError(409, "COURSE_GATE_REQUIRED", "Approve the resource eligibility gate before approving a mapping");
    const approved = decision === "approve";
    const updates = {
      auto_recommendation_allowed: approved,
      status: approved ? "approved" : "rejected",
      evidence_url: evidenceUrl,
      evidence_scope: evidenceScope,
      mapping_quality_decision: approved ? mappingQualityDecision : "reject",
      review_note: summary,
      reviewed_by: actor._key,
      reviewed_at: nowIso(),
    };
    const rows = await this.updatePendingDraft("app_mapping_drafts", key, updates, actor);
    await this.audit(actor, `mapping_draft.${decision}d`, { mappingKey: key, evidenceUrl, evidenceScope, mappingQualityDecision: updates.mapping_quality_decision });
    return { key, resourceId: `app_resource_drafts/${mapping.resource_key}`, skillId: `skills/${mapping.skill_key}`, autoRecommendationAllowed: approved, status: rows[0].status, evidenceUrl, evidenceScope, mappingQualityDecision: updates.mapping_quality_decision, reviewedBy: actor._key, reviewedAt: updates.reviewed_at };
  }

  async auditLog(query) {
    const page = Number(query.get("page") || 1);
    const pageSize = Number(query.get("pageSize") || 50);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new HttpError(400, "VALIDATION_ERROR", "Invalid pagination");
    const vars = { offset: (page - 1) * pageSize, limit: pageSize };
    const [total, items] = await Promise.all([
      this.db.query("RETURN LENGTH(FOR doc IN app_audit_log RETURN 1)"),
      this.db.query("FOR doc IN app_audit_log SORT doc.created_at DESC LIMIT @offset, @limit RETURN doc", vars),
    ]);
    return { items, total: total[0] || 0, page, pageSize };
  }
}
