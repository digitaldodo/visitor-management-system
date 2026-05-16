import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as ScreenCapture from 'expo-screen-capture';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '../auth/AuthProvider';
import { getWorkspaceConfig, isNotificationAllowedForRole } from '../auth/workspaceConfig';
import { apiConfig } from '../api/apiConfig';
import { navigateToWorkspace, resetNavigationToRoleHome } from '../navigation/navigationRef';
import { recordDiagnosticEvent } from './diagnostics';
import { approveEmployeeVisitor, rejectEmployeeVisitor } from '../services/employeeService';
import {
  markNotificationRead,
  registerNotificationDevice,
  unregisterNotificationDevice,
} from '../services/notificationService';
import { getApiVersions, getHealthStatus } from '../services/systemService';
import {
  clearSessionLockState,
  readOrCreateDeviceId,
  readSessionLockState,
  writeSessionLockState,
} from '../storage/sessionStorage';
import type { NotificationRecord } from '../types/domain';
import type { SessionLockReason, SessionLockState } from '../types/runtime';

type OperationalRuntimeContextValue = {
  degradedMessage: string | null;
  runtimeUpdateAvailable: boolean;
  pushPermissionStatus: string;
  pushToken: string | null;
  localNotifications: NotificationRecord[];
  runtimeHealth: 'healthy' | 'degraded' | 'locked' | 'update-required';
  sessionLock: SessionLockState;
  isUnlocking: boolean;
  markLocalNotificationRead: (notificationId: string) => void;
  requestPushRegistration: () => Promise<void>;
  syncNow: () => Promise<void>;
  unlockSession: () => Promise<void>;
};

const OperationalRuntimeContext = createContext<OperationalRuntimeContextValue | null>(null);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const defaultLockState: SessionLockState = {
  isLocked: false,
  reason: null,
  lockedAt: null,
  inactivityTimeoutMs: apiConfig.security.inactivityLockMs,
  biometricAvailable: false,
  biometricEnabled: apiConfig.security.requireBiometricUnlock,
  screenshotProtectionEnabled: apiConfig.security.screenshotProtectionEnabled,
};

export function OperationalRuntimeProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastApiVersionRef = useRef<string | null>(null);
  const handledResponsesRef = useRef<Set<string>>(new Set());
  const previousAuthStatusRef = useRef(auth.status);
  const backgroundedAtRef = useRef<number | null>(null);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const deviceRegistrationRef = useRef<{ deviceId: string | null; expoPushToken: string | null }>({
    deviceId: null,
    expoPushToken: null,
  });

  const [pushPermissionStatus, setPushPermissionStatus] = useState('UNKNOWN');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [degradedMessage, setDegradedMessage] = useState<string | null>(null);
  const [runtimeUpdateAvailable, setRuntimeUpdateAvailable] = useState(false);
  const [localNotifications, setLocalNotifications] = useState<NotificationRecord[]>([]);
  const [sessionLock, setSessionLock] = useState<SessionLockState>(defaultLockState);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const persistLockState = useCallback(async (nextState: SessionLockState) => {
    setSessionLock(nextState);
    await writeSessionLockState(nextState).catch(() => undefined);
  }, []);

  const releaseSessionLock = useCallback(async () => {
    const nextState = {
      ...sessionLock,
      isLocked: false,
      reason: null,
      lockedAt: null,
    } satisfies SessionLockState;
    await persistLockState(nextState);
  }, [persistLockState, sessionLock]);

  const applySessionLock = useCallback(
    async (reason: SessionLockReason) => {
      if (auth.status !== 'authenticated') {
        return;
      }

      await recordDiagnosticEvent({
        level: reason === 'update-required' ? 'error' : 'warn',
        scope: 'security',
        code: 'SESSION_LOCKED',
        message: reason === 'update-required'
          ? 'The mobile runtime requires an app update before the workspace can resume.'
          : 'The mobile workspace was locked after inactivity and requires a safe resume.',
        context: {
          role: auth.session.user.activeRole,
          reason,
        },
      });

      await persistLockState({
        ...sessionLock,
        isLocked: true,
        reason,
        lockedAt: new Date().toISOString(),
      });
    },
    [auth, persistLockState, sessionLock],
  );

  const markLocalNotificationRead = useCallback((notificationId: string) => {
    setLocalNotifications((current) =>
      current.map((item) => (item.id === notificationId ? { ...item, read: true } : item)),
    );
  }, []);

  const upsertSystemNotification = useCallback((notification: NotificationRecord) => {
    setLocalNotifications((current) => {
      const existingIndex = current.findIndex(
        (item) => item.source === 'local' && item.type === notification.type && !item.read,
      );

      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = {
          ...next[existingIndex],
          ...notification,
          id: next[existingIndex].id,
        };
        return next;
      }

      return [notification, ...current].slice(0, 12);
    });
  }, []);

  const invalidateRoleQueries = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      return;
    }

    const rolePrefix = getWorkspaceConfig(auth.session.user.activeRole).audience;

    await Promise.all([
      queryClient.invalidateQueries({
        predicate: (query) => {
          const firstKey = Array.isArray(query.queryKey) ? query.queryKey[0] : '';
          return firstKey === rolePrefix || firstKey === 'notifications';
        },
      }),
      auth.refreshSession().catch(() => undefined),
    ]);
  }, [auth, queryClient]);

  const registerCurrentDevice = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      return;
    }

    if (Platform.OS !== 'android') {
      setPushPermissionStatus('UNAVAILABLE');
      return;
    }

    try {
      const deviceId = await readOrCreateDeviceId();
      deviceRegistrationRef.current.deviceId = deviceId;

      let permissions = await Notifications.getPermissionsAsync();
      if (permissions.status !== 'granted') {
        permissions = await Notifications.requestPermissionsAsync();
      }

      const nextStatus = String(permissions.status || 'unknown').toUpperCase();
      setPushPermissionStatus(nextStatus);

      if (nextStatus !== 'GRANTED' || !apiConfig.expoProjectId) {
        await registerNotificationDevice({
          deviceId,
          platform: Platform.OS,
          appVersion: apiConfig.appVersion,
          runtimeVersion: apiConfig.runtimeVersion,
          projectId: apiConfig.expoProjectId || null,
          permissionStatus: nextStatus,
        });
        return;
      }

      const tokenResponse = await Notifications.getExpoPushTokenAsync({
        projectId: apiConfig.expoProjectId,
      });
      const nextPushToken = tokenResponse.data;
      deviceRegistrationRef.current.expoPushToken = nextPushToken;
      setPushToken(nextPushToken);

      await registerNotificationDevice({
        expoPushToken: nextPushToken,
        deviceId,
        deviceName: Constants.deviceName ?? Application.applicationName ?? 'Android device',
        platform: Platform.OS,
        appVersion: apiConfig.appVersion,
        runtimeVersion: apiConfig.runtimeVersion,
        projectId: apiConfig.expoProjectId,
        permissionStatus: nextStatus,
      });
    } catch (error) {
      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'notification',
        code: 'DEVICE_REGISTRATION_FAILED',
        message: error instanceof Error ? error.message : 'Push registration failed.',
        context: {
          role: auth.session.user.activeRole,
        },
      });
    }
  }, [auth.status, auth.session]);

  const handleNotificationRoute = useCallback(
    (type?: string | null) => {
      if (auth.status !== 'authenticated') {
        return;
      }

      const role = auth.session.user.activeRole;
      if (!isNotificationAllowedForRole(role, type)) {
        void recordDiagnosticEvent({
          level: 'warn',
          scope: 'notification',
          code: 'ROLE_SCOPED_NOTIFICATION_SKIPPED',
          message: 'A notification outside the active workspace scope was ignored.',
          context: {
            role,
            type: type ?? null,
          },
        });
        return;
      }

      switch (String(type || '').toUpperCase()) {
        case 'VISITOR_APPROVAL_REQUEST':
          navigateToWorkspace('employee-requests');
          return;
        case 'SECURITY_INVALID_QR_SCAN':
        case 'SECURITY_DENIED_ENTRY':
        case 'SECURITY_SUSPICIOUS_ACTIVITY':
        case 'SECURITY_MANUAL_OVERRIDE':
        case 'SECURITY_ESCALATION':
        case 'WORKFORCE_CREDENTIAL_DISABLED':
          navigateToWorkspace('security-alerts');
          return;
        case 'WORKFORCE_ONBOARDING_REQUESTED':
          navigateToWorkspace('admin-operations');
          return;
        default:
          navigateToWorkspace(getWorkspaceConfig(role).notificationTarget);
      }
    },
    [auth],
  );

  const handleNotificationResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handledResponsesRef.current.has(responseKey)) {
      return;
    }
    handledResponsesRef.current.add(responseKey);

    const data = response.notification.request.content.data as Record<string, string | undefined>;
    const visitorId = data.visitorId || null;
    const notificationId = data.notificationId || null;
    const actionIdentifier = response.actionIdentifier;

    if (notificationId) {
      await markNotificationRead(notificationId).catch(() => undefined);
    }

    if (auth.status !== 'authenticated') {
      return;
    }

    if (!isNotificationAllowedForRole(auth.session.user.activeRole, data.type)) {
      return;
    }

    if (actionIdentifier === 'approve' && auth.session.user.activeRole === 'EMPLOYEE' && visitorId) {
      await approveEmployeeVisitor(visitorId).catch(() => undefined);
      await invalidateRoleQueries();
      navigateToWorkspace('employee-requests');
      return;
    }

    if (actionIdentifier === 'reject' && auth.session.user.activeRole === 'EMPLOYEE' && visitorId) {
      await rejectEmployeeVisitor(visitorId, { note: 'Rejected from mobile notification context.' }).catch(() => undefined);
      await invalidateRoleQueries();
      navigateToWorkspace('employee-requests');
      return;
    }

    await invalidateRoleQueries();
    handleNotificationRoute(data.type);
  }, [auth, handleNotificationRoute, invalidateRoleQueries]);

  const probeRuntime = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      return;
    }

    try {
      const [health, versions] = await Promise.all([getHealthStatus(), getApiVersions()]);
      setDegradedMessage(null);

      const recommendedUpdate =
        versions.recommendedAppVersion
        && compareVersionStrings(apiConfig.appVersion, versions.recommendedAppVersion) < 0;
      const requiredRuntimeUpdate =
        versions.minimumRuntimeVersion
        && compareVersionStrings(apiConfig.runtimeVersion, versions.minimumRuntimeVersion) < 0;

      if ((lastApiVersionRef.current && lastApiVersionRef.current !== versions.current) || recommendedUpdate) {
        setRuntimeUpdateAvailable(true);
        upsertSystemNotification({
          id: `runtime-update-${versions.current}`,
          type: 'SYSTEM_RUNTIME_UPDATE_AVAILABLE',
          category: 'SYSTEM',
          priority: 'HIGH',
          title: 'Runtime update available',
          message: `A newer backend runtime (${versions.current}) is available. Resync the device or update the app when your operations window allows.`,
          read: false,
          createdAt: new Date().toISOString(),
          source: 'local',
        });
      }

      if (requiredRuntimeUpdate) {
        await applySessionLock('update-required');
      }

      lastApiVersionRef.current = versions.current;
      if (!health.status || String(health.status).toUpperCase() !== 'UP') {
        throw new Error('The backend health check reported a degraded state.');
      }
    } catch (error) {
      setDegradedMessage('Operational sync is running in degraded mode. Data may be briefly stale while the app retries.');
      upsertSystemNotification({
        id: 'system-connectivity',
        type: 'SYSTEM_BACKEND_CONNECTIVITY_ISSUE',
        category: 'SYSTEM',
        priority: 'CRITICAL',
        title: 'Backend connectivity issue',
        message: 'AccessFlow could not complete a runtime sync. The app will retry and recover automatically.',
        read: false,
        createdAt: new Date().toISOString(),
        source: 'local',
      });
      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'runtime',
        code: 'RUNTIME_SYNC_DEGRADED',
        message: error instanceof Error ? error.message : 'Runtime sync degraded.',
        context: {
          role: auth.status === 'authenticated' ? auth.session.user.activeRole : 'signed-out',
        },
      });
    }
  }, [applySessionLock, auth, upsertSystemNotification]);

  const syncNow = useCallback(async () => {
    if (auth.status !== 'authenticated' || sessionLock.isLocked) {
      return;
    }

    if (!syncPromiseRef.current) {
      syncPromiseRef.current = (async () => {
        try {
          await Promise.all([invalidateRoleQueries(), probeRuntime()]);
        } finally {
          syncPromiseRef.current = null;
        }
      })();
    }

    await syncPromiseRef.current;
  }, [auth.status, invalidateRoleQueries, probeRuntime, sessionLock.isLocked]);

  const unlockSession = useCallback(async () => {
    if (auth.status !== 'authenticated' || !sessionLock.isLocked) {
      return;
    }

    setIsUnlocking(true);
    try {
      if (sessionLock.biometricEnabled && sessionLock.biometricAvailable) {
        const biometricResult = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock AccessFlow',
          fallbackLabel: 'Use device unlock',
          disableDeviceFallback: false,
        });

        if (!biometricResult.success) {
          await recordDiagnosticEvent({
            level: 'warn',
            scope: 'security',
            code: 'BIOMETRIC_UNLOCK_CANCELLED',
            message: 'The operator did not complete biometric unlock.',
            context: {
              warning: biometricResult.warning ?? null,
            },
          });
          return;
        }
      }

      await auth.refreshSession();
      await releaseSessionLock();
      resetNavigationToRoleHome(auth.session.user.activeRole);
      await syncNow();
    } finally {
      setIsUnlocking(false);
    }
  }, [auth, releaseSessionLock, sessionLock, syncNow]);

  useEffect(() => {
    void (async () => {
      const [hasHardware, isEnrolled, persistedLockState] = await Promise.all([
        LocalAuthentication.hasHardwareAsync().catch(() => false),
        LocalAuthentication.isEnrolledAsync().catch(() => false),
        readSessionLockState().catch(() => null),
      ]);

      const nextState = {
        ...(persistedLockState ?? defaultLockState),
        inactivityTimeoutMs: apiConfig.security.inactivityLockMs,
        biometricEnabled: apiConfig.security.requireBiometricUnlock,
        biometricAvailable: hasHardware && isEnrolled,
        screenshotProtectionEnabled: apiConfig.security.screenshotProtectionEnabled,
      } satisfies SessionLockState;

      setSessionLock(nextState);
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!apiConfig.security.screenshotProtectionEnabled) {
      return;
    }

    if (auth.status === 'authenticated') {
      void ScreenCapture.preventScreenCaptureAsync().catch(() => undefined);
      return;
    }

    void ScreenCapture.allowScreenCaptureAsync().catch(() => undefined);
  }, [auth.status]);

  useEffect(() => {
    void (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('accessflow-operations', {
          name: 'AccessFlow Operations',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 180, 120, 180],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        });
        await Notifications.setNotificationChannelAsync('accessflow-critical', {
          name: 'AccessFlow Critical Alerts',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 220, 120, 220],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        });
      }

      await Notifications.setNotificationCategoryAsync('employee-approval', [
        { identifier: 'approve', buttonTitle: 'Approve' },
        { identifier: 'reject', buttonTitle: 'Reject', options: { isDestructive: true } },
        { identifier: 'view_request', buttonTitle: 'View request' },
      ]);
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (auth.status === 'authenticated') {
      void registerCurrentDevice();
      void probeRuntime();
      return;
    }

    setPushToken(null);
    setRuntimeUpdateAvailable(false);
    setDegradedMessage(null);
    void clearSessionLockState().catch(() => undefined);
    setSessionLock((current) => ({
      ...current,
      isLocked: false,
      reason: null,
      lockedAt: null,
    }));
  }, [auth.status, probeRuntime, registerCurrentDevice]);

  useEffect(() => {
    const pushTokenApi = Notifications as typeof Notifications & {
      addPushTokenListener?: (listener: (token: { data: string }) => void) => { remove: () => void };
    };

    const tokenSubscription = pushTokenApi.addPushTokenListener?.(({ data }) => {
      setPushToken(data);
      deviceRegistrationRef.current.expoPushToken = data;
      if (auth.status === 'authenticated' && deviceRegistrationRef.current.deviceId) {
        void registerNotificationDevice({
          expoPushToken: data,
          deviceId: deviceRegistrationRef.current.deviceId,
          deviceName: Constants.deviceName ?? Application.applicationName ?? 'Android device',
          platform: Platform.OS,
          appVersion: apiConfig.appVersion,
          runtimeVersion: apiConfig.runtimeVersion,
          projectId: apiConfig.expoProjectId,
          permissionStatus: pushPermissionStatus,
        }).catch(() => undefined);
      }
    });

    return () => {
      tokenSubscription?.remove();
    };
  }, [auth.status, pushPermissionStatus]);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      void syncNow();
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleNotificationResponse(response);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        void handleNotificationResponse(response);
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [handleNotificationResponse, syncNow]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAtRef.current = Date.now();
      }

      if (nextState === 'active' && previousState !== 'active' && auth.status === 'authenticated') {
        const elapsedMs = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : 0;
        backgroundedAtRef.current = null;

        if (elapsedMs >= apiConfig.security.inactivityLockMs) {
          void applySessionLock('inactive');
          return;
        }

        if (!sessionLock.isLocked) {
          void syncNow();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [applySessionLock, auth.status, sessionLock.isLocked, syncNow]);

  useEffect(() => {
    if (auth.status !== 'authenticated' || sessionLock.isLocked) {
      return;
    }

    const intervalMs = auth.session.user.activeRole === 'SECURITY_GUARD'
      ? 20_000
      : auth.session.user.activeRole === 'EMPLOYEE'
        ? 35_000
        : 45_000;

    const intervalId = setInterval(() => {
      if (appStateRef.current === 'active') {
        void syncNow();
      }
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [auth.status, auth.session, sessionLock.isLocked, syncNow]);

  useEffect(() => {
    if (
      previousAuthStatusRef.current === 'authenticated'
      && auth.status === 'signed-out'
      && auth.lastError
    ) {
      upsertSystemNotification({
        id: 'system-session-expired',
        type: 'SYSTEM_SESSION_EXPIRED',
        category: 'SYSTEM',
        priority: 'CRITICAL',
        title: 'Session expired',
        message: auth.lastError,
        read: false,
        createdAt: new Date().toISOString(),
        source: 'local',
      });
    }
    previousAuthStatusRef.current = auth.status;
  }, [auth.lastError, auth.status, upsertSystemNotification]);

  useEffect(() => {
    if (auth.status !== 'authenticated') {
      if (deviceRegistrationRef.current.deviceId) {
        void unregisterNotificationDevice({
          expoPushToken: deviceRegistrationRef.current.expoPushToken,
          deviceId: deviceRegistrationRef.current.deviceId,
        }).catch(() => undefined);
      }
      return;
    }
  }, [auth.status]);

  const runtimeHealth: OperationalRuntimeContextValue['runtimeHealth'] = sessionLock.reason === 'update-required'
    ? 'update-required'
    : sessionLock.isLocked
      ? 'locked'
      : degradedMessage
        ? 'degraded'
        : 'healthy';

  const value = useMemo<OperationalRuntimeContextValue>(
    () => ({
      degradedMessage,
      runtimeUpdateAvailable,
      pushPermissionStatus,
      pushToken,
      localNotifications,
      runtimeHealth,
      sessionLock,
      isUnlocking,
      markLocalNotificationRead,
      requestPushRegistration: registerCurrentDevice,
      syncNow,
      unlockSession,
    }),
    [
      degradedMessage,
      runtimeUpdateAvailable,
      pushPermissionStatus,
      pushToken,
      localNotifications,
      runtimeHealth,
      sessionLock,
      isUnlocking,
      markLocalNotificationRead,
      registerCurrentDevice,
      syncNow,
      unlockSession,
    ],
  );

  return (
    <OperationalRuntimeContext.Provider value={value}>
      {children}
    </OperationalRuntimeContext.Provider>
  );
}

export function useOperationalRuntime() {
  const context = useContext(OperationalRuntimeContext);
  if (!context) {
    throw new Error('useOperationalRuntime must be used within OperationalRuntimeProvider.');
  }
  return context;
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
