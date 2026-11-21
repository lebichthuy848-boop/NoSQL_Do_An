import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiRequest, ApiError } from '../../api/http';
import { useUserStore } from '../../stores/userStore';

export type AuthUser = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  role: 'admin' | 'user';
  status: string;
  createdAt?: string;
};
type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  completePasswordChange: () => void;
  passwordChangedNotice: boolean;
  clearPasswordChangedNotice: () => void;
  updateDisplayName: (displayName: string) => Promise<AuthUser>;
};
const AuthContext = createContext<AuthState | null>(null);

export function isUnauthorizedSessionError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function normalizeUser(value: unknown): AuthUser {
  if (!value || typeof value !== 'object') throw new Error('API không trả về thông tin tài khoản hợp lệ.');
  const user = value as Record<string, unknown>;
  const displayName = String(user.displayName || user.name || user.email || '').trim();
  if (!user.id || !displayName || (user.role !== 'admin' && user.role !== 'user')) {
    throw new Error('API không trả về thông tin tài khoản hợp lệ.');
  }
  return {
    id: String(user.id),
    name: displayName,
    displayName,
    email: String(user.email || ''),
    role: user.role,
    status: String(user.status || 'active'),
    ...(typeof user.createdAt === 'string' ? { createdAt: user.createdAt } : {}),
  };
}

export async function authRequest<T>(path: string, data?: unknown): Promise<T> {
  const normalized = path.replace(/^\/+/, '').replace(/^api\/v1\//, '');
  const endpoint = /^(auth\/|admin\/|me(?:\/|$))/.test(normalized) ? `/${normalized}` : `/auth/${normalized}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  try {
    return await apiRequest<T>(endpoint, {
      method: data === undefined ? 'GET' : 'POST',
      signal: controller.signal,
      ...(data === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Yêu cầu hết thời gian chờ. Hãy kiểm tra Backend rồi thử lại.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [passwordChangedNotice, setPasswordChangedNotice] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<unknown>('/auth/me');
      setUser(normalizeUser(result));
      setError('');
    } catch (cause) {
      if (isUnauthorizedSessionError(cause)) {
        setUser(null);
        setError('');
      } else {
        setError(cause instanceof Error ? cause.message : 'Không thể kiểm tra phiên đăng nhập.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sync = () => { if (document.visibilityState === 'visible') void refresh(); };
    const unauthorized = () => { void refresh(); };
    window.addEventListener('focus', sync);
    window.addEventListener('skillgraph:unauthorized', unauthorized);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('skillgraph:unauthorized', unauthorized);
    };
  }, [refresh]);

  useEffect(() => {
    if (user?.role === 'user') void useUserStore.getState().hydrate();
    else useUserStore.getState().clear();
  }, [user?.id, user?.role]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authRequest<{ user: unknown }>('/auth/login', { email, password });
    const loggedIn = normalizeUser(result.user);
    setUser(loggedIn);
    setError('');
    return loggedIn;
  }, []);

  const updateDisplayName = useCallback(async (displayName: string) => {
    const result = await apiRequest<unknown>('/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    });
    const updated = normalizeUser(result);
    setUser(updated);
    setError('');
    return updated;
  }, []);
  const logout = useCallback(async () => {
    await authRequest('/auth/logout', {});
    setUser(null);
    setError('');
    useUserStore.getState().clear();
  }, []);
  const completePasswordChange = useCallback(() => {
    setUser(null);
    setError('');
    setPasswordChangedNotice(true);
    useUserStore.getState().clear();
  }, []);
  const clearPasswordChangedNotice = useCallback(() => setPasswordChangedNotice(false), []);

  return <AuthContext.Provider value={{ user, loading, error, refresh, login, logout, completePasswordChange, passwordChangedNotice, clearPasswordChangedNotice, updateDisplayName }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider is required');
  return auth;
}
