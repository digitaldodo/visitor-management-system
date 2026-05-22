import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { apiConfig } from '../api/apiConfig';
import { configureApiClient } from '../api/apiClient';
import { createAppError, normalizeApiError, sanitizeUserFacingErrorMessage } from '../api/error';
import { resetNavigationToAuth, resetNavigationToRoleHome } from '../navigation/navigationRef';
import { recordDiagnosticEvent } from '../runtime/diagnostics';
import { clearFirebaseUserContext, recordFirebaseError, setFirebaseUserContext, trackFirebaseEvent } from '../runtime/firebaseRuntime';
import { login as loginRequest, logout as logoutRequest, restoreSession } from '../services/authService';
import { getApiVersions } from '../services/systemService';
import {
  clearPersistedSession,
  clearRuntimeSnapshot,
  clearSessionLockState,
  isSecureSessionCorruption,
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
  recoverRuntimeSession: (options?: RuntimeRecoveryOptions) => Promise<boolean>;
  recoverAppShell: () => Promise<void>;
};

type RuntimeRecoveryOptions = {
  trigger?: 'bootstrap' | 'manual' | 'resume' | 'shell';
  forceRefresh?: boolean;
  failClosed?: boolean;
  silent?: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const initialState: AuthBootstrapState = {
  status: 'bootstrapping',
  session: null,
  lastError: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthBootstrapState>(initialState);
  const [isBusy, setIsBusy] = useState(false);
  const isMountedRef = useRef(true);
  const sessionRef = useRef<AuthSession | null>(null);
  const persistSessionRef = useRef(false);
  const runtimeRecoveryPromiseRef = useRef<Promise<boolean> | null>(null);
  const logoutPromiseRef = useRef<Promise<void> | null>(null);

  const setStateSafely = useCallback((nextState: AuthBootstrapState) => {
    if (isMountedRef.current) {
      setState(nextState);
    }
  }, []);

  const persistAuthenticatedSession = useCallback(
    async (
      session: AuthSession,
      versions?: VersionHandshakePayload | null,
      options?: { persistSession?: boolean },
    ) => {
      const shouldPersist = options?.persistSession ?? persistSessionRef.current;
      persistSessionRef.current = shouldPersist;
      sessionRef.current = session;
      if (shouldPersist) {
        await writePersistedSession(session);
      } else {
        await clearPersistedSession();
      }
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
      await setFirebaseUserContext({
        userId: session.user.id,
        role: session.user.activeRole,
        audience: session.audience,
      });

      setStateSafely({
        status: 'authenticated',
        session,
        lastError: null,
      });
    },
    [setStateSafely],
  );

  const clearSessionState = useCallback(
    async (reason?: string) => {
      sessionRef.current = null;
      persistSessionRef.current = false;
      await Promise.all([
        clearPersistedSession(),
        clearRuntimeSnapshot(),
        clearSessionLockState(),
      ]);
      await clearFirebaseUserContext();
      setStateSafely({
        status: 'signed-out',
        session: null,
        lastError: reason ? sanitizeUserFacingErrorMessage(reason, 'auth') : null,
      });
    },
    [setStateSafely],
  );

  const restoreRuntimeSessionSnapshot = useCallback(
    async (persistedSession: AuthSession, options?: { forceRefresh?: boolean }) => {
      sessionRef.current = persistedSession;

      const previousRuntime = await readRuntimeSnapshot();
      const versions = await withTimeout(
        getApiVersions(),
        8_000,
        'AccessFlow could not complete runtime validation.',
      );
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
        restoreSession(persistedSession, { forceRefresh: Boolean(options?.forceRefresh || runtimeChanged) }),
        12_000,
        'AccessFlow could not restore the saved session.',
      );

      return { session, versions };
    },
    [],
  );

  const keepPersistedSessionOnline = useCallback(
    async (persistedSession: AuthSession, reason: string) => {
      sessionRef.current = persistedSession;
      persistSessionRef.current = true;
      setStateSafely({
        status: 'authenticated',
        session: persistedSession,
        lastError: null,
      });
      resetNavigationToRoleHome(persistedSession.user.activeRole);
      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'auth',
        code: 'SESSION_RESTORE_DEFERRED',
        message: reason,
        context: {
          role: persistedSession.user.activeRole,
        },
      });
    },
    [setStateSafely],
  );

  const recoverRuntimeSession = useCallback(
    async (options?: RuntimeRecoveryOptions) => {
      if (runtimeRecoveryPromiseRef.current) {
        return runtimeRecoveryPromiseRef.current;
      }

      runtimeRecoveryPromiseRef.current = (async () => {
        let persistedSession: AuthSession | null = null;
        try {
          persistedSession = sessionRef.current ?? (await readPersistedSession());
        } catch (error) {
          await Promise.all([clearPersistedSession(), clearRuntimeSnapshot(), clearSessionLockState()]);
          await recordDiagnosticEvent({
            level: 'error',
            scope: 'auth',
            code: isSecureSessionCorruption(error) ? 'CORRUPTED_SESSION_SNAPSHOT' : 'SESSION_STORAGE_READ_FAILED',
            message: 'Saved session storage could not be read and was cleared.',
          });
          await clearSessionState('Please sign in again.');
          resetNavigationToAuth();
          return false;
        }
        const trigger = options?.trigger ?? 'manual';

        if (!persistedSession || !isValidSessionSnapshot(persistedSession)) {
          await clearSessionState('Session expired. Please sign in again.');
          resetNavigationToAuth();
          return false;
        }

        try {
          const { session, versions } = await restoreRuntimeSessionSnapshot(persistedSession, {
            forceRefresh: options?.forceRefresh,
          });

          await persistAuthenticatedSession(session, versions, {
            persistSession: persistSessionRef.current || Boolean(persistedSession),
          });
          await recordDiagnosticEvent({
            level: 'info',
            scope: 'auth',
            code: 'SESSION_RESTORE_SUCCEEDED',
            message: 'Mobile session restored successfully.',
            context: {
              trigger,
              role: session.user.activeRole,
            },
          });
          return true;
        } catch (error) {
          const normalizedError = normalizeApiError(error);
          await recordDiagnosticEvent({
            level: normalizedError.kind === 'network' ? 'warn' : 'error',
            scope: 'auth',
            code: 'SESSION_RESTORE_FAILED',
            message: normalizedError.message,
            context: {
              trigger,
              kind: normalizedError.kind,
              status: normalizedError.status ?? null,
              failClosed: Boolean(options?.failClosed),
            },
          });

          if (normalizedError.kind === 'auth' || normalizedError.status === 401 || normalizedError.status === 403) {
            await logoutRequest(persistedSession).catch(() => undefined);
            await clearSessionState('Session expired. Please sign in again.');
            resetNavigationToAuth();
            return false;
          }

          await keepPersistedSessionOnline(persistedSession, normalizedError.message);
          return true;
        } finally {
          runtimeRecoveryPromiseRef.current = null;
        }
      })();

      return runtimeRecoveryPromiseRef.current;
    },
    [clearSessionState, keepPersistedSessionOnline, persistAuthenticatedSession, restoreRuntimeSessionSnapshot],
  );

  const bootstrap = useCallback(async () => {
    setStateSafely(initialState);

    if (!apiConfig.isConfigured) {
      await Promise.all([clearPersistedSession(), clearRuntimeSnapshot(), clearSessionLockState()]);
      setStateSafely({
        status: 'signed-out',
        session: null,
        lastError: 'Set EXPO_PUBLIC_ACCESSFLOW_API_BASE_URL before launching the app.',
      });
      return;
    }

    let persistedSession: AuthSession | null = null;
    try {
      persistedSession = await readPersistedSession();
    } catch (error) {
      await Promise.all([clearPersistedSession(), clearRuntimeSnapshot(), clearSessionLockState()]);
      await recordDiagnosticEvent({
        level: 'error',
        scope: 'auth',
        code: isSecureSessionCorruption(error) ? 'CORRUPTED_SESSION_SNAPSHOT' : 'SESSION_STORAGE_READ_FAILED',
        message: 'Saved session storage could not be read and was cleared.',
      });
      setStateSafely({
        status: 'signed-out',
        session: null,
        lastError: 'Please sign in again.',
      });
      return;
    }
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
        lastError: null,
      });
      return;
    }

    if (!isValidSessionSnapshot(persistedSession)) {
      await Promise.all([clearPersistedSession(), clearRuntimeSnapshot(), clearSessionLockState()]);
      setStateSafely({
        status: 'signed-out',
        session: null,
        lastError: 'Please sign in again.',
      });
      return;
    }

    try {
      const { session, versions } = await restoreRuntimeSessionSnapshot(persistedSession);
      await persistAuthenticatedSession(session, versions, { persistSession: true });
    } catch (error) {
      const normalizedError = normalizeApiError(error);
      if (normalizedError.kind === 'auth' || normalizedError.status === 401 || normalizedError.status === 403) {
        await clearSessionState('Session expired. Please sign in again.');
        return;
      }

      await keepPersistedSessionOnline(persistedSession, normalizedError.message);
    }
  }, [clearSessionState, keepPersistedSessionOnline, persistAuthenticatedSession, restoreRuntimeSessionSnapshot, setStateSafely]);

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
        sessionRef.current = session;
        await persistAuthenticatedSession(session, null, { persistSession: true });
        await trackFirebaseEvent('login_success', {
          audience: session.audience,
          role: session.user.activeRole,
          persistent_session: true,
        });
        resetNavigationToRoleHome(session.user.activeRole);
      } catch (error) {
        const normalizedError = normalizeApiError(error);
        await trackFirebaseEvent('login_failure', {
          audience: payload.audience,
          kind: normalizedError.kind,
          status: normalizedError.status ?? null,
        });
        await recordFirebaseError(normalizedError, 'LOGIN_FAILED', {
          scope: 'auth',
          audience: payload.audience,
          status: normalizedError.status ?? null,
        });
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
    if (logoutPromiseRef.current) {
      return logoutPromiseRef.current;
    }

    setIsBusy(true);
    logoutPromiseRef.current = (async () => {
      try {
        await logoutRequest(sessionRef.current);
      } finally {
        await clearSessionState();
        resetNavigationToAuth();
        setIsBusy(false);
        logoutPromiseRef.current = null;
      }
    })();

    return logoutPromiseRef.current;
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
    setIsBusy(true);
    try {
      const recovered = await recoverRuntimeSession({
        trigger: 'manual',
        forceRefresh: false,
      });
      if (!recovered) {
        throw createAppError({
          kind: 'auth',
          message: 'Session expired. Please sign in again.',
          recoverable: false,
        });
      }
    } finally {
      setIsBusy(false);
    }
  }, [recoverRuntimeSession]);

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
      recoverRuntimeSession,
      recoverAppShell,
    }),
    [state, isBusy, login, logout, retryBootstrap, refreshSessionState, recoverRuntimeSession, recoverAppShell],
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
