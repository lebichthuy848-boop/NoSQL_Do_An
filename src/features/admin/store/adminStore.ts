import { create } from 'zustand';
import { apiRequest } from '../../../api/http';

type DatabaseStatus = { status: 'available'; version: string; database: string | null; collectionCount: number; checkedAt: string };
type AdminState = {
  catalogStatus: 'loading' | 'live' | 'error';
  catalogFetchedAt: number | null;
  catalogError: string | null;
  databaseStatus: DatabaseStatus | null;
  loadLiveCatalog: () => Promise<void>;
};

export const useAdminStore = create<AdminState>((set) => ({
  catalogStatus: 'loading',
  catalogFetchedAt: null,
  catalogError: null,
  databaseStatus: null,
  loadLiveCatalog: async () => {
    set({ catalogStatus: 'loading', catalogError: null });
    try {
      const status = await apiRequest<DatabaseStatus>('/admin/database/status');
      set({ catalogStatus: 'live', catalogFetchedAt: Date.parse(status.checkedAt) / 1000, catalogError: null, databaseStatus: status });
    } catch (cause) {
      set({ catalogStatus: 'error', catalogError: cause instanceof Error ? cause.message : 'Không thể kết nối Backend.' });
    }
  },
}));
