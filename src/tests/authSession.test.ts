import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/http';
import { isUnauthorizedSessionError, type AuthUser } from '../features/auth/AuthProvider';
import { resolveAdminGateState } from '../features/admin/components/AdminLayout';

const admin: AuthUser = { id: 'a1', name: 'Admin', displayName: 'Admin', email: 'admin@example.test', role: 'admin', status: 'active' };

describe('transient authentication errors', () => {
  it('clears the session only for an HTTP 401', () => {
    expect(isUnauthorizedSessionError(new ApiError(401, 'UNAUTHENTICATED', 'expired'))).toBe(true);
    expect(isUnauthorizedSessionError(new ApiError(503, 'UNAVAILABLE', 'down'))).toBe(false);
    expect(isUnauthorizedSessionError(new ApiError(0, 'NETWORK_ERROR', 'offline'))).toBe(false);
    expect(isUnauthorizedSessionError(new Error('temporary failure'))).toBe(false);
  });

  it('keeps a known Admin inside Admin routes during a transient refresh error', () => {
    expect(resolveAdminGateState(admin, false, 'Backend unavailable')).toBe('allow');
  });

  it('offers retry when no session could be checked because the Backend failed', () => {
    expect(resolveAdminGateState(null, false, 'Backend unavailable')).toBe('retry');
  });
});