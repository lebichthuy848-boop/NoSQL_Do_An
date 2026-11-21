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
  savingResourceIds: string[];
  error: string;
  noteDrafts: Record<string, string>;
  selectedCareerId: string | null;
  declaredSkillIds: string[];
  hydrate: () => Promise<void>;
  clear: () => void;
  setCareer: (id: string) => Promise<boolean>;
  toggleSkill: (id: string) => Promise<void>;
  toggleSaved: (id: string) => Promise<boolean>;
  setStatus: (id: string, status: 'planned' | 'viewed') => Promise<boolean>;
  setNoteDraft: (id: string, note: string, preserve?: boolean) => void;
  setNote: (id: string, note: string) => Promise<boolean>;
  setCompleted: (id: string, completed: boolean) => Promise<boolean>;
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

export const useUserStore = create<State>((set, get) => {
  let profileEpoch = 0;
  let activeWrites = 0;

  const beginWrite = () => {
    const epoch = profileEpoch;
    activeWrites += 1;
    set({ saving: true, error: '' });
    return epoch;
  };
  const finishWrite = (epoch: number) => {
    if (epoch !== profileEpoch) return;
    activeWrites = Math.max(0, activeWrites - 1);
    set({ saving: activeWrites > 0 });
  };
  const writeResource = async (id: string, request: () => Promise<unknown>, apply: () => void) => {
    if (get().savingResourceIds.includes(id)) return false;
    const epoch = profileEpoch;
    activeWrites += 1;
    set((state) => ({
      saving: true,
      savingResourceIds: [...state.savingResourceIds, id],
      error: '',
    }));
    try {
      await request();
      if (epoch !== profileEpoch) return false;
      apply();
      return true;
    } catch (cause) {
      if (epoch === profileEpoch) {
        set({ error: cause instanceof Error ? cause.message : 'Không thể cập nhật trạng thái học liệu.' });
      }
      return false;
    } finally {
      if (epoch === profileEpoch) {
        activeWrites = Math.max(0, activeWrites - 1);
        set((state) => ({
          saving: activeWrites > 0,
          savingResourceIds: state.savingResourceIds.filter((value) => value !== id),
        }));
      }
    }
  };

  return {
    ...empty(),
    initialized: false,
    loading: false,
    saving: false,
    savingResourceIds: [],
    error: '',
    noteDrafts: {},
    selectedCareerId: null,
    declaredSkillIds: [],

    hydrate: async () => {
      if (get().loading) return;
      const epoch = profileEpoch;
      set({ loading: true, error: '' });
      try {
        const result = await apiRequest<{ profile: Profile }>('/me');
        if (epoch === profileEpoch) set({ ...stateFromProfile(result.profile), initialized: true });
      } catch (cause) {
        if (epoch === profileEpoch) {
          set({ error: cause instanceof Error ? cause.message : 'Không thể tải dữ liệu cá nhân.' });
        }
      } finally {
        if (epoch === profileEpoch) set({ loading: false });
      }
    },

    clear: () => {
      profileEpoch += 1;
      activeWrites = 0;
      set({
        ...empty(), initialized: false, loading: false, saving: false, savingResourceIds: [], error: '',
        noteDrafts: {}, selectedCareerId: null, declaredSkillIds: [],
      });
    },

    setCareer: async (id) => {
      const epoch = beginWrite();
      try {
        const result = await apiRequest<{ careerGoalId: string; skillIds: string[] }>('/me/career-goal', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ careerId: id }),
        });
        if (epoch !== profileEpoch) return false;
        set({ careerGoalId: result.careerGoalId, selectedCareerId: result.careerGoalId, skillIds: result.skillIds, declaredSkillIds: result.skillIds });
        return true;
      } catch (cause) {
        if (epoch === profileEpoch) set({ error: cause instanceof Error ? cause.message : 'Không thể cập nhật nghề mục tiêu.' });
        return false;
      } finally { finishWrite(epoch); }
    },

    toggleSkill: async (id) => {
      const epoch = beginWrite();
      const isOwned = get().declaredSkillIds.includes(id);
      try {
        const result = isOwned
          ? await apiRequest<{ skillIds: string[] }>(`/me/skills/${encodeURIComponent(id)}`, { method: 'DELETE' })
          : await apiRequest<{ skillIds: string[] }>('/me/skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skillId: id }) });
        if (epoch === profileEpoch) set({ skillIds: result.skillIds, declaredSkillIds: result.skillIds });
      } catch (cause) {
        if (epoch === profileEpoch) set({ error: cause instanceof Error ? cause.message : 'Không thể cập nhật kỹ năng.' });
      } finally { finishWrite(epoch); }
    },

    toggleSaved: async (id) => {
      if (get().savingResourceIds.includes(id)) return false;
      const saved = !get().savedResourceIds.includes(id);
      return writeResource(id, () => apiRequest(resourcePath(id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved }),
      }), () => {
        const values = get().savedResourceIds;
        set({ savedResourceIds: saved ? [...new Set([...values, id])] : values.filter((value) => value !== id) });
      });
    },

    setStatus: async (id, status) => {
      if (get().savingResourceIds.includes(id)) return false;
      const key = status === 'planned' ? 'plannedResourceIds' : 'viewedResourceIds';
      const next = !get()[key].includes(id);
      return writeResource(id, () => apiRequest(resourcePath(id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [status]: next }),
      }), () => {
        const values = get()[key];
        set({ [key]: next ? [...new Set([...values, id])] : values.filter((value) => value !== id) });
      });
    },

    setNoteDraft: (id, note, preserve = false) => set((state) => {
      const noteDrafts = { ...state.noteDrafts };
      if (!preserve && note === state.notes[id]) delete noteDrafts[id];
      else noteDrafts[id] = note;
      return { noteDrafts };
    }),

    setNote: async (id, note) => writeResource(id, () => apiRequest(resourcePath(id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }),
    }), () => {
      const state = get();
      const noteDrafts = { ...state.noteDrafts };
      if (noteDrafts[id] === note) delete noteDrafts[id];
      set({ notes: { ...state.notes, [id]: note }, noteDrafts });
    }),

    setCompleted: async (id, completed) => {
      if (get().savingResourceIds.includes(id)) return false;
      let completedResourceIds: string[] = [];
      return writeResource(id, async () => {
        const result = completed
          ? await apiRequest<{ completedResourceIds: string[] }>('/me/completed-resources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceId: id }) })
          : await apiRequest<{ completedResourceIds: string[] }>(`/me/completed-resources/${encodeURIComponent(id)}`, { method: 'DELETE' });
        completedResourceIds = result.completedResourceIds;
      }, () => set({ completedResourceIds }));
    },
  };
});
