import { useEffect, useState } from 'react';
import { apiRequest, apiRequestWithResponse } from './http';

export type ApiState<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void };
type PageEnvelope<T> = T[] | { items?: T[]; total?: number };
const pageItems = <T,>(payload: PageEnvelope<T>): T[] => Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];

export function useApiData<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!path) { setData(null); setLoading(false); setError(null); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(null);
    apiRequest<T>(path, { signal: controller.signal }).then((value) => { if (active) setData(value); }).catch((reason) => {
      if (active && !(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : 'Không tải được dữ liệu từ Backend.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [path, generation]);
  return { data, loading, error, reload: () => setGeneration((value) => value + 1) };
}

export async function apiRequestAllPages<T>(path: string, pageSize = 100, signal?: AbortSignal): Promise<T[]> {
  const suffix = path.includes('?') ? '&' : '?';
  const first = await apiRequestWithResponse<PageEnvelope<T>>(`${path}${suffix}page=1&pageSize=${pageSize}`, { signal });
  const rows = [...pageItems(first.data)];
  const total = Number(first.headers.get('X-Total-Count') || (!Array.isArray(first.data) ? first.data.total : undefined) || rows.length);
  const pageCount = Math.ceil(total / pageSize);
  for (let start = 2; start <= pageCount; start += 5) {
    const pages = Array.from({ length: Math.min(5, pageCount - start + 1) }, (_, index) => start + index);
    const batch = await Promise.all(pages.map((page) => apiRequest<PageEnvelope<T>>(`${path}${suffix}page=${page}&pageSize=${pageSize}`, { signal })));
    batch.forEach((payload) => rows.push(...pageItems(payload)));
  }
  return rows;
}

export function useApiPages<T>(path: string | null): ApiState<T[]> {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!path) { setData(null); setLoading(false); setError(null); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(null);
    apiRequestAllPages<T>(path, 100, controller.signal).then((value) => { if (active) setData(value); }).catch((reason) => {
      if (active && !(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : 'Không tải được dữ liệu từ Backend.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [path, generation]);
  return { data, loading, error, reload: () => setGeneration((value) => value + 1) };
}
