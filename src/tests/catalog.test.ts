import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../api/http';
import { ApiCatalogRepository } from '../repositories/catalogRepository';
import { collapseBranch, displayName, mergeExpandedGraph, prioritizeGraph } from '../features/graph/graphModel';
import type { GraphData } from '../types/catalog';

const originalFetch = globalThis.fetch;
const json = (data: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), {
  status: 200,
  headers: { 'Content-Type': 'application/json', ...headers },
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Node API client', () => {
  it('uses the v1 prefix and includes the session cookie', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    globalThis.fetch = fetchMock as typeof fetch;
    await expect(apiRequest<{ ok: boolean }>('/meta/release')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/meta/release', expect.objectContaining({ credentials: 'include' }));
  });

  it('parses backend error envelopes', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }), { status: 403 })) as typeof fetch;
    await expect(apiRequest('/admin/users')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'Forbidden' });
  });
});

describe('API-backed catalog repository', () => {
  it('loads live pages and maps career requirements and gated coverage DTOs', async () => {
    const career = { key: 'c1', id: 'careers/c1', name: 'Data analyst', description: 'Career', careerGroup: 'data', iscoGroup: '2511', escoUri: '' };
    const skill = { key: 's1', id: 'skills/s1', name: 'SQL', description: 'Query data', skillType: 'knowledge', escoUri: '', reuseLevel: null };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/careers?page=')) return json([career], { 'X-Total-Count': '1' });
      if (url.includes('/skills?page=')) return json([skill], { 'X-Total-Count': '1' });
      if (url.includes('/skill-groups?page=')) return json([], { 'X-Total-Count': '0' });
      if (url.includes('/resources?page=')) return json([], { 'X-Total-Count': '0' });
      if (url.includes('/providers?page=')) return json([], { 'X-Total-Count': '0' });
      if (url.endsWith('/meta/release')) return json({ release: { version: 'v3.66-coverage50-batch2', records: 2 }, careers: 1, skills: 1, courses: 0 });
      if (url.endsWith('/statistics/coverage')) return json({ perCareer: [{ career: 'Data analyst', essential: { covered: 1, total: 2, ratio: 0.5 }, optional: { covered: 0, total: 0, ratio: 0 } }] });
      if (url.endsWith('/careers/c1/skills')) return json([{ key: 'r1', id: 'requires_skill/r1', from: 'careers/c1', to: 'skills/s1', raw: { _key: 'r1' }, requirementType: 'essential', skill, resourceCount: 1 }]);
      throw new Error(`Unexpected API path ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const repository = new ApiCatalogRepository();
    await repository.load();

    expect(repository.status).toBe('ready');
    expect(repository.getCareerById('c1')?.name).toBe('Data analyst');
    expect(repository.getCareerRequirements('careers/c1')[0]).toMatchObject({ requirementType: 'essential', skill: { id: 'skills/s1' }, resourceCount: 1 });
    expect(repository.getCoverageReport()).toEqual([{ career: 'Data analyst', essential: 2, covered: 1, missing: 1, pct: 50 }]);
  });
});

describe('API graph model', () => {
  const base: GraphData = { nodes: [{ id: 'careers/c1', type: 'career', label: 'Career' }], edges: [] };
  const neighbors: GraphData = {
    nodes: [{ id: 'careers/c1', type: 'career', label: 'Career' }, { id: 'skills/s1', type: 'skill', label: 'SQL' }],
    edges: [{ id: 'requires_skill/r1', source: 'careers/c1', target: 'skills/s1', type: 'requires_skill' }],
  };

  it('merges API neighbors without reversing edge direction', () => {
    const graph = mergeExpandedGraph(base, [neighbors]);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges[0]).toMatchObject({ source: 'careers/c1', target: 'skills/s1' });
    expect(prioritizeGraph(graph, 'careers/c1', new Set(), 1)).toHaveLength(1);
  });

  it('collapses only the selected expansion and labels missing names', () => {
    expect(collapseBranch(new Set(['skills/a', 'skills/b']), 'skills/a')).toEqual(new Set(['skills/b']));
    expect(displayName('-', 'skills/missing')).toEqual({ label: '[Thiếu tên] missing', fallback: true });
  });
});
