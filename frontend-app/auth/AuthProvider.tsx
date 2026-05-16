import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { apiConfig } from '../api/apiConfig';
import { configureApiClient } from '../api/apiClient';
import { createAppError, normalizeApiError } from '../api/error';
import { resetNavigationToAuth, resetNavigationToRoleHome } from '../navigation/navigationRef';
import { recordDiagnosticEvent } from '../runtime/diagnostics';
import { login as loginRequest, logout as logoutRequest, restoreSession } from '../services/authService';
import { getApiVersions } from '../services/systemService';
import {
  clearPersistedSession,
  clearRuntimeSnapshot,
  clearSessionLockState,
  readPersistedSession,
  readRuntimeSnapshot,
  writePersistedSession,
  writeRuntimeSnapshot,
} from '../storage/sessionStorage';
import type { AppError } from '../types/api';
import type { AuthBootstrapState, AuthSession, LoginPayload } from '../types/auth';
import type { VersionHandshakePayload } from '../types/runtime';

type AuthContextValue = AuthBootstrapState & {
  isBusy: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
  refreshSession: () => Promise<void>;
  recoverAppShell: () => Promise<void>;
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
  const isMountedRef = useRef(true);
  const sessionRef = useRef<AuthSession | null>(null);

  const setStateSafely = useCallback((nextState: AuthBootstrapState) => {
    if (isMountedRef.current) {
      setState(nextState);
    }
  }, []);

  const persistAuthenticatedSession = useCallback(
    async (session: AuthSession, versions?: VersionHandshakePayload | null) => {
      sessionRef.current = session;
      await writePersistedSession(session);
      await writeRuntimeSnapshot({
        apiBaseUrl: apiConfig.apiBaseUrl,
        appVersion: apiConfig.appVersion,
        runtimeVersion: apiConfig.runtimeVersion,
        buildId: apiConfig.buildId,
        environment: apiConfig.environment,
        releaseChannel: apiConfig.releaseChannel,
        distributionChannel: apiConfig.distributionChannel,
        apiVersion: versions?.current,
        backendProfile: versions?.profile,
        minimumAppVersion: versions?.minimumAppVersion ?? null,
        minimumRuntimeVersion: versions?.minimumRuntimeVersion ?? null,
        checkedAt: new Date().toISOString(),
      });
      await clearSessionLockState();

      setStateSafely({
        status: 'authenticated',
        session,
        recovery: null,
        lastError: null,
      });
    },
    [setStateSafely],
  );

  const clearSessionState = useCallback(
    async (reason?: string) => {
      sessionRef.current = null;
      await Promise.all([
        clearPersistedSession(),
        clearRuntimeSnapshot(),
        clearSessionLockState(),
      ]);
      setStateSafely({
        status: 'signed-out',
        session: null,
        recovery: null,
        lastError: reason ?? null,
      });
    },
    [setStateSafely],
  );

  const showRecoveryState = useCallback(
    async (input: { session: AuthSession | null; reason: string; message: string; diagnosticCode: string }) => {
      await recordDiagnosticEvent({
        level: input.reason === 'network' ? 'warn' : 'error',
        scope: 'auth',
        code: input.diagnosticCode,
        message: input.message,
        context: {
          hasSession: Boolean(input.session),
          reason: input.reason,
        },
      });

      setStateSafely({
        status: 'recovery',
        session: input.session,
        recovery: {
          reason: input.reason,
          message: input.message,
        },
        lastError: input.message,
      });
    },
    [setStateSafely],
  );

  const bootstrap = useCallback(async () => {
    setStateSafely(initialState);

    if (!apiConfig.isConfigured) {
      await Promise.all([clearPersistedSession(), clearRuntimeSnapshot(), clearSessionLockState()]);
      await showRecoveryState({
        session: null,
        reason: 'config-missing',
        message: 'Set EXPO_PUBLIC_ACCESSFLOW_API_BASE_URL before launching the app.',
        diagnosticCode: 'MOBILE_CONFIG_MISSING',
      });
      return;
    }

    const persistedSession = await readPersistedSession();
    if (!persistedSession) {
      await clearSessionLockState();
      await writeRuntimeSnapshot({
        apiBaseUrl: apiConfig.apiBaseUrl,
        appVersion: apiConfig.appVersion,
        runtimeVersion: apiConfig.runtimeVersion,
        buildId: apiConfig.buildId,
        environment: apiConfig.environment,
        releaseChannel: apiConfig.releaseChannel,
        distributionChannel: apiConfig.distributionChannel,
        checkedAt: new Date().toISOString(),
      });
      setStateSafely({
        status: 'signed-out',
        session: null,
        recovery: null,
        lastError: null,
      });
      return;
    }

    if (!isValidSessionSnapshot(persistedSession)) {
      await Promise.all([clearPersistedSession(), clearRuntimeSnapshot(), clearSessionLockState()]);
      await showRecoveryState({
        session: null,
        reason: 'corrupted-session',
        message: 'The saved mobile session became unreadable and was cleared for safety. Sign in again.',
        diagnosticCode: 'CORRUPTED_SESSION_SNAPSHOT',
      });
      return;
    }

    try {
      sessionRef.current = persistedSession;
      const previousRuntime = await readRuntimeSnapshot();
      const versions = await withTimeout(getApiVersions(), 8_000, 'Version handshake timed out.');
      ensureVersionSupport(versions);

      const runtimeChanged =
        !previousRuntime
        || previousRuntime.apiBaseUrl !== apiConfig.apiBaseUrl
        || previousRuntime.appVersion !== apiConfig.appVersion
        || previousRuntime.runtimeVersion !== apiConfig.runtimeVersion
        || previousRuntime.buildId !== apiConfig.buildId
        || previousRuntime.environment !== apiConfig.environment
        || previousRuntime.releaseChannel !== apiConfig.releaseChannel
        || previousRuntime.distributionChannel !== apiConfig.distributionChannel
        || previousRuntime.apiVersion !== versions.current
        || previousRuntime.backendProfile !== versions.profile;

      const session = await withTimeout(
        restoreSession(persistedSession, { forceRefresh: runtimeChanged }),
        12_000,
        'Session restore timed out.',
      );

      await persistAuthenticatedSession(session, versions);
    } catch (error) {
      const normalizedError = normalizeApiError(error);
      if (normalizedError.kind === 'auth' || normalizedError.status === 401 || normalizedError.status === 403) {
        await clearSessionState('Your previous session is no longer valid. Sign in again.');
        return;
      }

      await showRecoveryState({
        session: persistedSession,
        reason: normalizedError.kind,
        message: normalizedError.message,
        diagnosticCode: 'SESSION_BOOTSTRAP_FAILED',
      });
    }
  }, [clearSessionState, persistAuthenticatedSession, setStateSafely, showRecoveryState]);

  useEffect(() => {
    configureApiClient({
      getSession: () => sessionRef.current,
      onSessionUpdate: async (session) => {
        await persistAuthenticatedSession(session);
      },
      onSessionExpired: async (reason) => {
        await recordDiagnosticEvent({
          level: 'warn',
          scope: 'auth',
          code: 'SESSION_EXPIRED',
          message: reason,
          context: {
            hadSession: Boolean(sessionRef.current),
          },
        });
        await clearSessionState(reason);
        resetNavigationToAuth();
      },
    });
  }, [clearSessionState, persistAuthenticatedSession]);

  useEffect(() => {
    void bootstrap();

    return () => {
      isMountedRef.current = false;
    };
  }, [bootstrap]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      setIsBusy(true);
      try {
        const session = await loginRequest(payload);
        await persistAuthenticatedSession(session);
        resetNavigationToRoleHome(session.user.activeRole);
      } catch (error) {
        const normalizedError = normalizeApiError(error);
        await recordDiagnosticEvent({
          level: normalizedError.kind === 'network' ? 'warn' : 'error',
          scope: 'auth',
          code: 'LOGIN_FAILED',
          message: normalizedError.message,
          context: {
            audience: payload.audience,
            status: normalizedError.status ?? null,
          },
        });
        throw normalizedError;
      } finally {
        setIsBusy(false);
      }
    },
    [persistAuthenticatedSession],
  );

  const logout = useCallback(async () => {
    setIsBusy(true);
    try {
      await logoutRequest(sessionRef.current);
    } finally {
      await clearSessionState();
      resetNavigationToAuth();
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
    if (!persistedSession || !isValidSessionSnapshot(persistedSession)) {
      await clearSessionState('The saved session could not be recovered.');
      return;
    }

    setIsBusy(true);
    try {
      const versions = await getApiVersions().catch(() => null);
      if (versions) {
        ensureVersionSupport(versions);
      }
      const session = await restoreSession(persistedSession, { forceRefresh: false });
      await persistAuthenticatedSession(session, versions);
    } catch (error) {
      const normalizedError = normalizeApiError(error);
      if (normalizedError.kind === 'auth') {
        await clearSessionState('Your session expired and must be restarted.');
        resetNavigationToAuth();
        return;
      }

      await showRecoveryState({
        session: persistedSession,
        reason: normalizedError.kind,
        message: normalizedError.message,
        diagnosticCode: 'SESSION_REFRESH_FAILED',
      });
      throw normalizedError;
    } finally {
      setIsBusy(false);
    }
  }, [clearSessionState, persistAuthenticatedSession, showRecoveryState]);

  const recoverAppShell = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (currentSession?.user.activeRole) {
      resetNavigationToRoleHome(currentSession.user.activeRole);
    }

    await bootstrap();
  }, [bootstrap]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isBusy,
      login,
      logout,
      retryBootstrap,
      refreshSession: refreshSessionState,
      recoverAppShell,
    }),
    [state, isBusy, login, logout, retryBootstrap, refreshSessionState, recoverAppShell],
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

function isValidSessionSnapshot(session: AuthSession): session is AuthSession {
  return Boolean(
    session
    && typeof session.accessToken === 'string'
    && typeof session.refreshToken === 'string'
    && typeof session.tokenType === 'string'
    && typeof session.expiresAt === 'string'
    && typeof session.audience === 'string'
    && session.user
    && typeof session.user.id === 'string'
    && typeof session.user.activeRole === 'string'
    && Array.isArray(session.user.roles),
  );
}

function ensureVersionSupport(versions: VersionHandshakePayload) {
  if (!versions.supported.includes('v1')) {
    throw createAppError({
      kind: 'version',
      message: 'This mobile runtime is no longer supported by the backend. Update the app before continuing.',
      recoverable: false,
    } satisfies Partial<AppError> & Pick<AppError, 'kind' | 'message'>);
  }

  if (versions.minimumRuntimeVersion && compareVersionStrings(apiConfig.runtimeVersion, versions.minimumRuntimeVersion) < 0) {
    throw createAppError({
      kind: 'version',
      message: `This build is older than the minimum supported runtime (${versions.minimumRuntimeVersion}). Update the app and sign in again.`,
      recoverable: false,
    });
  }

  if (versions.minimumAppVersion && compareVersionStrings(apiConfig.appVersion, versions.minimumAppVersion) < 0) {
    throw createAppError({
      kind: 'version',
      message: `App version ${apiConfig.appVersion} is below the minimum supported release (${versions.minimumAppVersion}). Update AccessFlow before continuing.`,
      recoverable: false,
    });
  }
}

function compareVersionStrings(left: string, right: string) {
  const leftParts = left.split(/[^\d]+/).filter(Boolean).map(Number);
  const rightParts = right.split(/[^\d]+/).filter(Boolean).map(Number);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
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
