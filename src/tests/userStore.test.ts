import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserStore } from '../stores/userStore';

const originalFetch = globalThis.fetch;
const response = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  useUserStore.getState().clear();
  useUserStore.setState({
    careerGoalId: 'careers/old', skillIds: ['skills/owned'], savedResourceIds: [], plannedResourceIds: [], viewedResourceIds: [], completedResourceIds: [], notes: {},
    selectedCareerId: 'careers/old', declaredSkillIds: ['skills/owned'], initialized: true, loading: false, saving: false,
    savingResourceIds: [], noteDrafts: {}, error: '',
  });
});
afterEach(() => {
  useUserStore.getState().clear();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('server-backed user store', () => {
  it('changes the career goal only after the API confirms and retains server skill IDs', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(String(init?.body))).toEqual({ careerId: 'careers/new' });
      return response({ careerGoalId: 'careers/new', skillIds: ['skills/owned'] });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    expect(await useUserStore.getState().setCareer('careers/new')).toBe(true);

    expect(useUserStore.getState().selectedCareerId).toBe('careers/new');
    expect(useUserStore.getState().declaredSkillIds).toEqual(['skills/owned']);
    expect(useUserStore.getState().skillIds).toEqual(['skills/owned']);
  });

  it('keeps the previous goal and reports an API failure without a success result', async () => {
    globalThis.fetch = vi.fn(async () => response({ error: { message: 'backend unavailable' } }, 503)) as typeof fetch;

    expect(await useUserStore.getState().setCareer('careers/new')).toBe(false);
    expect(useUserStore.getState().selectedCareerId).toBe('careers/old');
    expect(useUserStore.getState().error).toContain('backend unavailable');
  });

  it('saves and unsaves without removing other progress or notes', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return response({});
    }) as typeof fetch;

    expect(await useUserStore.getState().toggleSaved('courses/a')).toBe(true);
    expect(useUserStore.getState().savedResourceIds).toEqual(['courses/a']);
    useUserStore.setState({
      plannedResourceIds: ['courses/a'], viewedResourceIds: ['courses/a'], completedResourceIds: ['courses/a'],
      notes: { 'courses/a': 'keep this note' },
    });
    expect(await useUserStore.getState().toggleSaved('courses/a')).toBe(true);

    expect(calls).toEqual([
      { url: '/api/v1/me/resources/courses%2Fa/state', body: { saved: true } },
      { url: '/api/v1/me/resources/courses%2Fa/state', body: { saved: false } },
    ]);
    expect(useUserStore.getState()).toMatchObject({
      savedResourceIds: [], plannedResourceIds: ['courses/a'], viewedResourceIds: ['courses/a'],
      completedResourceIds: ['courses/a'], notes: { 'courses/a': 'keep this note' },
    });
  });

  it('ignores a repeated resource action while the request is pending', async () => {
    let finishRequest!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { finishRequest = resolve; });
    const fetchMock = vi.fn(() => pending);
    globalThis.fetch = fetchMock as typeof fetch;

    const first = useUserStore.getState().toggleSaved('courses/a');
    expect(useUserStore.getState().savingResourceIds).toEqual(['courses/a']);
    expect(await useUserStore.getState().toggleSaved('courses/a')).toBe(false);
    finishRequest(response({}));

    expect(await first).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useUserStore.getState().savedResourceIds).toEqual(['courses/a']);
    expect(useUserStore.getState().savingResourceIds).toEqual([]);
  });

  it('keeps saved state unchanged and exposes API errors', async () => {
    globalThis.fetch = vi.fn(async () => response({ error: { message: 'write failed' } }, 503)) as typeof fetch;

    expect(await useUserStore.getState().toggleSaved('courses/a')).toBe(false);
    expect(useUserStore.getState().savedResourceIds).toEqual([]);
    expect(useUserStore.getState().error).toContain('write failed');
    expect(useUserStore.getState().savingResourceIds).toEqual([]);
  });

  it('hydrates the visible state from the Backend after reload', async () => {
    useUserStore.getState().clear();
    globalThis.fetch = vi.fn(async () => response({ profile: {
      careerGoalId: 'careers/new', skillIds: ['skills/server'], savedResourceIds: ['courses/saved'],
      plannedResourceIds: ['courses/planned'], viewedResourceIds: ['courses/viewed'], completedResourceIds: ['courses/done'], notes: { 'courses/saved': 'server note' },
    } })) as typeof fetch;

    await useUserStore.getState().hydrate();

    expect(useUserStore.getState()).toMatchObject({
      initialized: true, selectedCareerId: 'careers/new', declaredSkillIds: ['skills/server'],
      savedResourceIds: ['courses/saved'], plannedResourceIds: ['courses/planned'],
      viewedResourceIds: ['courses/viewed'], completedResourceIds: ['courses/done'], notes: { 'courses/saved': 'server note' },
    });
  });

  it('does not apply a late profile response after logout clears the store', async () => {
    let finishRequest!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { finishRequest = resolve; });
    globalThis.fetch = vi.fn(() => pending) as typeof fetch;
    useUserStore.getState().clear();
    const hydration = useUserStore.getState().hydrate();
    useUserStore.getState().clear();
    finishRequest(response({ profile: {
      careerGoalId: 'careers/old-user', skillIds: [], savedResourceIds: ['courses/private'], plannedResourceIds: [],
      viewedResourceIds: [], completedResourceIds: [], notes: {},
    } }));
    await hydration;

    expect(useUserStore.getState().initialized).toBe(false);
    expect(useUserStore.getState().savedResourceIds).toEqual([]);
    expect(useUserStore.getState().selectedCareerId).toBe(null);
  });

  it('retains an unsaved note draft after an API failure and clears it after confirmation', async () => {
    useUserStore.getState().setNoteDraft('courses/a', 'my latest note');
    globalThis.fetch = vi.fn(async () => response({ error: { message: 'save failed' } }, 503)) as typeof fetch;

    expect(await useUserStore.getState().setNote('courses/a', 'my latest note')).toBe(false);
    expect(useUserStore.getState().noteDrafts).toEqual({ 'courses/a': 'my latest note' });
    expect(useUserStore.getState().notes).toEqual({});

    globalThis.fetch = vi.fn(async () => response({})) as typeof fetch;
    expect(await useUserStore.getState().setNote('courses/a', 'my latest note')).toBe(true);
    expect(useUserStore.getState().noteDrafts).toEqual({});
    expect(useUserStore.getState().notes).toEqual({ 'courses/a': 'my latest note' });
  });

  it('keeps a revert-to-original note draft until the later queued write succeeds', async () => {
    useUserStore.setState({ notes: { 'courses/a': 'A' } });
    useUserStore.getState().setNoteDraft('courses/a', 'A', true);
    expect(useUserStore.getState().noteDrafts).toEqual({ 'courses/a': 'A' });

    globalThis.fetch = vi.fn(async () => response({})) as typeof fetch;
    expect(await useUserStore.getState().setNote('courses/a', 'B')).toBe(true);
    expect(useUserStore.getState().notes['courses/a']).toBe('B');
    expect(useUserStore.getState().noteDrafts['courses/a']).toBe('A');

    expect(await useUserStore.getState().setNote('courses/a', 'A')).toBe(true);
    expect(useUserStore.getState().notes['courses/a']).toBe('A');
    expect(useUserStore.getState().noteDrafts).toEqual({});
  });

  it('keeps viewed and completed resource states separate from skills', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body == null ? null : JSON.parse(String(init.body));
      calls.push({ url, body });
      return response(url.includes('/completed-resources') ? { completedResourceIds: ['courses/a'] } : {});
    }) as typeof fetch;

    expect(await useUserStore.getState().setStatus('courses/a', 'viewed')).toBe(true);
    expect(await useUserStore.getState().setCompleted('courses/a', true)).toBe(true);

    const state = useUserStore.getState();
    expect(calls[0]).toMatchObject({ url: '/api/v1/me/resources/courses%2Fa/state', body: { viewed: true } });
    expect(calls[1]).toMatchObject({ url: '/api/v1/me/completed-resources', body: { resourceId: 'courses/a' } });
    expect(state.viewedResourceIds).toEqual(['courses/a']);
    expect(state.completedResourceIds).toEqual(['courses/a']);
    expect(state.declaredSkillIds).toEqual(['skills/owned']);
  });
});
