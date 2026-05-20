import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as ScreenCapture from 'expo-screen-capture';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
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
import { clearDiagnosticEvents, readDiagnosticEvents, recordDiagnosticEvent } from './diagnostics';
import {
  getFirebaseMessagingToken,
  getInitialFirebaseNotification,
  initializeFirebaseRuntime,
  onFirebaseForegroundMessage,
  onFirebaseNotificationOpened,
  onFirebaseTokenRefresh,
  recordFirebaseError,
  trackFirebaseEvent,
  type FirebaseMessagePayload,
} from './firebaseRuntime';
import { applyDownloadedOtaUpdate, checkForOtaUpdate, readOtaUpdateState } from './otaUpdates';
import { clearOperationalMetrics, readOperationalMetrics, recordOperationalMetric } from './telemetry';
import { approveEmployeeVisitor, rejectEmployeeVisitor } from '../services/employeeService';
import {
  markNotificationRead,
  registerNotificationDevice,
  unregisterNotificationDevice,
} from '../services/notificationService';
import { getMobileSessionPolicy, submitMobileTelemetry } from '../services/operationalService';
import { syncOfflineOperationalQueue } from '../services/offlineSyncService';
import { getApiVersions, getHealthStatus } from '../services/systemService';
import {
  cleanupOfflineOperationalCache,
  readOfflineOperationalMetadata,
  readOfflineOperationalQueue,
} from '../storage/offlineOperationalStore';
import {
  clearSessionLockState,
  readOrCreateDeviceId,
  readSessionLockState,
  writeSessionLockState,
} from '../storage/sessionStorage';
import type { NotificationRecord } from '../types/domain';
import type {
  DevicePostureState,
  NetworkReachabilityState,
  OfflineOperationalMode,
  OtaUpdateState,
  SessionLockReason,
  SessionLockState,
} from '../types/runtime';

type OperationalRuntimeContextValue = {
  degradedMessage: string | null;
  runtimeUpdateAvailable: boolean;
  otaUpdate: OtaUpdateState;
  devicePosture: DevicePostureState;
  networkState: NetworkReachabilityState;
  offlineOperationalMode: OfflineOperationalMode;
  offlineScanQueueSize: number;
  offlineOperationalQueueSize: number;
  offlineLastSyncAt: string | null;
  isSyncingOfflineOperations: boolean;
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
  applyPendingUpdate: () => Promise<void>;
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

const defaultDevicePosture: DevicePostureState = {
  deviceId: null,
  managedMode: apiConfig.deviceManagement.managedMode,
  kioskModeReady: apiConfig.deviceManagement.kioskModeReady,
  remoteLogoutSupported: true,
  suspicious: false,
  concurrentSessionCount: 0,
  lastPolicySyncAt: null,
};

const RESUME_RECOVERY_THROTTLE_MS = 12_000;
const FORCE_REFRESH_AFTER_BACKGROUND_MS = 30_000;
const initialNetworkState: NetworkReachabilityState = {
  isConnected: null,
  isInternetReachable: null,
  isApiReachable: true,
  lastOnlineAt: null,
  lastOfflineAt: null,
  lastApiReachableAt: null,
  consecutiveFailures: 0,
};

export function OperationalRuntimeProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastApiVersionRef = useRef<string | null>(null);
  const handledResponsesRef = useRef<Set<string>>(new Set());
  const previousAuthStatusRef = useRef(auth.status);
  const backgroundedAtRef = useRef<number | null>(null);
  const lastOtaCheckAtRef = useRef(0);
  const lastOfflineModeRef = useRef<OfflineOperationalMode>('online');
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const lifecycleRecoveryPromiseRef = useRef<Promise<void> | null>(null);
  const lastLifecycleRecoveryAtRef = useRef(0);
  const deviceRegistrationRef = useRef<{ deviceId: string | null; expoPushToken: string | null; fcmToken: string | null }>({
    deviceId: null,
    expoPushToken: null,
    fcmToken: null,
  });

  const [pushPermissionStatus, setPushPermissionStatus] = useState('UNKNOWN');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [degradedMessage, setDegradedMessage] = useState<string | null>(null);
  const [runtimeUpdateAvailable, setRuntimeUpdateAvailable] = useState(false);
  const [otaUpdate, setOtaUpdate] = useState<OtaUpdateState>(() => readOtaUpdateState());
  const [devicePosture, setDevicePosture] = useState<DevicePostureState>(defaultDevicePosture);
  const [networkState, setNetworkState] = useState<NetworkReachabilityState>(initialNetworkState);
  const [offlineScanQueueSize, setOfflineScanQueueSize] = useState(0);
  const [offlineOperationalQueueSize, setOfflineOperationalQueueSize] = useState(0);
  const [offlineLastSyncAt, setOfflineLastSyncAt] = useState<string | null>(null);
  const [isSyncingOfflineOperations, setIsSyncingOfflineOperations] = useState(false);
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

  const refreshOfflineQueueSize = useCallback(async () => {
    const [queuedOperations, metadata] = await Promise.all([
      readOfflineOperationalQueue().catch(() => []),
      readOfflineOperationalMetadata().catch(() => null),
    ]);
    setOfflineOperationalQueueSize(queuedOperations.length);
    setOfflineScanQueueSize(queuedOperations.filter((item) => item.qrPayload).length);
    setOfflineLastSyncAt(metadata?.lastSyncAt ?? null);
  }, []);

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

  const reconcileOperationalQueries = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      return;
    }

    const role = auth.session.user.activeRole;
    const staleMs = apiConfig.sync.staleCacheMs;
    const now = Date.now();

    await queryClient.invalidateQueries({
      predicate: (query) => {
        const firstKey = Array.isArray(query.queryKey) ? query.queryKey[0] : '';
        if (!['security', 'employee', 'visitor', 'admin', 'notifications'].includes(String(firstKey))) {
          return false;
        }
        const updatedAt = query.state.dataUpdatedAt || 0;
        if (now - updatedAt < staleMs) {
          return false;
        }
        if (firstKey === 'security') {
          return role === 'SECURITY_GUARD';
        }
        if (firstKey === 'employee') {
          return role === 'EMPLOYEE';
        }
        if (firstKey === 'visitor') {
          return role === 'VISITOR';
        }
        if (firstKey === 'admin') {
          return role === 'ADMIN';
        }
        return true;
      },
    });
  }, [auth, queryClient]);

  const invalidateOperationalQueries = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      return;
    }

    const role = auth.session.user.activeRole;
    await queryClient.invalidateQueries({
      predicate: (query) => {
        const firstKey = String(Array.isArray(query.queryKey) ? query.queryKey[0] : '');
        if (firstKey === 'notifications') {
          return true;
        }
        if (firstKey === 'security') {
          return role === 'SECURITY_GUARD';
        }
        if (firstKey === 'employee') {
          return role === 'EMPLOYEE';
        }
        if (firstKey === 'visitor') {
          return role === 'VISITOR';
        }
        if (firstKey === 'admin') {
          return role === 'ADMIN';
        }
        return false;
      },
    });
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
      setDevicePosture((current) => ({ ...current, deviceId }));

      let permissions = await Notifications.getPermissionsAsync();
      if (permissions.status !== 'granted') {
        permissions = await Notifications.requestPermissionsAsync();
      }

      const nextStatus = String(permissions.status || 'unknown').toUpperCase();
      setPushPermissionStatus(nextStatus);

      const fcmToken = nextStatus === 'GRANTED' ? await getFirebaseMessagingToken() : null;
      deviceRegistrationRef.current.fcmToken = fcmToken;

      if (nextStatus !== 'GRANTED' || (!apiConfig.expoProjectId && !fcmToken)) {
        await registerNotificationDevice({
          deviceId,
          platform: Platform.OS,
          appVersion: apiConfig.appVersion,
          runtimeVersion: apiConfig.runtimeVersion,
          projectId: apiConfig.expoProjectId || null,
          permissionStatus: nextStatus,
          fcmToken,
          pushProvider: fcmToken ? 'firebase' : 'none',
        });
        return;
      }

      const tokenResponse = apiConfig.expoProjectId
        ? await Notifications.getExpoPushTokenAsync({
            projectId: apiConfig.expoProjectId,
          })
        : null;
      const nextPushToken = tokenResponse?.data ?? null;
      deviceRegistrationRef.current.expoPushToken = nextPushToken;
      setPushToken(nextPushToken);

      await registerNotificationDevice({
        expoPushToken: nextPushToken,
        fcmToken,
        pushProvider: fcmToken && nextPushToken ? 'firebase-expo' : fcmToken ? 'firebase' : 'expo',
        deviceId,
        deviceName: Constants.deviceName ?? Application.applicationName ?? 'Android device',
        platform: Platform.OS,
        appVersion: apiConfig.appVersion,
        runtimeVersion: apiConfig.runtimeVersion,
        projectId: apiConfig.expoProjectId,
        permissionStatus: nextStatus,
      });
      await trackFirebaseEvent('push_device_registered', {
        role: auth.session.user.activeRole,
        has_fcm: Boolean(fcmToken),
        has_expo: Boolean(nextPushToken),
        permission: nextStatus,
      });
    } catch (error) {
      await recordFirebaseError(error, 'DEVICE_REGISTRATION_FAILED', {
        scope: 'notification',
        role: auth.session.user.activeRole,
      });
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

  const syncDevicePolicy = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      return;
    }

    const deviceId = deviceRegistrationRef.current.deviceId ?? await readOrCreateDeviceId();
    deviceRegistrationRef.current.deviceId = deviceId;
    setDevicePosture((current) => ({ ...current, deviceId }));

    try {
      const policy = await getMobileSessionPolicy(deviceId);
      setDevicePosture((current) => ({
        ...current,
        managedMode: policy.managedMode ?? current.managedMode,
        kioskModeReady: Boolean(policy.kioskModeReady ?? current.kioskModeReady),
        remoteLogoutSupported: Boolean(policy.remoteLogoutSupported ?? current.remoteLogoutSupported),
        suspicious: policy.suspiciousDevice,
        concurrentSessionCount: policy.concurrentSessionCount,
        lastPolicySyncAt: new Date().toISOString(),
      }));

      if (!policy.sessionValid || policy.forceLogout) {
        await recordOperationalMetric({
          name: 'session_invalidated',
          tags: {
            reason: policy.reason ?? 'remote-policy',
            suspiciousDevice: policy.suspiciousDevice,
          },
        });
        await auth.logout();
        return;
      }

      if (policy.suspiciousDevice) {
        await applySessionLock('suspicious-device');
      }
    } catch (error) {
      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'security',
        code: 'DEVICE_POLICY_SYNC_FAILED',
        message: error instanceof Error ? error.message : 'Device policy sync failed.',
        context: {
          role: auth.session.user.activeRole,
        },
      });
    }
  }, [applySessionLock, auth]);

  const flushTelemetry = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      return;
    }

    const [diagnostics, metrics] = await Promise.all([
      readDiagnosticEvents().catch(() => []),
      readOperationalMetrics().catch(() => []),
    ]);

    if (!diagnostics.length && !metrics.length) {
      return;
    }

    try {
      const diagnosticBatch = diagnostics.slice(0, 40);
      const metricBatch = metrics.slice(0, 80);
      await submitMobileTelemetry({
        diagnostics: diagnosticBatch,
        metrics: metricBatch,
      });
      await Promise.all([
        clearDiagnosticEvents(),
        clearOperationalMetrics(metricBatch.map((metric) => metric.id)),
      ]);
    } catch {
      // Keep the local buffer for the next safe sync window.
    }
  }, [auth.status]);

  const runOtaCheck = useCallback(async (forceDownload = false) => {
    if (!apiConfig.release.otaEnabled) {
      return;
    }

    const now = Date.now();
    if (!forceDownload && now - lastOtaCheckAtRef.current < apiConfig.release.updateCheckIntervalMs) {
      return;
    }
    lastOtaCheckAtRef.current = now;

    const nextState = await checkForOtaUpdate({ forceDownload });
    setOtaUpdate(nextState);
    if (nextState.isEmergencyLaunch) {
      await recordDiagnosticEvent({
        level: 'error',
        scope: 'runtime',
        code: 'OTA_EMERGENCY_LAUNCH',
        message: nextState.emergencyLaunchReason ?? 'Expo Updates launched the embedded runtime for safety.',
        context: {
          channel: nextState.channel,
          updateId: nextState.updateId,
        },
      });
    }
    if (nextState.updateAvailable || nextState.updateDownloaded || nextState.rollbackAvailable) {
      setRuntimeUpdateAvailable(true);
      upsertSystemNotification({
        id: `ota-update-${nextState.lastCheckedAt ?? 'ready'}`,
        type: 'SYSTEM_RUNTIME_UPDATE_AVAILABLE',
        category: 'SYSTEM',
        priority: nextState.updateDownloaded ? 'CRITICAL' : 'HIGH',
        title: nextState.rollbackAvailable ? 'Safe rollback available' : 'Mobile update available',
        message: nextState.message ?? 'A compatible AccessFlow mobile update is available.',
        read: false,
        createdAt: new Date().toISOString(),
        source: 'local',
      });
    }
  }, [upsertSystemNotification]);

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

  const handleFirebaseNotificationResponse = useCallback(async (message: FirebaseMessagePayload, source: 'foreground' | 'opened' | 'initial') => {
    const data = message.data ?? {};
    const responseKey = `${message.messageId ?? data.notificationId ?? data.type ?? 'firebase'}:${source}`;
    if (handledResponsesRef.current.has(responseKey)) {
      return;
    }
    handledResponsesRef.current.add(responseKey);

    await trackFirebaseEvent(source === 'foreground' ? 'notification_received' : 'notification_opened', {
      source,
      type: data.type ?? null,
      category: data.category ?? null,
      priority: data.priority ?? null,
    });

    if (data.notificationId) {
      await markNotificationRead(data.notificationId).catch(() => undefined);
    }

    if (auth.status !== 'authenticated') {
      return;
    }

    if (!isNotificationAllowedForRole(auth.session.user.activeRole, data.type)) {
      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'notification',
        code: 'ROLE_SCOPED_FCM_SKIPPED',
        message: 'An FCM notification outside the active workspace scope was ignored.',
        context: {
          role: auth.session.user.activeRole,
          type: data.type ?? null,
        },
      });
      return;
    }

    await invalidateRoleQueries();
    if (source !== 'foreground') {
      handleNotificationRoute(data.type);
    }
  }, [auth, handleNotificationRoute, invalidateRoleQueries]);

  const probeRuntime = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      return;
    }

    try {
      const [health, versions] = await Promise.all([getHealthStatus(), getApiVersions()]);
      setDegradedMessage(null);
      setNetworkState((current) => ({
        ...current,
        isApiReachable: true,
        consecutiveFailures: 0,
        lastApiReachableAt: new Date().toISOString(),
        lastOnlineAt: new Date().toISOString(),
      }));

      const recommendedUpdate =
        versions.recommendedAppVersion
        && compareVersionStrings(apiConfig.appVersion, versions.recommendedAppVersion) < 0;
      const requiredRuntimeUpdate =
        versions.minimumRuntimeVersion
        && compareVersionStrings(apiConfig.runtimeVersion, versions.minimumRuntimeVersion) < 0;
      const forcedRolloutUpdate = Boolean(versions.rollout?.forced);
      const rollbackRequired = Boolean(versions.rollout?.rollback);

      if ((lastApiVersionRef.current && lastApiVersionRef.current !== versions.current) || recommendedUpdate || forcedRolloutUpdate || rollbackRequired) {
        setRuntimeUpdateAvailable(true);
        await runOtaCheck(Boolean(forcedRolloutUpdate || rollbackRequired));
        upsertSystemNotification({
          id: `runtime-update-${versions.current}`,
          type: 'SYSTEM_RUNTIME_UPDATE_AVAILABLE',
          category: 'SYSTEM',
          priority: forcedRolloutUpdate || rollbackRequired ? 'CRITICAL' : 'HIGH',
          title: rollbackRequired ? 'Rollback required' : 'Runtime update available',
          message: rollbackRequired
            ? 'The backend marked the current mobile release for rollback. AccessFlow will use the safest compatible update path.'
            : `A newer backend runtime (${versions.current}) is available. Resync the device or update the app when your operations window allows.`,
          read: false,
          createdAt: new Date().toISOString(),
          source: 'local',
        });
      }

      if (requiredRuntimeUpdate || forcedRolloutUpdate) {
        await applySessionLock('update-required');
      }

      lastApiVersionRef.current = versions.current;
      if (!health.status || String(health.status).toUpperCase() !== 'UP') {
        throw new Error('The backend health check reported a degraded state.');
      }
    } catch (error) {
      setDegradedMessage('Operational sync is running in degraded mode. Data may be briefly stale while the app retries.');
      setNetworkState((current) => ({
        ...current,
        isApiReachable: false,
        consecutiveFailures: current.consecutiveFailures + 1,
        lastOfflineAt: new Date().toISOString(),
      }));
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

  const syncOfflineOperations = useCallback(async () => {
    if (auth.status !== 'authenticated' || sessionLock.isLocked) {
      return;
    }

    setIsSyncingOfflineOperations(true);
    try {
      const summary = await syncOfflineOperationalQueue();
      if (summary.synced > 0) {
        upsertSystemNotification({
          id: `offline-sync-${Date.now()}`,
          type: 'SYSTEM_BACKEND_CONNECTIVITY_RESTORED',
          category: 'SYSTEM',
          priority: 'MEDIUM',
          title: 'Offline actions synced',
          message: `${summary.synced} queued operation${summary.synced === 1 ? '' : 's'} recovered after reconnect.`,
          read: false,
          createdAt: new Date().toISOString(),
          source: 'local',
        });
        await invalidateOperationalQueries();
      }
      await refreshOfflineQueueSize();
    } finally {
      setIsSyncingOfflineOperations(false);
    }
  }, [auth.status, invalidateOperationalQueries, refreshOfflineQueueSize, sessionLock.isLocked, upsertSystemNotification]);

  const syncNow = useCallback(async () => {
    if (auth.status !== 'authenticated' || sessionLock.isLocked) {
      return;
    }

    if (!syncPromiseRef.current) {
      syncPromiseRef.current = (async () => {
        try {
          await Promise.all([
            reconcileOperationalQueries(),
            invalidateRoleQueries(),
            probeRuntime(),
            syncDevicePolicy(),
            flushTelemetry(),
            syncOfflineOperations(),
            cleanupOfflineOperationalCache(),
            refreshOfflineQueueSize(),
          ]);
        } finally {
          syncPromiseRef.current = null;
        }
      })();
    }

    await syncPromiseRef.current;
  }, [auth.status, reconcileOperationalQueries, invalidateRoleQueries, probeRuntime, syncDevicePolicy, flushTelemetry, syncOfflineOperations, refreshOfflineQueueSize, sessionLock.isLocked]);

  const runLifecycleRecovery = useCallback(
    async (reason: 'resume' | 'inactive', elapsedMs: number) => {
      if (auth.status !== 'authenticated') {
        return;
      }

      if (lifecycleRecoveryPromiseRef.current) {
        await lifecycleRecoveryPromiseRef.current;
        return;
      }

      const now = Date.now();
      const shouldThrottle =
        now - lastLifecycleRecoveryAtRef.current < RESUME_RECOVERY_THROTTLE_MS
        && elapsedMs < FORCE_REFRESH_AFTER_BACKGROUND_MS;

      if (shouldThrottle) {
        return;
      }

      lastLifecycleRecoveryAtRef.current = now;
      lifecycleRecoveryPromiseRef.current = (async () => {
        try {
          setDegradedMessage(null);
          await recordOperationalMetric({
            name: 'runtime_recovery',
            tags: {
              reason,
              elapsedMs,
              role: auth.session.user.activeRole,
            },
          });

          const recovered = await auth.recoverRuntimeSession({
            trigger: 'resume',
            forceRefresh: elapsedMs >= FORCE_REFRESH_AFTER_BACKGROUND_MS,
            failClosed: true,
          });

          if (!recovered) {
            queryClient.clear();
            return;
          }

          await Promise.all([
            queryClient.resumePausedMutations().catch(() => undefined),
            invalidateOperationalQueries(),
            reconcileOperationalQueries(),
            probeRuntime(),
            syncDevicePolicy(),
            flushTelemetry(),
            refreshOfflineQueueSize(),
            runOtaCheck(false),
          ]);

          if (reason === 'inactive') {
            await applySessionLock('inactive');
          }
        } catch (error) {
          if (isOfflineNetworkState(networkState)) {
            setDegradedMessage('Offline Operational Mode is active. Cached guard workflows remain available and queued actions will sync when connectivity returns.');
            await refreshOfflineQueueSize();
            await recordDiagnosticEvent({
              level: 'warn',
              scope: 'runtime',
              code: 'LIFECYCLE_RECOVERY_DEFERRED_OFFLINE',
              message: 'Lifecycle recovery was deferred because the backend is unreachable.',
              context: {
                reason,
                elapsedMs,
              },
            });
            return;
          }
          queryClient.clear();
          await recordDiagnosticEvent({
            level: 'error',
            scope: 'runtime',
            code: 'LIFECYCLE_RECOVERY_FAILED_CLOSED',
            message: error instanceof Error ? error.message : 'Lifecycle recovery failed closed.',
            context: {
              reason,
              elapsedMs,
            },
          });
          await auth.logout();
        } finally {
          lifecycleRecoveryPromiseRef.current = null;
        }
      })();

      await lifecycleRecoveryPromiseRef.current;
    },
    [
      applySessionLock,
      auth,
      flushTelemetry,
      invalidateOperationalQueries,
      probeRuntime,
      queryClient,
      reconcileOperationalQueries,
      refreshOfflineQueueSize,
      runOtaCheck,
      syncDevicePolicy,
      networkState,
    ],
  );

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
      await syncDevicePolicy();
      await releaseSessionLock();
      resetNavigationToRoleHome(auth.session.user.activeRole);
      await syncNow();
    } finally {
      setIsUnlocking(false);
    }
  }, [auth, releaseSessionLock, sessionLock, syncDevicePolicy, syncNow]);

  useEffect(() => {
    void initializeFirebaseRuntime();
  }, []);

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
      await refreshOfflineQueueSize();
    })().catch(() => undefined);
  }, [refreshOfflineQueueSize]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? null;
      const reachable = state.isInternetReachable ?? null;
      const offline = connected === false || reachable === false;
      const now = new Date().toISOString();

      setNetworkState((current) => ({
        ...current,
        isConnected: connected,
        isInternetReachable: reachable,
        lastOnlineAt: offline ? current.lastOnlineAt : now,
        lastOfflineAt: offline ? now : current.lastOfflineAt,
      }));

      if (!offline && auth.status === 'authenticated') {
        void syncNow();
      }
    });

    void NetInfo.fetch().then((state) => {
      const connected = state.isConnected ?? null;
      const reachable = state.isInternetReachable ?? null;
      setNetworkState((current) => ({
        ...current,
        isConnected: connected,
        isInternetReachable: reachable,
      }));
    }).catch(() => undefined);

    return unsubscribe;
  }, [auth.status, syncNow]);

  useEffect(() => {
    void runOtaCheck(false);
  }, [runOtaCheck]);

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
      void syncDevicePolicy();
      void flushTelemetry();
      return;
    }

    setPushToken(null);
    deviceRegistrationRef.current.expoPushToken = null;
    deviceRegistrationRef.current.fcmToken = null;
    setRuntimeUpdateAvailable(false);
    setDegradedMessage(null);
    queryClient.clear();
    syncPromiseRef.current = null;
    lifecycleRecoveryPromiseRef.current = null;
    lastLifecycleRecoveryAtRef.current = 0;
    void clearSessionLockState().catch(() => undefined);
    setSessionLock((current) => ({
      ...current,
      isLocked: false,
      reason: null,
      lockedAt: null,
    }));
  }, [auth.status, probeRuntime, queryClient, registerCurrentDevice, syncDevicePolicy, flushTelemetry]);

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
          fcmToken: deviceRegistrationRef.current.fcmToken,
          pushProvider: deviceRegistrationRef.current.fcmToken ? 'firebase-expo' : 'expo',
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
    const unsubscribe = onFirebaseTokenRefresh((token) => {
      deviceRegistrationRef.current.fcmToken = token;
      if (auth.status === 'authenticated' && deviceRegistrationRef.current.deviceId) {
        void registerNotificationDevice({
          expoPushToken: deviceRegistrationRef.current.expoPushToken,
          fcmToken: token,
          pushProvider: deviceRegistrationRef.current.expoPushToken ? 'firebase-expo' : 'firebase',
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
      unsubscribe?.();
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
    const foregroundSubscription = onFirebaseForegroundMessage((message) => {
      void handleFirebaseNotificationResponse(message, 'foreground');
      void syncNow();
    });
    const openedSubscription = onFirebaseNotificationOpened((message) => {
      void handleFirebaseNotificationResponse(message, 'opened');
    });

    void getInitialFirebaseNotification().then((message) => {
      if (message) {
        void handleFirebaseNotificationResponse(message, 'initial');
      }
    });

    return () => {
      foregroundSubscription?.();
      openedSubscription?.();
    };
  }, [handleFirebaseNotificationResponse, syncNow]);

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

        void runLifecycleRecovery(
          elapsedMs >= apiConfig.security.inactivityLockMs ? 'inactive' : 'resume',
          elapsedMs,
        );
      }
    });

    return () => {
      subscription.remove();
    };
  }, [auth.status, runLifecycleRecovery]);

  useEffect(() => {
    if (auth.status !== 'authenticated' || sessionLock.isLocked) {
      return;
    }

    const intervalMs = auth.session.user.activeRole === 'SECURITY_GUARD'
      ? apiConfig.sync.securityPollMs
      : auth.session.user.activeRole === 'EMPLOYEE'
        ? apiConfig.sync.employeePollMs
        : auth.session.user.activeRole === 'VISITOR'
          ? apiConfig.sync.employeePollMs
          : apiConfig.sync.adminPollMs;

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
    if (auth.status !== 'authenticated') {
      return;
    }

    const intervalId = setInterval(() => {
      if (appStateRef.current === 'active') {
        void flushTelemetry();
      }
    }, apiConfig.telemetryFlushIntervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [auth.status, flushTelemetry]);

  const applyPendingUpdate = useCallback(async () => {
    await applyDownloadedOtaUpdate();
  }, []);

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
          fcmToken: deviceRegistrationRef.current.fcmToken,
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

  const offlineOperationalMode: OfflineOperationalMode = isOfflineNetworkState(networkState)
    ? 'offline'
    : runtimeHealth === 'degraded' || networkState.consecutiveFailures > 0
      ? 'degraded'
      : 'online';

  useEffect(() => {
    if (lastOfflineModeRef.current === offlineOperationalMode) {
      return;
    }
    lastOfflineModeRef.current = offlineOperationalMode;
    if (offlineOperationalMode !== 'online') {
      void trackFirebaseEvent('offline_mode_activation', {
        mode: offlineOperationalMode,
        role: auth.status === 'authenticated' ? auth.session.user.activeRole : 'signed_out',
        api_reachable: networkState.isApiReachable,
      });
    }
  }, [auth, networkState.isApiReachable, offlineOperationalMode]);

  const value = useMemo<OperationalRuntimeContextValue>(
    () => ({
      degradedMessage,
      runtimeUpdateAvailable,
      otaUpdate,
      devicePosture,
      networkState,
      offlineOperationalMode,
      offlineScanQueueSize,
      offlineOperationalQueueSize,
      offlineLastSyncAt,
      isSyncingOfflineOperations,
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
      applyPendingUpdate,
    }),
    [
      degradedMessage,
      runtimeUpdateAvailable,
      otaUpdate,
      devicePosture,
      networkState,
      offlineOperationalMode,
      offlineScanQueueSize,
      offlineOperationalQueueSize,
      offlineLastSyncAt,
      isSyncingOfflineOperations,
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
      applyPendingUpdate,
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

function isOfflineNetworkState(state: NetworkReachabilityState) {
  return state.isConnected === false
    || state.isInternetReachable === false
    || (!state.isApiReachable && state.consecutiveFailures >= 2);
}
