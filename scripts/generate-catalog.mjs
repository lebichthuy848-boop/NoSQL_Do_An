import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dumpDir = path.join(root, 'database', 'arangodb-dump');
const generatedDir = path.join(root, 'src', 'data', 'generated');
const auditDir = path.join(root, 'public', 'data');
const readLines = (file) => { const text = fs.readFileSync(file, 'utf8').trim(); return text ? text.split(/\r?\n/).map((line) => JSON.parse(line)) : []; };

const collections = {};
for (const structureFile of fs.readdirSync(dumpDir).filter((name) => name.endsWith('.structure.json')).sort()) {
  const structure = JSON.parse(fs.readFileSync(path.join(dumpDir, structureFile), 'utf8'));
  const name = structure.parameters?.name;
  if (!name || name.startsWith('auth_')) continue;
  collections[name] = readLines(path.join(dumpDir, structureFile.replace('.structure.json', '.data.json')));
}

const fields = {
  careers: ['_key', 'name', 'description', 'isco_group', 'career_group', 'esco_uri'], skills: ['_key', 'name', 'description', 'esco_uri', 'skill_type', 'reuse_level'],
  skill_groups: ['_key', 'name', 'description', 'code', 'esco_uri', 'scope_note'], courses: ['_key', 'title', 'canonical_url', 'provider_name', 'resource_type', 'language', 'level', 'certificate_available', 'verified_outcome_proficiency', 'recommendation_eligible', 'review_status'],
  providers: ['_key', 'name', 'official_website'], requires_skill: ['_key', '_from', '_to', 'requirement_type', 'required_level'],
  teaches: ['_key', '_from', '_to', 'evidence_scope', 'mapping_audit_limit', 'recommendation_role', 'evidence_url', 'review_status'], offered_by: ['_key', '_from', '_to'],
  esco_skill_group: ['_key', '_from', '_to', 'interpretation'], esco_skill_broader: ['_key', '_from', '_to', 'interpretation'], esco_group_broader: ['_key', '_from', '_to', 'interpretation'],
  esco_skill_knowledge: ['_key', '_from', '_to', 'interpretation', 'esco_relation_type'], course_entry_skill: ['_key', '_from', '_to', 'not_general_skill_prerequisite', 'source_url'],
  skill_prerequisite: ['_key', '_from', '_to', 'relation_type', 'evidence_url'],
};
const pick = (row, keys) => Object.fromEntries(keys.filter((key) => key in row).map((key) => [key, row[key]]));
const projected = Object.fromEntries(Object.entries(collections).map(([name, rows]) => [name, rows.map((row) => pick(row, fields[name] || ['_key', '_from', '_to']))]));
// The Admin store uses the logical name `prerequisite`; v3.66 stores the current DAG in `skill_prerequisite`.
projected.prerequisite = projected.skill_prerequisite || projected.prerequisite || [];

const careersById = new Map((collections.careers || []).map((row) => [`careers/${row._key}`, row]));
const skillsById = new Map((collections.skills || []).map((row) => [`skills/${row._key}`, row]));
const directSkillIds = new Set((collections.teaches || []).filter((row) => row.evidence_scope === 'direct_topic').map((row) => row._to));
const essential = (collections.requires_skill || []).filter((row) => row.requirement_type === 'essential');
const coverageRows = [...careersById].map(([careerId, career]) => { const required = essential.filter((row) => row._from === careerId); const covered = required.filter((row) => directSkillIds.has(row._to)).length; return [career.name, required.length, covered, required.length - covered, required.length ? Math.round(covered / required.length * 100) : 0]; });
const gapRows = essential.filter((row) => !directSkillIds.has(row._to)).map((row) => [careersById.get(row._from)?.name || row._from, skillsById.get(row._to)?.name || row._to, row._from, row._to, 'NO_DIRECT_TOPIC']);
const csv = (header, rows) => [header, ...rows.map((row) => row.map((value) => String(value ?? '').replaceAll(',', ' ')).join(','))].join('\n');
const rowCounts = Object.fromEntries(Object.entries(collections).map(([name, rows]) => [name, rows.length]));
const records = Object.values(collections).reduce((sum, rows) => sum + rows.length, 0);
const release = { version: 'v3.66', sprint: 0, batch: 'coverage50_batch2', database: 'skill_graph_v366_acceptance', records };
const manifest = { version: 'v3.66', batch: 'coverage50_batch2', database: 'skill_graph_v366_acceptance', collections: Object.keys(collections).length, records, release_row_counts: rowCounts, essential_total: essential.length, essential_direct: essential.length - gapRows.length, essential_missing: gapRows.length, external_arangodb_verified: true };
const reports = { coverage: csv('career,essential,covered,missing,pct', coverageRows), gaps: csv('career,skill,career_id,skill_id,status', gapRows), legacyAudit: '' };
const payload = { release, handoff: { project: 'Skill Graph and personalized learning with ArangoDB', release_version: 'v3.66', source: 'database/arangodb-dump', database: 'skill_graph_v366_acceptance' }, manifest, collections: projected, reports };

fs.mkdirSync(generatedDir, { recursive: true }); fs.mkdirSync(auditDir, { recursive: true });
fs.writeFileSync(path.join(generatedDir, 'catalog-v366.json'), JSON.stringify(payload));
fs.writeFileSync(path.join(auditDir, 'catalog-audit-v366.json'), JSON.stringify({ release, manifest, collections }));
console.log(`GENERATED catalog-v366: ${Object.keys(collections).length} collections, ${records} records from database/arangodb-dump.`);
