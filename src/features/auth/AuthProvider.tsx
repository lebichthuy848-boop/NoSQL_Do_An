import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type AuthUser = { id: string; name: string; email?: string | null; username?: string | null; role: 'admin' | 'user' };
type AuthState = {
  user: AuthUser | null; loading: boolean; error: string;
  refresh: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);

export async function authRequest<T>(path: string, data?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`/api/auth/${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-SkillGraph-Client': 'web' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    let body;
    try { body = await response.json(); }
    catch { throw new Error('API xác thực chưa hoạt động. Hãy chạy npm run auth:dev và kiểm tra cấu hình proxy.'); }
    if (!response.ok) {
      if (response.status === 401 && path === 'me') return { user: null } as T;
      throw new Error(body.message || 'Không thể thực hiện yêu cầu.');
    }
    return body as T;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new Error('Không kết nối được máy chủ xác thực. Vui lòng thử lại sau.');
    }
    throw error;
  } finally { window.clearTimeout(timeout); }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function refresh() {
    setLoading(true);
    try {
      const result = await authRequest<{ user: AuthUser | null }>('me');
      setUser(result.user); setError('');
    } catch (e) { setUser(null); setError(e instanceof Error ? e.message : 'Không thể tải phiên đăng nhập.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const sync = () => { void refresh(); };
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);
  async function login(identifier: string, password: string) {
    const result = await authRequest<{ user: AuthUser }>('login', { email: identifier, password });
    setUser(result.user); setError('');
    return result.user;
  }
  async function logout() {
    await authRequest('logout', {});
    setUser(null); setError('');
  }
  return <AuthContext.Provider value={{ user, loading, error, refresh, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider is required');
  return auth;
}
