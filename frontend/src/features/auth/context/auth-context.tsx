"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createApiClient, type ApiClient } from "@/lib/api/client";
import { validateApiBaseUrl } from "@/lib/api/url";
import { loginUser, logoutUser, refreshSession } from "@/lib/api/auth";
import type { UserSelf, AuthResponse } from "../types";
import type { LoginFormData } from "../schemas";

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

let inMemoryAccessToken: string | null = null;
let inFlightRefreshPromise: Promise<string | null> | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

function clearRefreshTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function getBaseUrl(): string {
  return validateApiBaseUrl(
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api/v1"
  );
}

// Module-level unauthenticated client for refresh & login
const unauthClient = createApiClient({
  baseUrl: getBaseUrl(),
});

async function executeRefresh(): Promise<string | null> {
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  inFlightRefreshPromise = (async () => {
    try {
      const authData = await refreshSession(unauthClient);
      inMemoryAccessToken = authData.accessToken;
      clearRefreshTimer();
      const delaySeconds = Math.max(authData.expiresIn - 60, authData.expiresIn / 2);
      refreshTimer = setTimeout(() => {
        void executeRefresh();
      }, delaySeconds * 1000);
      return authData.accessToken;
    } catch {
      inMemoryAccessToken = null;
      clearRefreshTimer();
      return null;
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return inFlightRefreshPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserSelf | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    const token = await executeRefresh();
    setAccessToken(token);
    return token;
  }, []);

  const apiClient = useMemo(() => {
    return createApiClient({
      baseUrl: getBaseUrl(),
      getAccessToken: () => inMemoryAccessToken,
      onUnauthorized: executeRefresh,
    });
  }, []);

  const login = useCallback(
    async (data: LoginFormData): Promise<AuthResponse> => {
      const authData = await loginUser(unauthClient, data);
      inMemoryAccessToken = authData.accessToken;
      setAccessToken(authData.accessToken);
      setUser(authData.user);
      clearRefreshTimer();
      const delaySeconds = Math.max(authData.expiresIn - 60, authData.expiresIn / 2);
      refreshTimer = setTimeout(() => {
        void executeRefresh();
      }, delaySeconds * 1000);
      return authData;
    },
    []
  );

  const logout = useCallback(async () => {
    clearRefreshTimer();
    inMemoryAccessToken = null;
    try {
      await logoutUser(apiClient);
    } catch {
      // Ignore network errors on logout
    } finally {
      setAccessToken(null);
      setUser(null);
      router.push("/login");
    }
  }, [apiClient, router]);

  const updateUser = useCallback((updated: UserSelf) => {
    setUser(updated);
  }, []);

  // Initial session check
  useEffect(() => {
    let mounted = true;
    void refreshSession(unauthClient)
      .then((authData) => {
        if (!mounted) return;
        inMemoryAccessToken = authData.accessToken;
        setAccessToken(authData.accessToken);
        setUser(authData.user);
        clearRefreshTimer();
        const delaySeconds = Math.max(authData.expiresIn - 60, authData.expiresIn / 2);
        refreshTimer = setTimeout(() => {
          void executeRefresh();
        }, delaySeconds * 1000);
      })
      .catch(() => {
        if (!mounted) return;
        inMemoryAccessToken = null;
        setAccessToken(null);
        setUser(null);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isLoading,
      login,
      logout,
      refresh,
      updateUser,
      apiClient,
    }),
    [user, accessToken, isLoading, login, logout, refresh, updateUser, apiClient]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
