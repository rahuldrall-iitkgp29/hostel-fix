'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { createApiClient, type ApiClient } from '@/lib/api/client';
import { getConfiguredApiBaseUrl } from '@/lib/api/url';
import { loginUser, logoutUser, refreshSession } from '@/lib/api/auth';
import { createSessionStore, emptySession } from '../session-store';
import type { UserSelf, AuthResponse } from '../types';
import type { LoginFormData } from '../schemas';

type AuthContextValue = {
  user: UserSelf | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (data: LoginFormData) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
  updateUser: (user: UserSelf) => void;
  apiClient: ApiClient;
};
const AuthContext = createContext<AuthContextValue | null>(null);
function makeStore() {
  const baseUrl = getConfiguredApiBaseUrl();
  const publicClient = createApiClient({ baseUrl });
  const channel =
    typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('hostelfix-session')
      : null;
  const store = createSessionStore(
    {
      refresh: () => refreshSession(publicClient),
      login: (data) => loginUser(publicClient, data),
      logout: (token) =>
        logoutUser(createApiClient({ baseUrl, getAccessToken: () => token })),
    },
    {
      run: (work) =>
        typeof navigator !== 'undefined' && navigator.locks
          ? navigator.locks.request('hostelfix-session', work)
          : work(),
      broadcast: () => channel?.postMessage('logout'),
    }
  );
  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === 'logout') store.receiveLogout();
    };
  return store;
}
let browserStore: ReturnType<typeof makeStore> | undefined;
function getStore() {
  // Authenticated state is never shared between server-rendered requests.
  if (typeof window === 'undefined') return makeStore();
  return (browserStore ??= makeStore());
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const store = useMemo(() => getStore(), []);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => emptySession
  );
  const apiClient = useMemo(
    () =>
      createApiClient({
        baseUrl: getConfiguredApiBaseUrl(),
        getAccessToken: () => store.getSnapshot().accessToken,
        ensureAccessToken: store.ensureAccessToken,
        onUnauthorized: store.refresh,
      }),
    [store]
  );
  useEffect(() => {
    void store.initialize();
  }, [store]);
  const value: AuthContextValue = {
    ...snapshot,
    apiClient,
    login: store.login,
    refresh: store.refresh,
    updateUser: store.updateUser,
    logout: async () => {
      try {
        await store.logout();
      } finally {
        router.push('/login');
      }
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
