import type { AuthResponse, UserSelf } from './types';
import type { LoginFormData } from './schemas';

export type SessionSnapshot = {
  user: UserSelf | null;
  accessToken: string | null;
  isLoading: boolean;
};
export const emptySession: SessionSnapshot = {
  user: null,
  accessToken: null,
  isLoading: true,
};
type Transport = {
  refresh: () => Promise<AuthResponse>;
  login: (data: LoginFormData) => Promise<AuthResponse>;
  logout: (token: string | null) => Promise<void>;
};
type Coordination = {
  run: <T>(work: () => Promise<T>) => Promise<T>;
  broadcast?: (event: 'logout') => void;
};

// One observable snapshot supplies React and API requests. Cookie rotation must
// finish before logout: aborting it could discard a committed replacement cookie.
export function createSessionStore(
  transport: Transport,
  coordination: Coordination = { run: (work) => work() }
) {
  let snapshot = emptySession;
  let generation = 0;
  let initialized = false;
  let refreshAllowed = true;
  let expiresAt = 0;
  let refreshPromise: Promise<string | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const subscribers = new Set<() => void>();
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(() => coordination.run(work));
    queue = result.catch(() => undefined);
    return result;
  };
  const publish = (next: SessionSnapshot) => {
    snapshot = next;
    subscribers.forEach((listener) => listener());
  };
  function clear() {
    clearTimeout(timer);
    expiresAt = 0;
    initialized = true;
    publish({ user: null, accessToken: null, isLoading: false });
  }
  function accept(data: AuthResponse) {
    initialized = true;
    expiresAt = Date.now() + data.expiresIn * 1000;
    publish({
      user: data.user,
      accessToken: data.accessToken,
      isLoading: false,
    });
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        void refresh();
      },
      Math.max(1, data.expiresIn - 60) * 1000
    );
  }
  function refresh(): Promise<string | null> {
    if (!refreshAllowed) return Promise.resolve(null);
    if (refreshPromise) return refreshPromise;
    const current = generation;
    refreshPromise = run(async () => {
      if (current !== generation) return null;
      try {
        const data = await transport.refresh();
        if (current !== generation) return null;
        accept(data);
        return data.accessToken;
      } catch {
        if (current === generation) clear();
        return null;
      }
    }).finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    initialize: () =>
      initialized ? Promise.resolve(snapshot.accessToken) : refresh(),
    refresh,
    async ensureAccessToken() {
      if (snapshot.accessToken && Date.now() >= expiresAt - 60_000)
        return refresh();
      return snapshot.accessToken;
    },
    async login(data: LoginFormData) {
      const current = ++generation;
      refreshAllowed = true;
      clearTimeout(timer);
      return run(async () => {
        const result = await transport.login(data);
        if (current !== generation) throw new Error('Sign-in was cancelled.');
        accept(result);
        return result;
      });
    },
    async logout() {
      const token = snapshot.accessToken;
      generation += 1;
      refreshAllowed = false;
      clear();
      coordination.broadcast?.('logout');
      await refreshPromise;
      await run(() => transport.logout(token));
    },
    receiveLogout() {
      generation += 1;
      refreshAllowed = false;
      clear();
    },
    updateUser(user: UserSelf) {
      publish({ ...snapshot, user });
    },
    dispose() {
      generation += 1;
      clearTimeout(timer);
      subscribers.clear();
    },
  };
}
