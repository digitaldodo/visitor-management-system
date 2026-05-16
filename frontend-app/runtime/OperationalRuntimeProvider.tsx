import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
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
import { apiConfig } from '../api/apiConfig';
import { navigateToWorkspace } from '../navigation/navigationRef';
import { approveEmployeeVisitor, rejectEmployeeVisitor } from '../services/employeeService';
import {
  markNotificationRead,
  registerNotificationDevice,
  unregisterNotificationDevice,
} from '../services/notificationService';
import { getApiVersions, getHealthStatus } from '../services/systemService';
import { readOrCreateDeviceId } from '../storage/sessionStorage';
import type { NotificationRecord } from '../types/domain';

type OperationalRuntimeContextValue = {
  degradedMessage: string | null;
  runtimeUpdateAvailable: boolean;
  pushPermissionStatus: string;
  pushToken: string | null;
  localNotifications: NotificationRecord[];
  markLocalNotificationRead: (notificationId: string) => void;
  requestPushRegistration: () => Promise<void>;
  syncNow: () => Promise<void>;
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

export function OperationalRuntimeProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastApiVersionRef = useRef<string | null>(null);
  const handledResponsesRef = useRef<Set<string>>(new Set());
  const previousAuthStatusRef = useRef(auth.status);
  const deviceRegistrationRef = useRef<{ deviceId: string | null; expoPushToken: string | null }>({
    deviceId: null,
    expoPushToken: null,
  });

  const [pushPermissionStatus, setPushPermissionStatus] = useState('UNKNOWN');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [degradedMessage, setDegradedMessage] = useState<string | null>(null);
  const [runtimeUpdateAvailable, setRuntimeUpdateAvailable] = useState(false);
  const [localNotifications, setLocalNotifications] = useState<NotificationRecord[]>([]);

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

    const rolePrefix = auth.session.user.activeRole === 'SECURITY_GUARD'
      ? 'security'
      : auth.session.user.activeRole === 'EMPLOYEE'
        ? 'employee'
        : 'admin';

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
      }).catch(() => undefined);
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
    }).catch(() => undefined);
  }, [auth.status]);

  const handleNotificationRoute = useCallback(
    (type?: string | null) => {
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
          if (auth.status !== 'authenticated') {
            return;
          }
          if (auth.session.user.activeRole === 'EMPLOYEE') {
            navigateToWorkspace('employee-notifications');
          } else if (auth.session.user.activeRole === 'SECURITY_GUARD') {
            navigateToWorkspace('security-alerts');
          } else {
            navigateToWorkspace('admin-operations');
          }
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

    if (actionIdentifier === 'approve' && auth.status === 'authenticated' && auth.session.user.activeRole === 'EMPLOYEE' && visitorId) {
      await approveEmployeeVisitor(visitorId).catch(() => undefined);
      await invalidateRoleQueries();
      navigateToWorkspace('employee-requests');
      return;
    }

    if (actionIdentifier === 'reject' && auth.status === 'authenticated' && auth.session.user.activeRole === 'EMPLOYEE' && visitorId) {
      await rejectEmployeeVisitor(visitorId, { note: 'Rejected from mobile notification context.' }).catch(() => undefined);
      await invalidateRoleQueries();
      navigateToWorkspace('employee-requests');
      return;
    }

    await invalidateRoleQueries();
    handleNotificationRoute(data.type);
  }, [auth.status, auth.session, handleNotificationRoute, invalidateRoleQueries]);

  const probeRuntime = useCallback(async () => {
    try {
      const [health, versions] = await Promise.all([getHealthStatus(), getApiVersions()]);
      setDegradedMessage(null);

      if (lastApiVersionRef.current && lastApiVersionRef.current !== versions.current) {
        setRuntimeUpdateAvailable(true);
        upsertSystemNotification({
          id: `runtime-update-${versions.current}`,
          type: 'SYSTEM_RUNTIME_UPDATE_AVAILABLE',
          category: 'SYSTEM',
          priority: 'HIGH',
          title: 'Runtime update available',
          message: `A newer backend runtime (${versions.current}) is available. The app will keep resyncing safely.`,
          read: false,
          createdAt: new Date().toISOString(),
          source: 'local',
        });
      }

      lastApiVersionRef.current = versions.current;
      if (!health.status || String(health.status).toUpperCase() !== 'UP') {
        throw new Error('The backend health check reported a degraded state.');
      }
    } catch {
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
    }
  }, [upsertSystemNotification]);

  const syncNow = useCallback(async () => {
    await Promise.all([invalidateRoleQueries(), probeRuntime()]);
  }, [invalidateRoleQueries, probeRuntime]);

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
    }
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
      appStateRef.current = nextState;
      if (nextState === 'active' && auth.status === 'authenticated') {
        void syncNow();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [auth.status, syncNow]);

  useEffect(() => {
    if (auth.status !== 'authenticated') {
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
  }, [auth.status, auth.session, syncNow]);

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
    if (auth.status === 'authenticated') {
      return;
    }

    if (deviceRegistrationRef.current.deviceId) {
      void unregisterNotificationDevice({
        expoPushToken: deviceRegistrationRef.current.expoPushToken,
        deviceId: deviceRegistrationRef.current.deviceId,
      }).catch(() => undefined);
    }
  }, [auth.status]);

  const value = useMemo<OperationalRuntimeContextValue>(
    () => ({
      degradedMessage,
      runtimeUpdateAvailable,
      pushPermissionStatus,
      pushToken,
      localNotifications,
      markLocalNotificationRead,
      requestPushRegistration: registerCurrentDevice,
      syncNow,
    }),
    [
      degradedMessage,
      runtimeUpdateAvailable,
      pushPermissionStatus,
      pushToken,
      localNotifications,
      markLocalNotificationRead,
      registerCurrentDevice,
      syncNow,
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
