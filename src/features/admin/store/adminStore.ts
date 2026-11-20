import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getCatalogRepository } from '../../../repositories/catalogRepository';
import type { AdminCollection, AdminLog, AdminNotice, AdminRecord, ReviewState } from '../types/admin';

const catalog = getCatalogRepository().getRaw();
const seeded = Object.fromEntries(
  (['careers', 'skills', 'providers', 'courses', 'teaches', 'offered_by', 'requires_skill', 'prerequisite'] as AdminCollection[])
    .map((name) => [name, (catalog.collections[name] || []).map((row) => ({ ...row }) as AdminRecord)]),
) as Partial<Record<AdminCollection, AdminRecord[]>>;

type AdminState = {
  records: Partial<Record<AdminCollection, AdminRecord[]>>;
  catalogStatus: 'loading' | 'live' | 'error';
  catalogFetchedAt: number | null;
  catalogError: string | null;
  loadLiveCatalog: () => Promise<void>;
  logs: AdminLog[];
  notices: AdminNotice[];
  add: (collection: AdminCollection, row: AdminRecord, actor: string) => void;
  patch: (collection: AdminCollection, key: string, changes: Record<string, unknown>, actor: string) => void;
  remove: (collection: AdminCollection, key: string, actor: string, reason?: string) => void;
  review: (collection: AdminCollection, key: string, status: ReviewState, actor: string, reason?: string) => void;
  markNoticeRead: (id: string) => void;
  markAllRead: () => void;
  resetPreview: () => void;
};

const now = () => new Date().toISOString();
const putLog = (logs: AdminLog[], actor: string, action: string, target: string, before?: unknown, after?: unknown, reason?: string): AdminLog[] => [
  { id: crypto.randomUUID(), actor, action, target, at: now(), result: 'Thành công' as const, before, after, reason }, ...logs,
].slice(0, 400);

export const useAdminStore = create<AdminState>()(persist((set, get) => ({
  records: seeded,
  catalogStatus: 'loading',
  catalogFetchedAt: null,
  catalogError: null,
  loadLiveCatalog: async () => {
    set({ catalogStatus: 'loading', catalogError: null });
    try {
      const response = await fetch('/api/auth/admin/catalog', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      const payload = await response.json() as { message?: string; fetchedAt?: number; collections?: Partial<Record<AdminCollection, AdminRecord[]>> };
      if (!response.ok) throw new Error(payload.message || 'Không tải được catalog từ ArangoDB.');
      if (!payload.collections || typeof payload.collections !== 'object') throw new Error('API không trả về danh mục hợp lệ.');
      const liveCollections: Partial<Record<AdminCollection, AdminRecord[]>> = {};
      (['careers', 'skills', 'providers', 'courses', 'teaches', 'offered_by', 'requires_skill', 'prerequisite'] as AdminCollection[]).forEach((name) => {
        const rows = payload.collections?.[name];
        if (!Array.isArray(rows)) throw new Error(`Thiếu collection ${name} trong dữ liệu ArangoDB.`);
        liveCollections[name] = rows;
      });
      set((state) => ({ records: { ...state.records, ...liveCollections }, catalogStatus: 'live', catalogFetchedAt: payload.fetchedAt || Date.now() / 1000, catalogError: null }));
    } catch (error) {
      set({ catalogStatus: 'error', catalogError: error instanceof Error ? error.message : 'Không thể kết nối ArangoDB.' });
    }
  },
  logs: [],
  notices: [],
  add: (collection, row, actor) => {
    if (!row._key) throw new Error('Thiếu khóa bản ghi.');
    if (get().records[collection]?.some((x) => x._key === row._key)) throw new Error('Mã này đã tồn tại.');
    set((state) => ({ records: { ...state.records, [collection]: [row, ...(state.records[collection] || [])] }, logs: putLog(state.logs, actor, 'Tạo bản ghi', `${collection}/${row._key}`, undefined, row) }));
  },
  patch: (collection, key, changes, actor) => set((state) => {
    const before = state.records[collection]?.find((x) => x._key === key);
    if (!before) return state;
    const after = { ...before, ...changes, _key: key };
    return { records: { ...state.records, [collection]: (state.records[collection] || []).map((x) => x._key === key ? after : x) }, logs: putLog(state.logs, actor, 'Cập nhật bản ghi', `${collection}/${key}`, before, after) };
  }),
  remove: (collection, key, actor, reason) => set((state) => {
    const before = state.records[collection]?.find((x) => x._key === key);
    return { records: { ...state.records, [collection]: (state.records[collection] || []).filter((x) => x._key !== key) }, logs: putLog(state.logs, actor, 'Xóa bản ghi', `${collection}/${key}`, before, undefined, reason) };
  }),
  review: (collection, key, status, actor, reason) => set((state) => {
    const before = state.records[collection]?.find((x) => x._key === key);
    if (!before) return state;
    const changes = { review_status: status, ...(collection === 'courses' ? { recommendation_eligible: status === 'approved' } : {}), ...(reason ? { review_reason: reason } : {}) };
    const after = { ...before, ...changes };
    return { records: { ...state.records, [collection]: (state.records[collection] || []).map((x) => x._key === key ? after : x) }, logs: putLog(state.logs, actor, status === 'approved' ? 'Duyệt' : status === 'rejected' ? 'Từ chối' : 'Chuyển chờ duyệt', `${collection}/${key}`, before, after, reason) };
  }),
  markNoticeRead: (id) => set((state) => ({ notices: state.notices.map((n) => n.id === id ? { ...n, read: true } : n) })),
  markAllRead: () => set((state) => ({ notices: state.notices.map((n) => ({ ...n, read: true })) })),
  resetPreview: () => set({ records: seeded, logs: [], notices: [] }),
}), { name: 'skillgraph-admin-preview-v1', version: 1, partialize: (state) => ({ records: state.records, logs: state.logs, notices: state.notices }) as AdminState }));

export function checkPrerequisiteCycle(edges: AdminRecord[], from: string, to: string): string | null {
  if (!from || !to) return 'Chọn đủ hai kỹ năng.';
  if (from === to) return 'Một kỹ năng không thể là tiên quyết của chính nó.';
  const visited = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === from) return 'Quan hệ này sẽ tạo vòng lặp trong đồ thị tiên quyết.';
    if (visited.has(current)) continue;
    visited.add(current);
    edges.filter((edge) => edge._from === current).forEach((edge) => stack.push(String(edge._to || '')));
  }
  return null;
}

export function getCatalogSeed() { return catalog; }
