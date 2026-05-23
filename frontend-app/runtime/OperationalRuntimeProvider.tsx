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
import {
  readPermissionLifecycle,
  resetPermissionLifecycleForManualEnable,
  showPermissionEducation,
  writePermissionLifecycle,
} from '../permissions/permissionEducation';
import { openOperationalDeepLink } from './operationalDeepLinks';
import { operationalSyncRuntime } from './operationalSyncRuntime';
import { clearDiagnosticEvents, readDiagnosticEvents, recordDiagnosticEvent } from './diagnostics';
import {
  isExpoGoRuntime,
  logExpoGoNotificationBypass,
  supportsNativePushNotifications,
  suppressExpoGoNotificationWarnings,
} from './expoRuntime';
import { getNativeNotificationsModule } from './nativeNotifications';
import {
  getFirebaseMessagingToken,
  getInitialFirebaseNotification,
  onFirebaseForegroundMessage,
  onFirebaseNotificationOpened,
  onFirebaseTokenRefresh,
  recordFirebaseError,
  trackFirebaseEvent,
  type FirebaseMessagePayload,
} from './firebaseRuntime';
import { initializeProductionObservability, recordSyncFailure, setObservabilityContext } from './observability';
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
import { syncQueuedVisitorRequests } from '../services/visitorRequestQueueService';
import { getApiVersions, getHealthStatus } from '../services/systemService';
import {
  cleanupOfflineOperationalCache,
  readOfflineOperationalMetadata,
  readOfflineOperationalQueue,
} from '../storage/offlineOperationalStore';
import {
  clearSessionLockState,
  readOrCreateDeviceId,
} from '../storage/sessionStorage';
import { compareVersionStrings } from '../shared/utils/version';
import type { NotificationRecord } from '../types/domain';
import type { OperationalEvent, OperationalSyncConnectionState } from '../types/operationalSync';
import type { NotificationResponse } from 'expo-notifications';
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
  liveOperationalEvents: OperationalEvent[];
  syncConnection: OperationalSyncConnectionState;
  runtimeHealth: 'healthy' | 'degraded' | 'locked' | 'update-required';
  sessionLock: SessionLockState;
  isUnlocking: boolean;
  markLocalNotificationRead: (notificationId: string) => void;
  requestPushRegistration: (options?: { forcePrompt?: boolean }) => Promise<void>;
  syncNow: () => Promise<void>;
  unlockSession: () => Promise<void>;
  applyPendingUpdate: () => Promise<void>;
};

const OperationalRuntimeContext = createContext<OperationalRuntimeContextValue | null>(null);

suppressExpoGoNotificationWarnings();

const startupNotifications = getNativeNotificationsModule('notification-handler');
if (startupNotifications) {
  startupNotifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

const defaultLockState: SessionLockState = {
  isLocked: false,
  reason: null,
  lockedAt: null,
  screenshotProtectionEnabled: apiConfig.security.screenshotProtectionEnabled,
};

const defaultDevicePosture: DevicePostureState = {
  deviceId: null,
  managedMode: apiConfig.deviceManagement.managedMode,
  kioskModeReady: apiConfig.deviceManagement.kioskModeReady,
  remoteLogoutSupported: true,
  checkpointId: null,
  checkpointName: null,
  operationalZone: null,
  operationalModeEnabled: false,
  scannerFirst: false,
  restrictedNavigation: false,
  autoRestoreScanner: false,
  sharedOperationalDevice: false,
  inactivityTimeoutSeconds: null,
  suspicious: false,
  rootedOrJailbroken: false,
  emulator: false,
  debugBuild: false,
  integrityReasons: [],
  sensitiveOperationsRestricted: false,
  concurrentSessionCount: 0,
  lastPolicySyncAt: null,
};

const RESUME_RECOVERY_THROTTLE_MS = 12_000;
const SESSION_DIRECT_RESTORE_MS = 5 * 60_000;
const FULL_SESSION_RECHECK_AFTER_BACKGROUND_MS = 30 * 60_000;
const initialNetworkState: NetworkReachabilityState = {
  isConnected: null,
  isInternetReachable: null,
  isApiReachable: true,
  lastOnlineAt: null,
  lastOfflineAt: null,
  lastApiReachableAt: null,
  consecutiveFailures: 0,
};

const initialSyncConnection: OperationalSyncConnectionState = {
  status: 'idle',
  cursor: null,
  lastEventAt: null,
  lastConnectedAt: null,
  lastError: null,
  reconnectAttempt: 0,
  pendingEventCount: 0,
};

function canAccessOperationalFeed(role?: string | null) {
  return role === 'ADMIN';
}

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
  const lastOperationalRestoreRef = useRef(0);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const lifecycleRecoveryPromiseRef = useRef<Promise<void> | null>(null);
  const unlockPromiseRef = useRef<Promise<void> | null>(null);
  const lastLifecycleRecoveryAtRef = useRef(0);
  const expoGoNotificationBypassLoggedRef = useRef(false);
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
  const [liveOperationalEvents, setLiveOperationalEvents] = useState<OperationalEvent[]>([]);
  const [syncConnection, setSyncConnection] = useState<OperationalSyncConnectionState>(initialSyncConnection);
  const [sessionLock, setSessionLock] = useState<SessionLockState>(defaultLockState);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const sessionLockRef = useRef(sessionLock);
  const activeSession = auth.status === 'authenticated' ? auth.session : null;
  const activeRole = activeSession?.user.activeRole ?? null;

  useEffect(() => {
    sessionLockRef.current = sessionLock;
  }, [sessionLock]);

  const releaseSessionLock = useCallback(async () => {
    const nextState = {
      ...sessionLockRef.current,
      isLocked: false,
      reason: null,
      lockedAt: null,
    } satisfies SessionLockState;
    sessionLockRef.current = nextState;
    setSessionLock((current) => (isSameSessionLock(current, nextState) ? current : nextState));
  }, []);

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

      if (sessionLockRef.current.isLocked) {
        return;
      }
      const nextState = {
        ...sessionLockRef.current,
        isLocked: true,
        reason,
        lockedAt: new Date().toISOString(),
      } satisfies SessionLockState;
      sessionLockRef.current = nextState;
      setSessionLock((current) => (isSameSessionLock(current, nextState) ? current : nextState));

      await recordDiagnosticEvent({
        level: 'error',
        scope: 'security',
        code: 'SESSION_LOCKED',
        message: 'The mobile runtime requires an app update before the workspace can resume.',
        context: {
          role: activeRole,
          reason,
        },
      });
    },
    [activeRole, auth.status],
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
    if (!activeRole) {
      return;
    }

    const rolePrefix = getWorkspaceConfig(activeRole).audience;

    await queryClient.invalidateQueries({
      predicate: (query) => {
        const firstKey = Array.isArray(query.queryKey) ? query.queryKey[0] : '';
        return firstKey === rolePrefix || firstKey === 'notifications';
      },
    });
  }, [activeRole, queryClient]);

  const reconcileOperationalQueries = useCallback(async () => {
    if (!activeRole) {
      return;
    }

    const role = activeRole;
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
  }, [activeRole, queryClient]);

  const invalidateOperationalQueries = useCallback(async () => {
    if (!activeRole) {
      return;
    }

    const role = activeRole;
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
  }, [activeRole, queryClient]);

  const handleOperationalEvents = useCallback((events: OperationalEvent[]) => {
    if (!activeRole || !canAccessOperationalFeed(activeRole) || !events.length) {
      return;
    }

    setLiveOperationalEvents((current) => {
      const merged = new Map<string, OperationalEvent>();
      [...events, ...current].forEach((event) => {
        if (event.id) {
          merged.set(event.id, event);
        }
      });
      return Array.from(merged.values())
        .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
        .slice(0, 80);
    });

    const categories = new Set(events.map((event) => String(event.category || '').toLowerCase()));
    const targetTypes = new Set(events.map((event) => String(event.targetType || '').toUpperCase()));

    const shouldInvalidateEmergency = categories.has('incident') || targetTypes.has('EMERGENCY_OPERATION');
    const shouldInvalidateNotifications = categories.has('audit') || categories.has('approval') || categories.has('incident');

    void queryClient.invalidateQueries({
      predicate: (query) => {
        const firstKey = String(Array.isArray(query.queryKey) ? query.queryKey[0] : '');
        if (firstKey === 'notifications') {
          return shouldInvalidateNotifications;
        }
        if (firstKey === 'emergency') {
          return shouldInvalidateEmergency;
        }
        if (firstKey === 'admin') {
          return true;
        }
        return false;
      },
    });

    void recordOperationalMetric({
      name: 'operational_events_received',
      value: events.length,
      tags: {
        role: activeRole,
        categories: Array.from(categories).join(',').slice(0, 80),
      },
    });
  }, [activeRole, queryClient]);

  const registerCurrentDevice = useCallback(async (options?: { forcePrompt?: boolean }) => {
    if (auth.status !== 'authenticated') {
      return;
    }

    try {
      const deviceId = await readOrCreateDeviceId();
      deviceRegistrationRef.current.deviceId = deviceId;
      setDevicePosture((current) => (
        current.deviceId === deviceId ? current : { ...current, deviceId }
      ));

      if (!supportsNativePushNotifications()) {
        setPushPermissionStatus(Platform.OS === 'android' && isExpoGoRuntime() ? 'EXPO_GO_UNAVAILABLE' : 'UNAVAILABLE');
        setPushToken(null);
        deviceRegistrationRef.current.expoPushToken = null;
        deviceRegistrationRef.current.fcmToken = null;
        if (!expoGoNotificationBypassLoggedRef.current) {
          expoGoNotificationBypassLoggedRef.current = true;
          logExpoGoNotificationBypass('device-registration');
        }
        return;
      }

      if (options?.forcePrompt) {
        await resetPermissionLifecycleForManualEnable('notifications');
      }

      const Notifications = getNativeNotificationsModule('device-registration');
      if (!Notifications) {
        setPushPermissionStatus('UNAVAILABLE');
        setPushToken(null);
        deviceRegistrationRef.current.expoPushToken = null;
        deviceRegistrationRef.current.fcmToken = null;
        return;
      }

      let permissions = await Notifications.getPermissionsAsync();
      if (permissions.status !== 'granted') {
        const lifecycle = await readPermissionLifecycle('notifications');
        const status = notificationLifecycleStatus(permissions.status, permissions.canAskAgain);
        if (status === 'permanently-denied') {
          await writePermissionLifecycle('notifications', 'permanently-denied');
        } else if (status === 'denied') {
          await writePermissionLifecycle('notifications', 'denied');
        }

        const canPrompt = options?.forcePrompt
          || (status === 'not-requested' && lifecycle.status === 'not-requested');

        if (canPrompt) {
          const accepted = await showPermissionEducation('notifications');
          permissions = accepted ? await Notifications.requestPermissionsAsync() : permissions;
          await writePermissionLifecycle(
            'notifications',
            notificationLifecycleStatus(permissions.status, permissions.canAskAgain),
          );
        }
      } else {
        await writePermissionLifecycle('notifications', 'granted');
      }

      const persistedLifecycle = await readPermissionLifecycle('notifications');
      const lifecycleStatus = notificationLifecycleStatus(permissions.status, permissions.canAskAgain);
      const effectiveStatus =
        permissions.status === 'granted'
          ? 'GRANTED'
          : persistedLifecycle.status === 'denied' || persistedLifecycle.status === 'permanently-denied'
            ? persistedLifecycle.status.toUpperCase()
            : lifecycleStatus.toUpperCase();
      const nextStatus = effectiveStatus.replace('-', '_');
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
        role: activeRole,
        has_fcm: Boolean(fcmToken),
        has_expo: Boolean(nextPushToken),
        permission: nextStatus,
      });
    } catch (error) {
      await recordFirebaseError(error, 'DEVICE_REGISTRATION_FAILED', {
        scope: 'notification',
        role: activeRole,
      });
      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'notification',
        code: 'DEVICE_REGISTRATION_FAILED',
        message: error instanceof Error ? error.message : 'Push registration failed.',
        context: {
          role: activeRole,
        },
      });
    }
  }, [activeRole, auth.status]);

  const syncDevicePolicy = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      return;
    }

    const deviceId = deviceRegistrationRef.current.deviceId ?? await readOrCreateDeviceId();
    deviceRegistrationRef.current.deviceId = deviceId;
    setDevicePosture((current) => (
      current.deviceId === deviceId ? current : { ...current, deviceId }
    ));

    try {
      const policy = await getMobileSessionPolicy(deviceId);
      setDevicePosture((current) => {
        const next = {
          ...current,
          managedMode: policy.managedMode ?? current.managedMode,
          kioskModeReady: Boolean(policy.kioskModeReady ?? current.kioskModeReady),
          remoteLogoutSupported: Boolean(policy.remoteLogoutSupported ?? current.remoteLogoutSupported),
          checkpointId: null,
          checkpointName: null,
          operationalZone: null,
          operationalModeEnabled: false,
          scannerFirst: false,
          restrictedNavigation: false,
          autoRestoreScanner: false,
          sharedOperationalDevice: false,
          inactivityTimeoutSeconds: null,
          suspicious: policy.suspiciousDevice,
          concurrentSessionCount: policy.concurrentSessionCount,
          lastPolicySyncAt: current.lastPolicySyncAt,
        };
        if (isSameDevicePosture(current, next)) {
          return current;
        }
        return {
          ...next,
          lastPolicySyncAt: new Date().toISOString(),
        };
      });

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
        await recordDiagnosticEvent({
          level: 'warn',
          scope: 'security',
          code: 'DEVICE_POLICY_REVIEW',
          message: 'Backend reported device policy review flags. Session remains active.',
          context: {
            role: activeRole,
          },
        });
      }
    } catch (error) {
      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'security',
        code: 'DEVICE_POLICY_SYNC_FAILED',
        message: error instanceof Error ? error.message : 'Device policy sync failed.',
        context: {
          role: activeRole,
        },
      });
    }
  }, [activeRole, auth.logout, auth.status]);

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
    (payload: Record<string, string | undefined> | string | null | undefined) => {
      if (!activeRole) {
        return;
      }

      const data = typeof payload === 'string' ? { type: payload } : (payload ?? {});
      const role = activeRole;
      const type = data.type;
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

      if (openOperationalDeepLink(role, {
        type: data.type,
        category: data.category,
        visitorId: data.visitorId,
        workforceId: data.workforceId,
        employeeId: data.employeeId,
        incidentId: data.incidentId,
        credentialId: data.credentialId,
        targetType: data.targetType,
        targetId: data.targetId,
        actionUrl: data.actionUrl,
        deepLink: data.deepLink,
      })) {
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
    [activeRole],
  );

  const handleNotificationResponse = useCallback(async (response: NotificationResponse) => {
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

    if (!activeRole) {
      return;
    }

    if (!isNotificationAllowedForRole(activeRole, data.type)) {
      return;
    }

    if (actionIdentifier === 'approve' && activeRole === 'EMPLOYEE' && visitorId) {
      await approveEmployeeVisitor(visitorId).catch(() => undefined);
      await invalidateRoleQueries();
      navigateToWorkspace('employee-requests');
      return;
    }

    if (actionIdentifier === 'reject' && activeRole === 'EMPLOYEE' && visitorId) {
      await rejectEmployeeVisitor(visitorId, { note: 'Rejected from mobile notification context.' }).catch(() => undefined);
      await invalidateRoleQueries();
      navigateToWorkspace('employee-requests');
      return;
    }

    await invalidateRoleQueries();
    handleNotificationRoute(data);
  }, [activeRole, handleNotificationRoute, invalidateRoleQueries]);

  const handleFirebaseNotificationResponse = useCallback(async (message: FirebaseMessagePayload, source: 'foreground' | 'opened' | 'initial') => {
    const data = message.data ?? {};
    const interactionScope = source === 'foreground' ? 'received' : 'opened';
    const responseKey = `${message.messageId ?? data.notificationId ?? data.type ?? 'firebase'}:${interactionScope}`;
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

    if (data.notificationId && source !== 'foreground') {
      await markNotificationRead(data.notificationId).catch(() => undefined);
    }

    if (!activeRole) {
      return;
    }

    if (!isNotificationAllowedForRole(activeRole, data.type)) {
      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'notification',
        code: 'ROLE_SCOPED_FCM_SKIPPED',
        message: 'An FCM notification outside the active workspace scope was ignored.',
        context: {
          role: activeRole,
          type: data.type ?? null,
        },
      });
      return;
    }

    await invalidateRoleQueries();
    if (source !== 'foreground') {
      handleNotificationRoute(data);
    }
  }, [activeRole, handleNotificationRoute, invalidateRoleQueries]);

  const probeRuntime = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      return;
    }

    try {
      const [health, versions] = await Promise.all([getHealthStatus(), getApiVersions()]);
      setDegradedMessage(null);
      setNetworkState((current) => {
        const now = new Date().toISOString();
        const next = {
          ...current,
          isApiReachable: true,
          consecutiveFailures: 0,
          lastApiReachableAt: now,
          lastOnlineAt: now,
        };
        return isSameNetworkState(current, next) ? current : next;
      });

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
          title: rollbackRequired ? 'Mobile update required' : 'Mobile update available',
          message: rollbackRequired
            ? 'Your organization requires a safer mobile release before this workspace can continue.'
            : 'A compatible AccessFlow mobile update is available when your operations window allows.',
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
      setNetworkState((current) => {
        const next = {
          ...current,
          isApiReachable: false,
          consecutiveFailures: current.consecutiveFailures + 1,
          lastOfflineAt: new Date().toISOString(),
        };
        return isSameNetworkState(current, next) ? current : next;
      });
      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'runtime',
        code: 'RUNTIME_SYNC_DEGRADED',
        message: error instanceof Error ? error.message : 'Runtime sync degraded.',
        context: {
          role: activeRole ?? 'signed-out',
        },
      });
    }
  }, [activeRole, applySessionLock, auth.status, upsertSystemNotification]);

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
          title: 'Saved actions completed',
          message: `${summary.synced} pending action${summary.synced === 1 ? '' : 's'} finished after the connection returned.`,
          read: false,
          createdAt: new Date().toISOString(),
          source: 'local',
        });
        await invalidateOperationalQueries();
      }
      await refreshOfflineQueueSize();
    } catch (error) {
      await recordSyncFailure({
        code: 'OFFLINE_QUEUE_RECONCILIATION_FAILED',
        message: error instanceof Error ? error.message : 'Offline queue reconciliation failed.',
        status: syncConnection.status,
      });
      throw error;
    } finally {
      setIsSyncingOfflineOperations(false);
    }
  }, [auth.status, invalidateOperationalQueries, refreshOfflineQueueSize, sessionLock.isLocked, syncConnection.status, upsertSystemNotification]);

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
            operationalSyncRuntime.syncNow(),
            probeRuntime(),
            syncDevicePolicy(),
            flushTelemetry(),
            syncOfflineOperations(),
            syncQueuedVisitorRequests(),
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
        && elapsedMs < SESSION_DIRECT_RESTORE_MS;

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

          if (elapsedMs < SESSION_DIRECT_RESTORE_MS) {
            await Promise.all([
              queryClient.resumePausedMutations().catch(() => undefined),
              refreshOfflineQueueSize(),
            ]);
            return;
          }

          if (elapsedMs >= FULL_SESSION_RECHECK_AFTER_BACKGROUND_MS) {
            const recovered = await auth.recoverRuntimeSession({
              trigger: 'resume',
              forceRefresh: true,
              failClosed: false,
              silent: true,
            });

            if (!recovered) {
              return;
            }
          }

          await Promise.all([
            queryClient.resumePausedMutations().catch(() => undefined),
            elapsedMs >= SESSION_DIRECT_RESTORE_MS ? invalidateOperationalQueries() : Promise.resolve(),
            elapsedMs >= SESSION_DIRECT_RESTORE_MS ? reconcileOperationalQueries() : Promise.resolve(),
            elapsedMs >= SESSION_DIRECT_RESTORE_MS ? probeRuntime() : Promise.resolve(),
            syncDevicePolicy(),
            flushTelemetry(),
            refreshOfflineQueueSize(),
            runOtaCheck(false),
          ]);
        } catch (error) {
          if (isOfflineNetworkState(networkState)) {
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
          await recordDiagnosticEvent({
            level: 'warn',
            scope: 'runtime',
            code: 'LIFECYCLE_RECOVERY_DEFERRED',
            message: error instanceof Error ? error.message : 'Lifecycle recovery deferred.',
            context: {
              reason,
              elapsedMs,
            },
          });
        } finally {
          lifecycleRecoveryPromiseRef.current = null;
        }
      })();

      await lifecycleRecoveryPromiseRef.current;
    },
    [
      auth,
      devicePosture.inactivityTimeoutSeconds,
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
    if (!activeRole || !sessionLock.isLocked) {
      return;
    }

    if (unlockPromiseRef.current) {
      return unlockPromiseRef.current;
    }

    setIsUnlocking(true);
    unlockPromiseRef.current = (async () => {
      try {
        await auth.refreshSession();
        await syncDevicePolicy();
        await releaseSessionLock();
        resetNavigationToRoleHome(activeRole);
        await syncNow();
      } finally {
        setIsUnlocking(false);
        unlockPromiseRef.current = null;
      }
    })();

    return unlockPromiseRef.current;
  }, [activeRole, auth.refreshSession, releaseSessionLock, sessionLock, syncDevicePolicy, syncNow]);

  useEffect(() => {
    void initializeProductionObservability();
  }, []);

  useEffect(() => {
    void setObservabilityContext({
      role: activeRole,
      audience: activeRole ? getWorkspaceConfig(activeRole).audience : null,
      workspace: activeSession
        ? activeSession.user.organizationCode || activeSession.user.organizationName || 'platform'
        : null,
    });
  }, [activeRole, activeSession]);

  useEffect(() => {
    const unsubscribeState = operationalSyncRuntime.subscribeState(setSyncConnection);
    const unsubscribeEvents = operationalSyncRuntime.subscribe((events) => {
      handleOperationalEvents(events);
    });

    return () => {
      unsubscribeEvents();
      unsubscribeState();
    };
  }, [handleOperationalEvents]);

  useEffect(() => {
    if (activeRole && !sessionLock.isLocked && canAccessOperationalFeed(activeRole)) {
      operationalSyncRuntime.start(syncConnection.cursor);
      return;
    }
    operationalSyncRuntime.stop();
  }, [activeRole, sessionLock.isLocked]);

  useEffect(() => {
    if (!activeRole || !canAccessOperationalFeed(activeRole)) {
      setLiveOperationalEvents([]);
    }
  }, [activeRole]);

  useEffect(() => {
    void (async () => {
      await clearSessionLockState().catch(() => undefined);
      const nextState = {
        ...defaultLockState,
        screenshotProtectionEnabled: apiConfig.security.screenshotProtectionEnabled,
      } satisfies SessionLockState;

      sessionLockRef.current = nextState;
      setSessionLock((current) => (isSameSessionLock(current, nextState) ? current : nextState));
      await refreshOfflineQueueSize();
    })().catch(() => undefined);
  }, [refreshOfflineQueueSize]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? null;
      const reachable = state.isInternetReachable ?? null;
      const offline = connected === false || reachable === false;
      const now = new Date().toISOString();

      setNetworkState((current) => {
        const next = {
          ...current,
          isConnected: connected,
          isInternetReachable: reachable,
          lastOnlineAt: offline ? current.lastOnlineAt : now,
          lastOfflineAt: offline ? now : current.lastOfflineAt,
        };
        return isSameNetworkState(current, next) ? current : next;
      });

      if (!offline && activeRole) {
        operationalSyncRuntime.resume();
        void syncNow();
      } else if (offline) {
        operationalSyncRuntime.markOffline();
      }
    });

    void NetInfo.fetch().then((state) => {
      const connected = state.isConnected ?? null;
      const reachable = state.isInternetReachable ?? null;
      setNetworkState((current) => {
        const next = {
          ...current,
          isConnected: connected,
          isInternetReachable: reachable,
        };
        return isSameNetworkState(current, next) ? current : next;
      });
    }).catch(() => undefined);

    return unsubscribe;
  }, [activeRole, syncNow]);

  useEffect(() => {
    void runOtaCheck(false);
  }, [runOtaCheck]);

  useEffect(() => {
    const Notifications = getNativeNotificationsModule('notification-channel-setup');
    if (!Notifications) {
      return;
    }

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
      await Notifications.setNotificationCategoryAsync('operational-critical', [
        { identifier: 'view_alert', buttonTitle: 'View alert' },
      ]);
      await Notifications.setNotificationCategoryAsync('workforce-update', [
        { identifier: 'view_request', buttonTitle: 'View request' },
      ]);
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (activeRole) {
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
    setSessionLock((current) => {
      const next = {
        ...current,
        isLocked: false,
        reason: null,
        lockedAt: null,
      };
      if (isSameSessionLock(current, next)) {
        return current;
      }
      sessionLockRef.current = next;
      return next;
    });
  }, [activeRole, flushTelemetry, probeRuntime, queryClient, registerCurrentDevice, syncDevicePolicy]);

  useEffect(() => {
    const Notifications = getNativeNotificationsModule('push-token-listener');
    if (!Notifications) {
      return undefined;
    }

    const pushTokenApi = Notifications as typeof Notifications & {
      addPushTokenListener?: (listener: (token: { data: string }) => void) => { remove: () => void };
    };

    const tokenSubscription = pushTokenApi.addPushTokenListener?.(({ data }) => {
      setPushToken(data);
      deviceRegistrationRef.current.expoPushToken = data;
      if (activeRole && deviceRegistrationRef.current.deviceId) {
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
  }, [activeRole, pushPermissionStatus]);

  useEffect(() => {
    const unsubscribe = onFirebaseTokenRefresh((token) => {
      deviceRegistrationRef.current.fcmToken = token;
      if (activeRole && deviceRegistrationRef.current.deviceId) {
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
  }, [activeRole, pushPermissionStatus]);

  useEffect(() => {
    const Notifications = getNativeNotificationsModule('notification-response-listener');
    if (!Notifications) {
      return undefined;
    }

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
      operationalSyncRuntime.setAppState(nextState);

      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAtRef.current = Date.now();
      }

      if (nextState === 'active' && previousState !== 'active' && activeRole) {
        const elapsedMs = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : 0;
        backgroundedAtRef.current = null;
        const lockThresholdMs = getSessionLockThresholdMs(devicePosture.inactivityTimeoutSeconds);

        void runLifecycleRecovery(
          elapsedMs >= lockThresholdMs ? 'inactive' : 'resume',
          elapsedMs,
        );
      }
    });

    return () => {
      subscription.remove();
    };
  }, [activeRole, devicePosture.inactivityTimeoutSeconds, runLifecycleRecovery]);

  useEffect(() => {
    if (!activeRole || sessionLock.isLocked) {
      return;
    }

    const intervalMs = activeRole === 'SECURITY_GUARD'
      ? apiConfig.sync.securityPollMs
      : activeRole === 'EMPLOYEE'
        ? apiConfig.sync.employeePollMs
        : activeRole === 'VISITOR'
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
  }, [activeRole, sessionLock.isLocked, syncNow]);

  useEffect(() => {
    if (!activeRole) {
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
  }, [activeRole, flushTelemetry]);

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
      if (deviceRegistrationRef.current.deviceId && supportsNativePushNotifications()) {
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
      : 'healthy';

  const offlineOperationalMode: OfflineOperationalMode = isOfflineNetworkState(networkState)
    ? 'offline'
    : networkState.consecutiveFailures >= 2
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
        role: activeRole ?? 'signed_out',
        api_reachable: networkState.isApiReachable,
      });
    }
  }, [activeRole, auth.status, networkState.isApiReachable, offlineOperationalMode]);

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
      liveOperationalEvents,
      syncConnection,
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
      liveOperationalEvents,
      syncConnection,
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

function isSameSessionLock(left: SessionLockState, right: SessionLockState) {
  return left.isLocked === right.isLocked
    && left.reason === right.reason
    && left.lockedAt === right.lockedAt
    && left.screenshotProtectionEnabled === right.screenshotProtectionEnabled;
}

function isSameDevicePosture(left: DevicePostureState, right: DevicePostureState) {
  return left.deviceId === right.deviceId
    && left.managedMode === right.managedMode
    && left.kioskModeReady === right.kioskModeReady
    && left.remoteLogoutSupported === right.remoteLogoutSupported
    && left.checkpointId === right.checkpointId
    && left.checkpointName === right.checkpointName
    && left.operationalZone === right.operationalZone
    && left.operationalModeEnabled === right.operationalModeEnabled
    && left.scannerFirst === right.scannerFirst
    && left.restrictedNavigation === right.restrictedNavigation
    && left.autoRestoreScanner === right.autoRestoreScanner
    && left.sharedOperationalDevice === right.sharedOperationalDevice
    && left.inactivityTimeoutSeconds === right.inactivityTimeoutSeconds
    && left.suspicious === right.suspicious
    && left.rootedOrJailbroken === right.rootedOrJailbroken
    && left.emulator === right.emulator
    && left.debugBuild === right.debugBuild
    && left.sensitiveOperationsRestricted === right.sensitiveOperationsRestricted
    && left.concurrentSessionCount === right.concurrentSessionCount
    && left.lastPolicySyncAt === right.lastPolicySyncAt
    && areStringArraysEqual(left.integrityReasons, right.integrityReasons);
}

function isSameNetworkState(left: NetworkReachabilityState, right: NetworkReachabilityState) {
  return left.isConnected === right.isConnected
    && left.isInternetReachable === right.isInternetReachable
    && left.isApiReachable === right.isApiReachable
    && left.lastOnlineAt === right.lastOnlineAt
    && left.lastOfflineAt === right.lastOfflineAt
    && left.lastApiReachableAt === right.lastApiReachableAt
    && left.consecutiveFailures === right.consecutiveFailures;
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function isOfflineNetworkState(state: NetworkReachabilityState) {
  return state.isConnected === false
    || state.isInternetReachable === false
    || (!state.isApiReachable && state.consecutiveFailures >= 2);
}

function notificationLifecycleStatus(status?: string | null, canAskAgain?: boolean | null) {
  if (status === 'granted') {
    return 'granted' as const;
  }
  if (canAskAgain === false) {
    return 'permanently-denied' as const;
  }
  if (status === 'denied') {
    return 'denied' as const;
  }
  return 'not-requested' as const;
}

function getSessionLockThresholdMs(policySeconds?: number | null) {
  if (policySeconds && policySeconds > 0) {
    return Math.max(SESSION_DIRECT_RESTORE_MS, policySeconds * 1_000);
  }
  return Math.max(SESSION_DIRECT_RESTORE_MS, apiConfig.security.inactivityLockMs);
}

function restoreOperationalWorkspace(reason: string, lastRestoreRef: { current: number }) {
  const now = Date.now();
  if (now - lastRestoreRef.current < 2_500) {
    return;
  }
  lastRestoreRef.current = now;
  navigateToWorkspace('security-scan');
  void recordOperationalMetric({
    name: 'runtime_recovery',
    tags: {
      reason: `operational-workspace-${reason}`,
    },
  });
}
