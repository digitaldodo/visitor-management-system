import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { apiConfig } from '../api/apiConfig';
import { configureApiClient } from '../api/apiClient';
import { normalizeApiError } from '../api/error';
import { login as loginRequest, logout as logoutRequest, restoreSession } from '../services/authService';
import { getApiVersions } from '../services/systemService';
import {
  clearPersistedSession,
  clearRuntimeSnapshot,
  readPersistedSession,
  readRuntimeSnapshot,
  writePersistedSession,
  writeRuntimeSnapshot,
} from '../storage/sessionStorage';
import type { AuthBootstrapState, AuthSession, LoginPayload } from '../types/auth';

type AuthContextValue = AuthBootstrapState & {
  isBusy: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const initialState: AuthBootstrapState = {
  status: 'bootstrapping',
  session: null,
  recovery: null,
  lastError: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthBootstrapState>(initialState);
  const [isBusy, setIsBusy] = useState(false);
  const sessionRef = useRef<AuthSession | null>(null);

  const persistAuthenticatedSession = useCallback(async (session: AuthSession) => {
    sessionRef.current = session;
    await writePersistedSession(session);
    setState({
      status: 'authenticated',
      session,
      recovery: null,
      lastError: null,
    });
  }, []);

  const clearSessionState = useCallback(async (reason?: string) => {
    sessionRef.current = null;
    await clearPersistedSession();
    setState({
      status: 'signed-out',
      session: null,
      recovery: null,
      lastError: reason ?? null,
    });
  }, []);

  const updateRuntimeSnapshot = useCallback(async (apiVersion?: string) => {
    await writeRuntimeSnapshot({
      apiBaseUrl: apiConfig.apiBaseUrl,
      appVersion: apiConfig.appVersion,
      runtimeVersion: apiConfig.runtimeVersion,
      apiVersion,
      checkedAt: new Date().toISOString(),
    });
  }, []);

  const bootstrap = useCallback(async () => {
    setState({
      status: 'bootstrapping',
      session: null,
      recovery: null,
      lastError: null,
    });

    if (!apiConfig.isConfigured) {
      await clearPersistedSession();
      setState({
        status: 'recovery',
        session: null,
        recovery: {
          reason: 'config-missing',
          message: 'Set EXPO_PUBLIC_ACCESSFLOW_API_BASE_URL before launching the app.',
        },
        lastError: 'The mobile API base URL is missing.',
      });
      return;
    }

    const persistedSession = await readPersistedSession();
    if (!persistedSession) {
      await updateRuntimeSnapshot();
      setState({
        status: 'signed-out',
        session: null,
        recovery: null,
        lastError: null,
      });
      return;
    }

    try {
      sessionRef.current = persistedSession;
      const previousRuntime = await readRuntimeSnapshot();
      const versions = await withTimeout(getApiVersions(), 8_000, 'Version handshake timed out.');
      const runtimeChanged =
        !previousRuntime
        || previousRuntime.apiBaseUrl !== apiConfig.apiBaseUrl
        || previousRuntime.appVersion !== apiConfig.appVersion
        || previousRuntime.runtimeVersion !== apiConfig.runtimeVersion
        || previousRuntime.apiVersion !== versions.current;

      if (!versions.supported.includes('v1')) {
        throw new Error('The backend no longer advertises AccessFlow v1 support.');
      }

      const session = await withTimeout(
        restoreSession(persistedSession, { forceRefresh: runtimeChanged }),
        12_000,
        'Session restore timed out.',
      );

      await updateRuntimeSnapshot(versions.current);
      await persistAuthenticatedSession(session);
    } catch (error) {
      const normalizedError = normalizeApiError(error);
      if (normalizedError.status === 401 || normalizedError.status === 403) {
        await clearSessionState('Your previous session is no longer valid. Sign in again.');
        return;
      }

      setState({
        status: 'recovery',
        session: persistedSession,
        recovery: {
          reason: normalizedError.kind,
          message: normalizedError.message,
        },
        lastError: normalizedError.message,
      });
    }
  }, [clearSessionState, persistAuthenticatedSession, updateRuntimeSnapshot]);

  useEffect(() => {
    configureApiClient({
      getSession: () => sessionRef.current,
      onSessionUpdate: async (session) => {
        await persistAuthenticatedSession(session);
      },
      onSessionExpired: async (reason) => {
        await clearRuntimeSnapshot();
        await clearSessionState(reason);
      },
    });
  }, [clearSessionState, persistAuthenticatedSession]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      setIsBusy(true);
      try {
        const session = await loginRequest(payload);
        await persistAuthenticatedSession(session);
        await updateRuntimeSnapshot('v1');
      } finally {
        setIsBusy(false);
      }
    },
    [persistAuthenticatedSession, updateRuntimeSnapshot],
  );

  const logout = useCallback(async () => {
    setIsBusy(true);
    try {
      await logoutRequest(sessionRef.current);
    } finally {
      await clearRuntimeSnapshot();
      await clearSessionState();
      setIsBusy(false);
    }
  }, [clearSessionState]);

  const retryBootstrap = useCallback(async () => {
    setIsBusy(true);
    try {
      await bootstrap();
    } finally {
      setIsBusy(false);
    }
  }, [bootstrap]);

  const refreshSessionState = useCallback(async () => {
    const persistedSession = sessionRef.current ?? (await readPersistedSession());
    if (!persistedSession) {
      return;
    }

    setIsBusy(true);
    try {
      const session = await restoreSession(persistedSession, { forceRefresh: false });
      await persistAuthenticatedSession(session);
    } finally {
      setIsBusy(false);
    }
  }, [persistAuthenticatedSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isBusy,
      login,
      logout,
      retryBootstrap,
      refreshSession: refreshSessionState,
    }),
    [state, isBusy, login, logout, retryBootstrap, refreshSessionState],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
