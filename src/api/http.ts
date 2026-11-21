export type ApiErrorBody = { error?: { code?: string; message?: string } };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiResponse<T> = { data: T; headers: Headers; status: number };

function apiUrl(path: string) {
  const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

export async function apiRequestWithResponse<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...init, headers, credentials: 'include' });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được Backend Node.js.');
    }
    throw error;
  }
  let body: unknown = null;
  if (response.status !== 204) {
    try { body = await response.json(); } catch { body = null; }
  }
  const protectedPath = `/${path.replace(/^\/+/, '').split('?')[0]}`;
  if (response.status === 401 && (/^\/(me|admin)(\/|$)/.test(protectedPath) || protectedPath === "/auth/change-password")) {
    window.dispatchEvent(new CustomEvent('skillgraph:unauthorized', { detail: { path } }));
  }
  if (!response.ok) {
    const error = body as ApiErrorBody | null;
    throw new ApiError(response.status, error?.error?.code || 'HTTP_ERROR', error?.error?.message || `Yêu cầu API thất bại (${response.status}).`);
  }
  return { data: body as T, headers: response.headers, status: response.status };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await apiRequestWithResponse<T>(path, init)).data;
}

export function apiJson(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', value?: unknown): RequestInit {
  return { method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) };
}
