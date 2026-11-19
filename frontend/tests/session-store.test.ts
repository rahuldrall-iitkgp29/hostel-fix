import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore } from '../src/features/auth/session-store';
import type { AuthResponse } from '../src/features/auth/types';

const account: AuthResponse = {
  user: {
    id: 'student',
    name: 'Student',
    email: 'student@example.test',
    role: 'STUDENT',
    status: 'ACTIVE',
    mustChangePassword: false,
    version: 1,
  },
  accessToken: 'initial',
  expiresIn: 600,
};
const credentials = {
  email: account.user.email,
  password: 'ExamplePassword123',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(() => vi.useRealTimers());
describe('session state and races', () => {
  it('coalesces Strict Mode initialization and simultaneous refreshes', async () => {
    const pending = deferred<AuthResponse>();
    const refresh = vi.fn(() => pending.promise);
    const store = createSessionStore({
      refresh,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const calls = [store.initialize(), store.initialize(), store.refresh()];
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    pending.resolve(account);
    expect(await Promise.all(calls)).toEqual(['initial', 'initial', 'initial']);
    await store.initialize();
    expect(refresh).toHaveBeenCalledTimes(1);
    store.dispose();
  });
  it('publishes scheduled refresh to context subscribers and API token consumers', async () => {
    vi.useFakeTimers();
    const refresh = vi
      .fn()
      .mockResolvedValue({ ...account, accessToken: 'rotated' });
    const store = createSessionStore({
      refresh,
      login: vi.fn().mockResolvedValue(account),
      logout: vi.fn(),
    });
    const listener = vi.fn();
    store.subscribe(listener);
    await store.login(credentials);
    await vi.advanceTimersByTimeAsync(540_000);
    expect(store.getSnapshot().accessToken).toBe('rotated');
    expect(await store.ensureAccessToken()).toBe('rotated');
    expect(listener).toHaveBeenCalledTimes(2);
    store.dispose();
  });
  it('clears the user and token together on refresh failure', async () => {
    const store = createSessionStore({
      refresh: vi.fn().mockRejectedValue(new Error('revoked')),
      login: vi.fn().mockResolvedValue(account),
      logout: vi.fn(),
    });
    await store.login(credentials);
    await store.refresh();
    expect(store.getSnapshot()).toEqual({
      user: null,
      accessToken: null,
      isLoading: false,
    });
    store.dispose();
  });
  it('waits for cookie rotation before logout and suppresses its stale response', async () => {
    const pending = deferred<AuthResponse>();
    const logout = vi.fn().mockResolvedValue(undefined);
    const store = createSessionStore({
      refresh: () => pending.promise,
      login: vi.fn().mockResolvedValue(account),
      logout,
    });
    await store.login(credentials);
    const rotating = store.refresh();
    await Promise.resolve();
    const leaving = store.logout();
    expect(store.getSnapshot().user).toBeNull();
    expect(logout).not.toHaveBeenCalled();
    pending.resolve({ ...account, accessToken: 'late' });
    await Promise.all([rotating, leaving]);
    expect(logout).toHaveBeenCalledWith('initial');
    expect(store.getSnapshot().accessToken).toBeNull();
    store.dispose();
  });
  it('ignores a late login or refresh after a logout broadcast', async () => {
    const pending = deferred<AuthResponse>();
    const store = createSessionStore({
      refresh: () => pending.promise,
      login: () => pending.promise,
      logout: vi.fn(),
    });
    const login = store.login(credentials);
    await Promise.resolve();
    store.receiveLogout();
    pending.resolve(account);
    await expect(login).rejects.toThrow('cancelled');
    expect(store.getSnapshot().user).toBeNull();
    store.dispose();
  });
  it('does not refresh a cookie again after logout until an explicit login', async () => {
    const refresh = vi.fn().mockResolvedValue(account);
    const store = createSessionStore({
      refresh,
      login: vi.fn().mockResolvedValue(account),
      logout: vi.fn().mockResolvedValue(undefined),
    });
    await store.login(credentials);
    await store.logout();
    expect(await store.refresh()).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    await store.login(credentials);
    await store.refresh();
    expect(refresh).toHaveBeenCalledTimes(1);
    store.dispose();
  });
  it('serializes refresh and login even without browser locks', async () => {
    const pending = deferred<AuthResponse>();
    const login = vi
      .fn()
      .mockResolvedValue({ ...account, accessToken: 'login' });
    const store = createSessionStore({
      refresh: () => pending.promise,
      login,
      logout: vi.fn(),
    });
    const rotation = store.refresh();
    await Promise.resolve();
    const signingIn = store.login(credentials);
    expect(login).not.toHaveBeenCalled();
    pending.resolve({ ...account, accessToken: 'old-refresh' });
    await Promise.all([rotation, signingIn]);
    expect(store.getSnapshot().accessToken).toBe('login');
    store.dispose();
  });
});
