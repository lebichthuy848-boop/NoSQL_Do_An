import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserStore } from '../stores/userStore';

const originalFetch = globalThis.fetch;
const response = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  useUserStore.setState({
    careerGoalId: 'careers/old', skillIds: ['skills/owned'], savedResourceIds: [], plannedResourceIds: [], viewedResourceIds: [], completedResourceIds: [], notes: {},
    selectedCareerId: 'careers/old', declaredSkillIds: ['skills/owned'], initialized: true, loading: false, saving: false, error: '',
  });
});
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

describe('server-backed user store', () => {
  it('changes the career goal while retaining the server skill IDs', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(String(init?.body))).toEqual({ careerId: 'careers/new' });
      return response({ careerGoalId: 'careers/new', skillIds: ['skills/owned'] });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await useUserStore.getState().setCareer('careers/new');

    expect(useUserStore.getState().selectedCareerId).toBe('careers/new');
    expect(useUserStore.getState().declaredSkillIds).toEqual(['skills/owned']);
    expect(useUserStore.getState().skillIds).toEqual(['skills/owned']);
  });

  it('keeps viewed and completed resource states separate from skills', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body == null ? null : JSON.parse(String(init.body));
      calls.push({ url, body });
      return response(url.includes('/completed-resources') ? { completedResourceIds: ['courses/a'] } : {});
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await useUserStore.getState().setStatus('courses/a', 'viewed');
    await useUserStore.getState().setCompleted('courses/a', true);

    const state = useUserStore.getState();
    expect(calls[0]).toMatchObject({ url: '/api/v1/me/resources/courses%2Fa/state', body: { viewed: true } });
    expect(calls[1]).toMatchObject({ url: '/api/v1/me/completed-resources', body: { resourceId: 'courses/a' } });
    expect(state.viewedResourceIds).toEqual(['courses/a']);
    expect(state.completedResourceIds).toEqual(['courses/a']);
    expect(state.declaredSkillIds).toEqual(['skills/owned']);
  });
});
