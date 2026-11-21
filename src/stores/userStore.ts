import { create } from 'zustand';
import { apiRequest } from '../api/http';

type Profile = {
  careerGoalId: string | null;
  skillIds: string[];
  savedResourceIds: string[];
  plannedResourceIds: string[];
  viewedResourceIds: string[];
  completedResourceIds: string[];
  notes: Record<string, string>;
};
type State = Profile & {
  initialized: boolean;
  loading: boolean;
  saving: boolean;
  error: string;
  selectedCareerId: string | null;
  declaredSkillIds: string[];
  hydrate: () => Promise<void>;
  clear: () => void;
  setCareer: (id: string) => Promise<void>;
  toggleSkill: (id: string) => Promise<void>;
  toggleSaved: (id: string) => Promise<void>;
  setStatus: (id: string, status: 'planned' | 'viewed') => Promise<void>;
  setNote: (id: string, note: string) => Promise<void>;
  setCompleted: (id: string, completed: boolean) => Promise<void>;
};

const empty = (): Profile => ({
  careerGoalId: null,
  skillIds: [],
  savedResourceIds: [],
  plannedResourceIds: [],
  viewedResourceIds: [],
  completedResourceIds: [],
  notes: {},
});
const stateFromProfile = (profile: Profile) => ({
  ...profile,
  selectedCareerId: profile.careerGoalId,
  declaredSkillIds: profile.skillIds,
});
const resourcePath = (id: string) => `/me/resources/${encodeURIComponent(id)}/state`;

export const useUserStore = create<State>((set, get) => ({
  ...empty(),
  initialized: false,
  loading: false,
  saving: false,
  error: '',
  selectedCareerId: null,
  declaredSkillIds: [],

  hydrate: async () => {
    if (get().loading) return;
    set({ loading: true, error: '' });
    try {
      const result = await apiRequest<{ profile: Profile }>('/me');
      set({ ...stateFromProfile(result.profile), initialized: true });
    } catch (cause) {
      set({ error: cause instanceof Error ? cause.message : 'Không thể tải dữ liệu cá nhân.', initialized: true });
    } finally {
      set({ loading: false });
    }
  },

  clear: () => set({
    ...empty(), initialized: false, loading: false, saving: false, error: '',
    selectedCareerId: null, declaredSkillIds: [],
  }),

  setCareer: async (id) => {
    set({ saving: true, error: '' });
    try {
      const result = await apiRequest<{ careerGoalId: string; skillIds: string[] }>('/me/career-goal', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ careerId: id }),
      });
      set({ careerGoalId: result.careerGoalId, selectedCareerId: result.careerGoalId, skillIds: result.skillIds, declaredSkillIds: result.skillIds });
    } catch (cause) {
      set({ error: cause instanceof Error ? cause.message : 'Không thể cập nhật nghề mục tiêu.' });
    } finally { set({ saving: false }); }
  },

  toggleSkill: async (id) => {
    const isOwned = get().declaredSkillIds.includes(id);
    set({ saving: true, error: '' });
    try {
      const result = isOwned
        ? await apiRequest<{ skillIds: string[] }>(`/me/skills/${encodeURIComponent(id)}`, { method: 'DELETE' })
        : await apiRequest<{ skillIds: string[] }>('/me/skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skillId: id }) });
      set({ skillIds: result.skillIds, declaredSkillIds: result.skillIds });
    } catch (cause) { set({ error: cause instanceof Error ? cause.message : 'Không thể cập nhật kỹ năng.' }); }
    finally { set({ saving: false }); }
  },

  toggleSaved: async (id) => {
    const saved = !get().savedResourceIds.includes(id);
    set({ saving: true, error: '' });
    try {
      await apiRequest(resourcePath(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved }) });
      const values = get().savedResourceIds;
      set({ savedResourceIds: saved ? [...values, id] : values.filter((value) => value !== id) });
    } catch (cause) { set({ error: cause instanceof Error ? cause.message : 'Không thể cập nhật học liệu đã lưu.' }); }
    finally { set({ saving: false }); }
  },

  setStatus: async (id, status) => {
    const key = status === 'planned' ? 'plannedResourceIds' : 'viewedResourceIds';
    const next = !get()[key].includes(id);
    set({ saving: true, error: '' });
    try {
      await apiRequest(resourcePath(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [status]: next }) });
      const values = get()[key];
      set({ [key]: next ? [...values, id] : values.filter((value) => value !== id) });
    } catch (cause) { set({ error: cause instanceof Error ? cause.message : 'Không thể cập nhật tiến độ học.' }); }
    finally { set({ saving: false }); }
  },

  setNote: async (id, note) => {
    set({ saving: true, error: '' });
    try {
      await apiRequest(resourcePath(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
      set({ notes: { ...get().notes, [id]: note } });
    } catch (cause) { set({ error: cause instanceof Error ? cause.message : 'Không thể lưu ghi chú.' }); }
    finally { set({ saving: false }); }
  },

  setCompleted: async (id, completed) => {
    set({ saving: true, error: '' });
    try {
      const result = completed
        ? await apiRequest<{ completedResourceIds: string[]; note?: string }>('/me/completed-resources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceId: id }) })
        : await apiRequest<{ completedResourceIds: string[] }>(`/me/completed-resources/${encodeURIComponent(id)}`, { method: 'DELETE' });
      set({ completedResourceIds: result.completedResourceIds });
    } catch (cause) { set({ error: cause instanceof Error ? cause.message : 'Không thể cập nhật học liệu đã hoàn thành.' }); }
    finally { set({ saving: false }); }
  },
}));
