import { HttpError } from "./errors.mjs";
import { documentId, publicCareer, publicProvider, publicResource, publicSkill } from "./domain.mjs";

const GRAPH_EDGE_TYPES = Object.freeze([
  "requires_skill", "teaches", "offered_by", "esco_skill_group", "esco_skill_broader",
  "esco_group_broader", "esco_skill_knowledge", "skill_prerequisite", "course_entry_skill",
  "course_prerequisite_evidence", "prerequisite", "course_offers",
]);
const NODE_TYPES = Object.freeze({
  careers: "career", skills: "skill", courses: "course", providers: "provider",
  skill_groups: "skillGroup", course_prerequisite_evidence: "evidence", data_sources: "dataSource",
});
const PUBLIC_NODE_TYPES = new Set(Object.values(NODE_TYPES));

function pagination(query) {
  const page = Number(query.get("page") || 1);
  const pageSize = Number(query.get("pageSize") || 50);
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new HttpError(400, "VALIDATION_ERROR", "page must be positive and pageSize must be 1–100");
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function searchText(value) {
  const text = String(value || "").trim();
  if (text.length > 100) throw new HttpError(400, "VALIDATION_ERROR", "Search text must not exceed 100 characters");
  return text;
}

function resourceDocumentId(value) {
  const text = String(value || "").trim();
  if (text.startsWith("app_resource_drafts/")) return documentId("app_resource_drafts", text);
  return documentId("courses", text);
}

export class CatalogService {
  constructor(db) { this.db = db; }

  async list(query, collection, filterQuery, filterVars, mapper) {
    const { page, pageSize, offset } = pagination(query);
    const search = searchText(query.get("search") || query.get("q"));
    const where = filterQuery.replaceAll("@search", "@search");
    const filterBindVars = { ...filterVars, search };
    const pageBindVars = { ...filterBindVars, offset, limit: pageSize };
    const countQuery = `RETURN LENGTH(FOR doc IN ${collection} FILTER ${where} RETURN 1)`;
    const rowsQuery = `FOR doc IN ${collection} FILTER ${where} SORT LOWER(doc.name || doc.title || '') LIMIT @offset, @limit RETURN doc`;
    const [totalRows, rows] = await Promise.all([
      this.db.query(countQuery, filterBindVars),
      this.db.query(rowsQuery, pageBindVars),
    ]);
    return { items: rows.map(mapper), total: totalRows[0] || 0, page, pageSize };
  }

  async release() {
    const [careerCounts, skillCounts, courseCounts, edgeCounts, version] = await Promise.all([
      this.db.query("FOR doc IN careers COLLECT WITH COUNT INTO count RETURN count"),
      this.db.query("FOR doc IN skills COLLECT WITH COUNT INTO count RETURN count"),
      this.db.query("FOR doc IN courses COLLECT WITH COUNT INTO count RETURN count"),
      this.db.query("FOR edge IN requires_skill COLLECT WITH COUNT INTO count RETURN count"),
      this.db.version(),
    ]);
    const careers = careerCounts[0] || 0;
    const skills = skillCounts[0] || 0;
    const courses = courseCounts[0] || 0;
    return { release: { version: "v3.66-coverage50-batch2", sprint: null, records: careers + skills + courses }, arangoVersion: version.version, database: "skill_graph_v366_acceptance", careers, skills, courses, requiresSkillRelations: edgeCounts[0] || 0, source: "ArangoDB operational clone; counts read live" };
  }

  async careers(query) {
    const { page, pageSize, offset } = pagination(query);
    const search = searchText(query.get("search") || query.get("q"));
    const group = searchText(query.get("group"));
    const filterVars = { search, group };
    const pageVars = { ...filterVars, offset, limit: pageSize };
    const filter = "(@search == '' OR CONTAINS(LOWER(doc.name), LOWER(@search)) OR CONTAINS(LOWER(doc.description), LOWER(@search))) AND (@group == '' OR LOWER(doc.career_group) == LOWER(@group))";
    const [totalRows, rows] = await Promise.all([
      this.db.query(`RETURN LENGTH(FOR doc IN careers FILTER ${filter} RETURN 1)`, filterVars),
      this.db.query(`FOR doc IN careers FILTER ${filter} SORT LOWER(doc.name) LIMIT @offset, @limit RETURN doc`, pageVars),
    ]);
    return { items: rows.map(publicCareer), total: totalRows[0] || 0, page, pageSize };
  }

  async career(careerKey) {
    const id = documentId("careers", careerKey);
    const career = id ? (await this.db.query("LET doc = DOCUMENT(@id) FILTER doc != null RETURN doc", { id }))[0] : null;
    if (!career) throw new HttpError(404, "CAREER_NOT_FOUND", "Career was not found");
    const requirements = await this.db.query("FOR edge IN requires_skill FILTER edge._from == @id LET skill = DOCUMENT(edge._to) FILTER skill != null RETURN { edge, skill }", { id });
    const essential = new Set(requirements.filter((row) => row.edge.requirement_type === "essential").map((row) => row.edge._to));
    const optional = new Set(requirements.filter((row) => row.edge.requirement_type === "optional").map((row) => row.edge._to));
    return { ...publicCareer(career), skillCounts: { essential: essential.size, optional: optional.size, total: new Set([...essential, ...optional]).size } };
  }

  async careerSkills(careerKey) {
    const id = documentId("careers", careerKey);
    if (!id) throw new HttpError(400, "VALIDATION_ERROR", "Career id is invalid");
    const career = (await this.db.query("LET doc = DOCUMENT(@id) FILTER doc != null RETURN doc", { id }))[0];
    if (!career) throw new HttpError(404, "CAREER_NOT_FOUND", "Career was not found");
    const rows = await this.db.query(
      "FOR edge IN requires_skill FILTER edge._from == @id LET skill = DOCUMENT(edge._to) FILTER skill != null LET resourceCount = LENGTH(FOR teaches IN teaches FILTER teaches._to == edge._to RETURN 1) RETURN { edge, skill, resourceCount }",
      { id },
    );
    return rows.map(({ edge, skill, resourceCount }) => ({
      key: edge._key, id: edge._id, from: edge._from, to: edge._to, raw: edge,
      requirementType: edge.requirement_type, requiredLevel: null, skill: publicSkill(skill), resourceCount,
    }));
  }

  async skills(query) {
    const { page, pageSize, offset } = pagination(query);
    const search = searchText(query.get("search") || query.get("q"));
    const type = searchText(query.get("type"));
    const filterVars = { search, type };
    const pageVars = { ...filterVars, offset, limit: pageSize };
    const filter = "(@search == '' OR CONTAINS(LOWER(doc.name), LOWER(@search)) OR CONTAINS(LOWER(doc.description), LOWER(@search))) AND (@type == '' OR doc.skill_type == @type)";
    const [totalRows, rows] = await Promise.all([
      this.db.query(`RETURN LENGTH(FOR doc IN skills FILTER ${filter} RETURN 1)`, filterVars),
      this.db.query(`FOR doc IN skills FILTER ${filter} SORT LOWER(doc.name) LIMIT @offset, @limit RETURN doc`, pageVars),
    ]);
    return { items: rows.map(publicSkill), total: totalRows[0] || 0, page, pageSize };
  }

  async skill(skillKey) {
    const id = documentId("skills", skillKey);
    const skill = id ? (await this.db.query("LET doc = DOCUMENT(@id) FILTER doc != null RETURN doc", { id }))[0] : null;
    if (!skill) throw new HttpError(404, "SKILL_NOT_FOUND", "Skill was not found");
    const [careers, linkedResources, prerequisites] = await Promise.all([
      this.db.query("FOR edge IN requires_skill FILTER edge._to == @id LET career = DOCUMENT(edge._from) FILTER career != null RETURN { career, requirementType: edge.requirement_type }", { id }),
      this.db.query("FOR edge IN teaches FILTER edge._to == @id RETURN edge", { id }),
      this.db.query("FOR edge IN skill_prerequisite FILTER edge._from == @id AND edge.approved_for_learning_path == true AND edge.is_demo != true AND edge.source_url != null AND edge.source_url != '' LET skill = DOCUMENT(edge._to) FILTER skill != null RETURN { edge, skill }", { id }),
    ]);
    return { ...publicSkill(skill), careers: careers.map((row) => ({ career: publicCareer(row.career), requirementType: row.requirementType })), prerequisites: prerequisites.map((row) => ({ skill: publicSkill(row.skill), evidenceUrl: row.edge.source_url || null })), linkedResourceCount: linkedResources.length };
  }

  async skillResources(skillKey, query) {
    const id = documentId("skills", skillKey);
    if (!id) throw new HttpError(400, "VALIDATION_ERROR", "Skill id is invalid");
    const skill = (await this.db.query("LET doc = DOCUMENT(@id) FILTER doc != null RETURN doc", { id }))[0];
    if (!skill) throw new HttpError(404, "SKILL_NOT_FOUND", "Skill was not found");
    const { page, pageSize, offset } = pagination(query);
    const skillKeyValue = id.slice("skills/".length);
    const rows = await this.db.query(
      "LET combined = UNION((FOR edge IN teaches FILTER edge._to == @id LET resource = DOCUMENT(edge._from) FILTER resource != null RETURN { edge, resource }), (FOR edge IN app_mapping_drafts FILTER edge.skill_key == @skillKey AND edge.is_test != true AND edge.status == 'approved' AND edge.auto_recommendation_allowed == true LET resource = DOCUMENT(CONCAT('app_resource_drafts/', edge.resource_key)) FILTER resource != null AND resource.is_test != true AND resource.status == 'approved' AND resource.recommendation_eligible == true RETURN { edge, resource })) FOR row IN combined SORT LOWER(row.resource.title) LIMIT @offset, @limit RETURN { edge: row.edge, resource: row.resource }",
      { id, skillKey: skillKeyValue, offset, limit: pageSize },
    );
    const count = await this.db.query("LET combined = UNION((FOR edge IN teaches FILTER edge._to == @id RETURN edge), (FOR edge IN app_mapping_drafts FILTER edge.skill_key == @skillKey AND edge.is_test != true AND edge.status == 'approved' AND edge.auto_recommendation_allowed == true LET resource = DOCUMENT(CONCAT('app_resource_drafts/', edge.resource_key)) FILTER resource != null AND resource.is_test != true AND resource.status == 'approved' AND resource.recommendation_eligible == true RETURN edge)) RETURN LENGTH(combined)", { id, skillKey: skillKeyValue });
    return {
      items: rows.map(({ edge, resource }) => ({ resource: publicResource(resource), edge: { id: edge._id, evidenceScope: edge.evidence_scope || null, evidenceUrl: edge.reviewed_page_url || edge.evidence_url || null, mappingNote: edge.reviewed_page_summary || edge.review_note || null, recommendationEligible: edge.auto_recommendation_allowed === true && resource.recommendation_eligible === true } })),
      total: count[0] || 0,
      page,
      pageSize,
    };
  }

  async resources(query) {
    const { page, pageSize, offset } = pagination(query);
    const search = searchText(query.get("search") || query.get("q"));
    const type = searchText(query.get("type"));
    const provider = searchText(query.get("provider"));
    const filterVars = { search, type, provider };
    const pageVars = { ...filterVars, offset, limit: pageSize };
    const filter = "(@search == '' OR CONTAINS(LOWER(doc.title), LOWER(@search)) OR CONTAINS(LOWER(doc.provider_name), LOWER(@search))) AND (@type == '' OR doc.resource_type == @type) AND (@provider == '' OR LOWER(doc.provider_name) == LOWER(@provider))";
    const [totalRows, rows] = await Promise.all([
      this.db.query(`LET combined = UNION((FOR doc IN courses FILTER ${filter} RETURN doc), (FOR doc IN app_resource_drafts FILTER doc.is_test != true AND doc.status == 'approved' AND doc.recommendation_eligible == true AND (@search == '' OR CONTAINS(LOWER(doc.title), LOWER(@search)) OR CONTAINS(LOWER(doc.provider_name), LOWER(@search))) AND (@type == '' OR doc.resource_type == @type) AND (@provider == '' OR LOWER(doc.provider_name) == LOWER(@provider)) RETURN doc)) RETURN LENGTH(combined)`, filterVars),
      this.db.query(`LET combined = UNION((FOR doc IN courses FILTER ${filter} RETURN doc), (FOR doc IN app_resource_drafts FILTER doc.is_test != true AND doc.status == 'approved' AND doc.recommendation_eligible == true AND (@search == '' OR CONTAINS(LOWER(doc.title), LOWER(@search)) OR CONTAINS(LOWER(doc.provider_name), LOWER(@search))) AND (@type == '' OR doc.resource_type == @type) AND (@provider == '' OR LOWER(doc.provider_name) == LOWER(@provider)) RETURN doc)) FOR doc IN combined SORT LOWER(doc.title) LIMIT @offset, @limit RETURN doc`, pageVars),
    ]);
    return { items: rows.map(publicResource), total: totalRows[0] || 0, page, pageSize };
  }

  async resource(resourceKey) {
    const id = resourceDocumentId(resourceKey);
    const resource = id ? (await this.db.query("LET doc = DOCUMENT(@id) FILTER doc != null RETURN doc", { id }))[0] : null;
    if (!resource) throw new HttpError(404, "RESOURCE_NOT_FOUND", "Learning resource was not found");
    let related;
    if (id.startsWith("app_resource_drafts/")) {
      if (resource.is_test === true || resource.status !== "approved" || resource.recommendation_eligible !== true) throw new HttpError(404, "RESOURCE_NOT_FOUND", "Learning resource was not found");
      related = await this.db.query("FOR edge IN app_mapping_drafts FILTER edge.resource_key == @key AND edge.is_test != true AND edge.status == 'approved' AND edge.auto_recommendation_allowed == true LET skill = DOCUMENT(CONCAT('skills/', edge.skill_key)) FILTER skill != null RETURN { edge, skill }", { key: resource._key });
    } else {
      related = await this.db.query("FOR edge IN teaches FILTER edge._from == @id LET skill = DOCUMENT(edge._to) FILTER skill != null RETURN { edge, skill }", { id });
    }
    return {
      resource: publicResource(resource),
      skills: related.map(({ edge, skill }) => ({ skill: publicSkill(skill), evidenceScope: edge.evidence_scope || null, evidenceUrl: edge.reviewed_page_url || edge.evidence_url || null, mappingNote: edge.reviewed_page_summary || edge.review_note || null })),
    };
  }

  async providers(query) {
    const { page, pageSize, offset } = pagination(query);
    const search = searchText(query.get("search") || query.get("q"));
    const filterVars = { search };
    const pageVars = { ...filterVars, offset, limit: pageSize };
    const filter = "@search == '' OR CONTAINS(LOWER(doc.name), LOWER(@search))";
    const combined = `UNION((FOR doc IN providers FILTER ${filter} RETURN doc), (FOR doc IN app_provider_drafts FILTER doc.is_test != true AND doc.status == 'approved' AND (@search == '' OR CONTAINS(LOWER(doc.name), LOWER(@search))) RETURN doc))`;
    const [totalRows, rows] = await Promise.all([
      this.db.query(`LET combined = ${combined} RETURN LENGTH(combined)`, filterVars),
      this.db.query(`LET combined = ${combined} FOR doc IN combined SORT LOWER(doc.name) LIMIT @offset, @limit RETURN doc`, pageVars),
    ]);
    const counts = await this.db.query(
      "FOR provider IN @providers LET officialCount = LENGTH(FOR edge IN offered_by FILTER edge._to == provider._id RETURN 1) LET appCount = LENGTH(FOR resource IN app_resource_drafts FILTER resource.is_test != true AND resource.status == 'approved' AND resource.recommendation_eligible == true AND LOWER(resource.provider_name) == LOWER(provider.name) RETURN 1) RETURN { providerId: provider._id, count: officialCount + appCount }",
      { providers: rows },
    );
    const byProvider = new Map(counts.map((row) => [row.providerId, row.count]));
    return { items: rows.map((provider) => ({ ...publicProvider(provider), resourceCount: byProvider.get(provider._id) || 0 })), total: totalRows[0] || 0, page, pageSize };
  }

  async providerResources(providerKey, query) {
    const text = String(providerKey || "").trim();
    const providerId = text.startsWith("app_provider_drafts/") ? documentId("app_provider_drafts", text) : documentId("providers", text);
    if (!providerId) throw new HttpError(400, "VALIDATION_ERROR", "Provider id is invalid");
    const provider = (await this.db.query("LET doc = DOCUMENT(@id) FILTER doc != null RETURN doc", { id: providerId }))[0];
    if (!provider || (providerId.startsWith("app_provider_drafts/") && (provider.is_test === true || provider.status !== "approved"))) throw new HttpError(404, "PROVIDER_NOT_FOUND", "Provider was not found");
    const { page, pageSize, offset } = pagination(query);
    const [rows, totals] = await Promise.all([
      this.db.query("LET combined = UNION((FOR edge IN offered_by FILTER edge._to == @id LET resource = DOCUMENT(edge._from) FILTER resource != null RETURN resource), (FOR resource IN app_resource_drafts FILTER resource.is_test != true AND resource.status == 'approved' AND resource.recommendation_eligible == true AND LOWER(resource.provider_name) == LOWER(@providerName) RETURN resource)) FOR resource IN combined SORT LOWER(resource.title) LIMIT @offset, @limit RETURN resource", { id: providerId, providerName: provider.name, offset, limit: pageSize }),
      this.db.query("LET officialCount = LENGTH(FOR edge IN offered_by FILTER edge._to == @id RETURN 1) LET appCount = LENGTH(FOR resource IN app_resource_drafts FILTER resource.is_test != true AND resource.status == 'approved' AND resource.recommendation_eligible == true AND LOWER(resource.provider_name) == LOWER(@providerName) RETURN 1) RETURN officialCount + appCount", { id: providerId, providerName: provider.name }),
    ]);
    return { provider: publicProvider(provider), items: rows.map(publicResource), total: totals[0] || 0, page, pageSize };
  }

  async skillGroups(query) {
    const { page, pageSize, offset } = pagination(query);
    const search = searchText(query.get("search") || query.get("q"));
    const filterVars = { search };
    const pageVars = { ...filterVars, offset, limit: pageSize };
    const filter = "@search == '' OR CONTAINS(LOWER(doc.name), LOWER(@search)) OR CONTAINS(LOWER(doc.description), LOWER(@search))";
    const [totalRows, rows] = await Promise.all([
      this.db.query(`RETURN LENGTH(FOR doc IN skill_groups FILTER ${filter} RETURN 1)`, filterVars),
      this.db.query(`FOR doc IN skill_groups FILTER ${filter} SORT LOWER(doc.name) LIMIT @offset, @limit RETURN doc`, pageVars),
    ]);
    return { items: rows.map((doc) => ({ key: doc._key, id: doc._id, name: doc.name || "", description: doc.description || "", code: doc.code || "", escoUri: doc.esco_uri || "" })), total: totalRows[0] || 0, page, pageSize };
  }

  async skillsInGroup(groupKey, query) {
    const groupId = documentId("skill_groups", groupKey);
    if (!groupId) throw new HttpError(400, "VALIDATION_ERROR", "Skill group id is invalid");
    const group = (await this.db.query("LET doc = DOCUMENT(@id) FILTER doc != null RETURN doc", { id: groupId }))[0];
    if (!group) throw new HttpError(404, "SKILL_GROUP_NOT_FOUND", "Skill group was not found");
    const rows = await this.db.query("FOR edge IN esco_skill_group FILTER edge._to == @id LET skill = DOCUMENT(edge._from) FILTER skill != null RETURN { edge, skill }", { id: groupId });
    const skills = rows.map(({ skill }) => publicSkill(skill));
    const { page, pageSize, offset } = pagination(query);
    const items = skills.slice(offset, offset + pageSize);
    return { group: { key: group._key, id: group._id, name: group.name || "", description: group.description || "", code: group.code || "", escoUri: group.esco_uri || "" }, items, total: skills.length, page, pageSize };
  }

  async neighborhood(query) {
    const focusId = String(query.get("focusId") || "").trim();
    const [collection, key] = focusId.split("/");
    if (!NODE_TYPES[collection] || !key || key.includes("/")) throw new HttpError(400, "VALIDATION_ERROR", "focusId must be a valid catalog document id");
    const nodeTypes = (query.get("nodeTypes") || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (nodeTypes.some((type) => !PUBLIC_NODE_TYPES.has(type))) throw new HttpError(400, "VALIDATION_ERROR", "nodeTypes contains an unsupported catalog node type");
    const focus = (await this.db.query("LET doc = DOCUMENT(@id) FILTER doc != null RETURN doc", { id: focusId }))[0];
    if (!focus || !NODE_TYPES[collection]) throw new HttpError(404, "NOT_FOUND", "Graph focus node was not found");
    const requestedEdges = (query.get("edgeTypes") || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (requestedEdges.some((edge) => !GRAPH_EDGE_TYPES.includes(edge))) throw new HttpError(400, "VALIDATION_ERROR", "edgeTypes contains an unsupported edge collection");
    const edgeTypes = requestedEdges.length ? requestedEdges : GRAPH_EDGE_TYPES;
    const limit = Number(query.get("limit") || 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new HttpError(400, "VALIDATION_ERROR", "limit must be 1–200");
    const edgeGroups = await Promise.all(edgeTypes.map((edgeType) => this.db.query(
      "FOR edge IN @@collection FILTER edge._from == @focusId OR edge._to == @focusId FILTER @type != 'skill_prerequisite' OR (edge.approved_for_learning_path == true AND edge.is_demo != true AND edge.source_url != null AND edge.source_url != '') SORT edge._id LIMIT @limit RETURN MERGE(edge, { edgeType: @type })",
      { "@collection": edgeType, focusId, type: edgeType, limit },
    )));
    const edgeRows = edgeGroups.flat().sort((a, b) => a._id.localeCompare(b._id)).slice(0, limit);
    const ids = [...new Set([focusId, ...edgeRows.flatMap((edge) => [edge._from, edge._to])])];
    const nodes = await this.db.query("FOR id IN @ids LET doc = DOCUMENT(id) FILTER doc != null LET collection = PARSE_IDENTIFIER(id).collection LET type = @types[collection] FILTER type != null RETURN { id: doc._id, type, label: doc.name || doc.title || doc.code || doc._key }", {
      ids,
      types: NODE_TYPES,
    });
    const validNodes = nodeTypes.length ? nodes.filter((node) => nodeTypes.includes(node.type)) : nodes;
    const validIds = new Set(validNodes.map((node) => node.id));
    return {
      nodes: validNodes,
      edges: edgeRows.filter((edge) => validIds.has(edge._from) && validIds.has(edge._to)).map((edge) => ({ id: edge._id, source: edge._from, target: edge._to, type: edge.edgeType, data: edge })),
    };
  }

  async coverage() {
    const [careers, requirements, skills, courses, teaches, appTeaches] = await Promise.all([
      this.db.query("FOR doc IN careers SORT LOWER(doc.name) RETURN doc"),
      this.db.query("FOR doc IN requires_skill RETURN doc"),
      this.db.query("FOR doc IN skills COLLECT WITH COUNT INTO count RETURN count"),
      this.db.query("FOR doc IN courses COLLECT WITH COUNT INTO count RETURN count"),
      this.db.query("FOR edge IN teaches LET course = DOCUMENT(edge._from) FILTER course != null AND course.recommendation_eligible == true AND edge.auto_recommendation_allowed == true RETURN edge._to"),
      this.db.query("FOR edge IN app_mapping_drafts FILTER edge.is_test != true AND edge.status == 'approved' AND edge.auto_recommendation_allowed == true LET course = DOCUMENT(CONCAT('app_resource_drafts/', edge.resource_key)) FILTER course != null AND course.is_test != true AND course.status == 'approved' AND course.recommendation_eligible == true RETURN CONCAT('skills/', edge.skill_key)"),
    ]);
    const covered = new Set([...teaches, ...appTeaches]);
    const byCareer = new Map(careers.map((career) => [career._id, { career: career.name, essentialIds: new Set(), optionalIds: new Set() }]));
    const essentialAll = new Set();
    const optionalAll = new Set();
    for (const edge of requirements) {
      if (edge.requirement_type === "essential") {
        essentialAll.add(edge._to);
        byCareer.get(edge._from)?.essentialIds.add(edge._to);
      } else if (edge.requirement_type === "optional") {
        optionalAll.add(edge._to);
        byCareer.get(edge._from)?.optionalIds.add(edge._to);
      }
    }
    const countCovered = (ids) => [...ids].filter((id) => covered.has(id)).length;
    const perCareer = [...byCareer.values()].map((entry) => {
      const essentialCovered = countCovered(entry.essentialIds);
      const optionalCovered = countCovered(entry.optionalIds);
      return {
        career: entry.career,
        essential: { covered: essentialCovered, total: entry.essentialIds.size, ratio: entry.essentialIds.size ? essentialCovered / entry.essentialIds.size : 0 },
        optional: { covered: optionalCovered, total: entry.optionalIds.size, ratio: entry.optionalIds.size ? optionalCovered / entry.optionalIds.size : 0 },
      };
    });
    return {
      totalSkills: skills[0] || 0,
      totalCourses: courses[0] || 0,
      recommendationEligibleSkills: covered.size,
      overall: { covered: covered.size, total: skills[0] || 0, ratio: skills[0] ? covered.size / skills[0] : 0 },
      essential: { covered: countCovered(essentialAll), total: essentialAll.size, ratio: essentialAll.size ? countCovered(essentialAll) / essentialAll.size : 0 },
      optional: { covered: countCovered(optionalAll), total: optionalAll.size, ratio: optionalAll.size ? countCovered(optionalAll) / optionalAll.size : 0 },
      perCareer,
      policy: "Coverage means at least one teaches edge passes both recommendation gates; it does not indicate proficiency.",
    };
  }
}

export { GRAPH_EDGE_TYPES, NODE_TYPES };
