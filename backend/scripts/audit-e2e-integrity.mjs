import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ArangoClient } from "../src/arango.mjs";
import { loadConfig } from "../src/config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dumpDirectory = path.join(root, "database", "arangodb-dump");
const expected = {
  coreCollections: 25,
  documentsAndEdges: 5990,
  edges: 3099,
  graphEdgeDefinitions: 13,
  careers: 12,
  skills: 420,
  requires_skill: 932,
  courses: 510,
  providers: 183,
  teaches: 678,
  eligibleCourses: 173,
  allowedMappings: 245,
  approvedEvidencePrerequisites: 6,
  coverage: { overall: "227/420", essential: "143/221", optional: "136/267" },
};
const storedFingerprints = {
  careers: "93a4f72c1db9228311ee2739b1bfde7487bd3aeb52aedbe8bfc759e0d91f4e58",
  skills: "c3b591c544d00cd1d38756195b4baffab5b0bf15a7c23c45271f174442269288",
  requires_skill: "70201dcb8882acb561f864ec41a505f3fd864e7ed5dea9dbd087efe70d749e26",
};

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).filter((key) => key !== "_rev").sort().map((key) => [key, normalize(value[key])]));
}

function fingerprint(documents) {
  const canonical = documents.slice().sort((a, b) => String(a._key).localeCompare(String(b._key)))
    .map((document) => JSON.stringify(normalize(document))).join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

async function readBaseline() {
  const structureFiles = (await readdir(dumpDirectory)).filter((name) => name.endsWith(".structure.json")).sort();
  const collections = new Map();
  const types = new Map();
  for (const structureFile of structureFiles) {
    const structurePath = path.join(dumpDirectory, structureFile);
    const structure = JSON.parse(await readFile(structurePath, "utf8"));
    const name = structure.parameters?.name;
    if (!name || name.startsWith("auth_")) continue;
    const dataPath = path.join(dumpDirectory, structureFile.replace(".structure.json", ".data.json"));
    const text = (await readFile(dataPath, "utf8")).trim();
    const documents = text ? text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : [];
    collections.set(name, documents);
    types.set(name, structure.parameters.type);
  }
  return { collections, types };
}

function collectionName(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Unexpected collection name in ArangoDB metadata");
  return `\`${value}\``;
}

async function main() {
  const config = loadConfig();
  if (config.databaseUrl !== "http://127.0.0.1:39531" || config.databaseName !== "skill_graph_v366_acceptance" || config.databaseUser !== "skillgraph_e2e_runtime" || !config.databasePassword) {
    throw new Error("E2E target identity did not match the approved loopback database and runtime principal");
  }

  const db = new ArangoClient({ url: config.databaseUrl, database: config.databaseName, username: config.databaseUser, password: config.databasePassword });
  const [version, currentDatabase, collectionResponse, graphResponse] = await Promise.all([
    db.version(),
    db.request("/_api/database/current"),
    db.request("/_api/collection"),
    db.request("/_api/gharial"),
  ]);
  if (currentDatabase.result?.name !== "skill_graph_v366_acceptance") throw new Error("Connected database identity did not match the approved E2E target");

  const rows = collectionResponse.result || [];
  const collectionGroups = { core: [], application: [], system: [] };
  const collectionTypes = new Map();
  for (const row of rows) {
    if (typeof row.name !== "string") continue;
    collectionTypes.set(row.name, row.type);
    if (row.isSystem === true || row.name.startsWith("_")) collectionGroups.system.push(row.name);
    else if (row.name.startsWith("app_")) collectionGroups.application.push(row.name);
    else collectionGroups.core.push(row.name);
  }

  const baseline = await readBaseline();
  const expectedNames = [...baseline.collections.keys()].sort();
  const actualNames = collectionGroups.core.slice().sort();
  const missingCollections = expectedNames.filter((name) => !actualNames.includes(name));
  const unexpectedCoreCollections = actualNames.filter((name) => !expectedNames.includes(name));
  const actualCollections = new Map();
  for (const name of actualNames) {
    const documents = await db.query(`FOR doc IN ${collectionName(name)} RETURN doc`);
    actualCollections.set(name, documents);
  }

  const sourceCounts = Object.fromEntries([...baseline.collections].map(([name, documents]) => [name, documents.length]));
  const actualCounts = Object.fromEntries([...actualCollections].map(([name, documents]) => [name, documents.length]));
  const countMismatches = expectedNames.filter((name) => actualCounts[name] !== sourceCounts[name]);
  const contentMismatches = expectedNames.filter((name) => fingerprint(actualCollections.get(name) || []) !== fingerprint(baseline.collections.get(name) || []));
  const totalCoreDocuments = Object.values(actualCounts).reduce((sum, count) => sum + count, 0);
  const edgeNames = actualNames.filter((name) => collectionTypes.get(name) === 3);
  const totalEdges = edgeNames.reduce((sum, name) => sum + actualCounts[name], 0);
  const graphDefinitions = (graphResponse.graphs || []).flatMap((graph) => graph.edgeDefinitions || []);
  const graphDefinitionByCollection = new Map(graphDefinitions.map((definition) => [definition.collection, definition]));
  const unmappedGraphEdgeCollections = edgeNames.filter((name) => !graphDefinitionByCollection.has(name));
  const documentsById = new Map();
  for (const [name, documents] of actualCollections) {
    for (const document of documents) documentsById.set(document._id || `${name}/${document._key}`, document);
  }

  let danglingEndpoints = 0;
  let invalidGraphEndpoints = 0;
  let selfLoops = 0;
  let duplicateEdgePairs = 0;
  const edgePairs = new Set();
  for (const name of edgeNames) {
    for (const edge of actualCollections.get(name) || []) {
      if (!documentsById.has(edge._from) || !documentsById.has(edge._to)) danglingEndpoints += 1;
      const definition = graphDefinitionByCollection.get(name);
      const fromCollection = String(edge._from || "").split("/", 1)[0];
      const toCollection = String(edge._to || "").split("/", 1)[0];
      if (!definition || !definition.from?.includes(fromCollection) || !definition.to?.includes(toCollection)) invalidGraphEndpoints += 1;
      if (edge._from === edge._to) selfLoops += 1;
      const pair = `${name}|${edge._from}|${edge._to}`;
      if (edgePairs.has(pair)) duplicateEdgePairs += 1;
      edgePairs.add(pair);
    }
  }

  const courses = actualCollections.get("courses") || [];
  const teaches = actualCollections.get("teaches") || [];
  const requirements = actualCollections.get("requires_skill") || [];
  const courseById = new Map(courses.map((course) => [course._id || `courses/${course._key}`, course]));
  const eligibleCourses = courses.filter((course) => course.recommendation_eligible === true);
  const allowedMappings = teaches.filter((edge) => edge.auto_recommendation_allowed === true);
  const invalidAllowedMappings = allowedMappings.filter((edge) => courseById.get(edge._from)?.recommendation_eligible !== true);
  const mappedEligibleCourseIds = new Set(allowedMappings.filter((edge) => courseById.get(edge._from)?.recommendation_eligible === true).map((edge) => edge._from));
  const eligibleCoursesWithoutMapping = eligibleCourses.filter((course) => !mappedEligibleCourseIds.has(course._id || `courses/${course._key}`));
  const coveredSkillIds = new Set(allowedMappings.filter((edge) => courseById.get(edge._from)?.recommendation_eligible === true).map((edge) => edge._to));
  const skillCount = (actualCollections.get("skills") || []).length;
  const requirementSkills = (type) => new Set(requirements.filter((edge) => edge.requirement_type === type).map((edge) => edge._to));
  const essentialSkills = requirementSkills("essential");
  const optionalSkills = requirementSkills("optional");
  const coverage = {
    overall: `${[...coveredSkillIds].filter((id) => documentsById.has(id)).length}/${skillCount}`,
    essential: `${[...essentialSkills].filter((id) => coveredSkillIds.has(id)).length}/${essentialSkills.size}`,
    optional: `${[...optionalSkills].filter((id) => coveredSkillIds.has(id)).length}/${optionalSkills.size}`,
  };
  const prerequisites = actualCollections.get("skill_prerequisite") || [];
  const approvedEvidencePrerequisites = prerequisites.filter((edge) => edge.approved_for_learning_path === true && edge.is_demo !== true && typeof edge.source_url === "string" && /^https?:\/\/[^\s]+$/i.test(edge.source_url));
  const protectedFingerprintResults = Object.fromEntries(Object.entries(storedFingerprints).map(([name, expectedHash]) => {
    const baselineHash = fingerprint(baseline.collections.get(name) || []);
    const actualHash = fingerprint(actualCollections.get(name) || []);
    return [name, { stored: expectedHash, baseline: baselineHash, actual: actualHash, baselineMatchesActual: baselineHash === actualHash, storedMatchesCanonicalMethod: expectedHash === baselineHash }];
  }));

  const namedGraphCount = graphResponse.graphs?.length || 0;
  const graphEdgeDefinitionCount = (graphResponse.graphs || []).reduce((sum, graph) => sum + (graph.edgeDefinitions?.length || 0), 0);
  const checks = {
    expectedDatabase: currentDatabase.result.name === "skill_graph_v366_acceptance",
    expectedArangoVersion: version.version === "3.12.11",
    coreCollectionNamesMatch: missingCollections.length === 0 && unexpectedCoreCollections.length === 0,
    collectionCountsMatch: countMismatches.length === 0,
    coreDocuments: totalCoreDocuments === expected.documentsAndEdges,
    coreEdges: totalEdges === expected.edges,
    graphEdgeDefinitions: graphEdgeDefinitionCount === expected.graphEdgeDefinitions,
    careers: actualCounts.careers === expected.careers,
    skills: actualCounts.skills === expected.skills,
    requiresSkill: actualCounts.requires_skill === expected.requires_skill,
    courses: actualCounts.courses === expected.courses,
    providers: actualCounts.providers === expected.providers,
    teaches: actualCounts.teaches === expected.teaches,
    recommendationEligibleCourses: eligibleCourses.length === expected.eligibleCourses,
    allowedTeachesMappings: allowedMappings.length === expected.allowedMappings,
    recommendationGates: invalidAllowedMappings.length === 0 && eligibleCoursesWithoutMapping.length === 0,
    sourceBackedApprovedPrerequisites: approvedEvidencePrerequisites.length === expected.approvedEvidencePrerequisites,
    coverage: JSON.stringify(coverage) === JSON.stringify(expected.coverage),
    graphDefinitionsCoverEdgeCollections: unmappedGraphEdgeCollections.length === 0,
    graphIntegrity: danglingEndpoints === 0 && invalidGraphEndpoints === 0 && selfLoops === 0 && duplicateEdgePairs === 0,
    coreContentMatchesSource: contentMismatches.length === 0,
  };
  const report = {
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    scope: "READ_ONLY_E2E_BATCH_2_CORE_AUDIT",
    generatedAt: new Date().toISOString(),
    database: currentDatabase.result.name,
    arangoVersion: version.version,
    collectionGroups: { total: rows.length, core: collectionGroups.core.length, app: collectionGroups.application.length, system: collectionGroups.system.length },
    expected,
    actual: { coreCollections: actualNames.length, coreCollectionNames: actualNames, coreDocumentsAndEdges: totalCoreDocuments, coreEdges: totalEdges, namedGraphs: namedGraphCount, graphEdgeDefinitions: graphEdgeDefinitionCount, counts: actualCounts, eligibleCourses: eligibleCourses.length, allowedMappings: allowedMappings.length, invalidAllowedMappings: invalidAllowedMappings.length, eligibleCoursesWithoutMapping: eligibleCoursesWithoutMapping.length, approvedEvidencePrerequisites: approvedEvidencePrerequisites.length, coverage, graphIntegrity: { danglingEndpoints, invalidGraphEndpoints, selfLoops, duplicateEdgePairs } },
    differences: { missingCollections, unexpectedCoreCollections, countMismatches, contentMismatches, unmappedGraphEdgeCollections },
    protectedFingerprints: protectedFingerprintResults,
    checks,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}

main().catch(() => {
  process.stderr.write("Read-only integrity audit failed before producing a complete report. Confirm the isolated E2E target and runtime access; no credential or record content was printed.\n");
  process.exitCode = 1;
});
