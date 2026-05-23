export type RuntimeEnvironment = 'development' | 'staging' | 'production' | 'internal';

export type RuntimeSnapshot = {
  apiBaseUrl: string;
  appVersion: string;
  runtimeVersion: string;
  buildId: string;
  environment: RuntimeEnvironment;
  releaseChannel: string;
  distributionChannel: string;
  apiVersion?: string;
  backendProfile?: string;
  minimumAppVersion?: string | null;
  minimumRuntimeVersion?: string | null;
  checkedAt: string;
};

export type VersionHandshakePayload = {
  current: string;
  supported: string[];
  profile: string;
  minimumAppVersion?: string | null;
  minimumRuntimeVersion?: string | null;
  recommendedAppVersion?: string | null;
  releaseChannel?: string | null;
  rollout?: {
    channel?: string | null;
    cohort?: string | null;
    percent?: number | null;
    forced?: boolean | null;
    rollback?: boolean | null;
  } | null;
};

export type DiagnosticLevel = 'info' | 'warn' | 'error';
export type DiagnosticScope = 'api' | 'auth' | 'runtime' | 'scanner' | 'notification' | 'navigation' | 'security' | 'telemetry' | 'sync' | 'performance';
export type DiagnosticContext = Record<string, string | number | boolean | null | undefined | object>;

export type DiagnosticEvent = {
  id: string;
  createdAt: string;
  level: DiagnosticLevel;
  scope: DiagnosticScope;
  code: string;
  message: string;
  context?: Record<string, string | number | boolean | null>;
};

export type SessionLockReason = 'update-required';

export type SessionLockState = {
  isLocked: boolean;
  reason: SessionLockReason | null;
  lockedAt: string | null;
  screenshotProtectionEnabled: boolean;
};

export type OtaUpdateState = {
  enabled: boolean;
  channel: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  createdAt: string | null;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch: boolean;
  emergencyLaunchReason: string | null;
  checkInProgress: boolean;
  updateAvailable: boolean;
  updateDownloaded: boolean;
  rollbackAvailable: boolean;
  lastCheckedAt: string | null;
  message: string | null;
};

export type DevicePostureState = {
  deviceId: string | null;
  managedMode: 'personal' | 'shared-guard' | 'kiosk-ready' | 'organization-owned' | 'checkpoint-scanner';
  kioskModeReady: boolean;
  remoteLogoutSupported: boolean;
  checkpointId?: string | null;
  checkpointName?: string | null;
  operationalZone?: string | null;
  operationalModeEnabled: boolean;
  scannerFirst: boolean;
  restrictedNavigation: boolean;
  autoRestoreScanner: boolean;
  sharedOperationalDevice: boolean;
  inactivityTimeoutSeconds?: number | null;
  suspicious: boolean;
  rootedOrJailbroken: boolean;
  emulator: boolean;
  debugBuild: boolean;
  integrityReasons: string[];
  sensitiveOperationsRestricted: boolean;
  concurrentSessionCount: number;
  lastPolicySyncAt: string | null;
};

export type NetworkReachabilityState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  isApiReachable: boolean;
  lastOnlineAt: string | null;
  lastOfflineAt: string | null;
  lastApiReachableAt: string | null;
  consecutiveFailures: number;
};

export type OfflineOperationalMode = 'online' | 'degraded' | 'offline';

type OfflineOperationalQueueStatus = 'pending' | 'syncing' | 'failed';

type OfflineOperationalOperationType =
  | 'visitor-qr-check-in'
  | 'visitor-check-out'
  | 'visitor-qr-verify'
  | 'employee-qr-scan';

export type OfflineOperationalQueueItem = {
  id: string;
  clientOperationId: string;
  dedupeKey: string;
  operationType: OfflineOperationalOperationType;
  kind: 'visitor' | 'employee' | 'unknown';
  qrPayload?: string | null;
  payloadFingerprint?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  localStatus?: string | null;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  status: OfflineOperationalQueueStatus;
  nextAttemptAt?: string | null;
  lastError?: string | null;
};

export type OfflineOperationalQueueInput = {
  operationType: OfflineOperationalOperationType;
  kind: OfflineOperationalQueueItem['kind'];
  qrPayload?: string | null;
  payloadFingerprint?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  localStatus?: string | null;
  dedupeKey?: string;
};

export type OfflineOperationalQueueResult = {
  item: OfflineOperationalQueueItem;
  duplicate: boolean;
};

export type OfflineOperationalCacheMetadata = {
  lastSyncAt: string | null;
  lastCleanupAt: string | null;
  schemaVersion: number;
};

type OfflineOperationalCacheEntry<T> = {
  record: T;
  cachedAt: string;
  lastSeenAt: string;
  source?: string | null;
};

export type OfflineOperationalCache = {
  visitors: Record<string, OfflineOperationalCacheEntry<import('./domain').VisitorRecord>>;
  employees: Record<string, OfflineOperationalCacheEntry<import('./domain').EmployeeDirectoryEntry>>;
  hosts: Record<string, OfflineOperationalCacheEntry<import('./domain').HostDirectoryEntry>>;
  attendance: Record<string, OfflineOperationalCacheEntry<import('./domain').EmployeeAttendanceRecord>>;
  qrVerifications: Record<string, {
    payloadFingerprint: string;
    result: import('./domain').QrVerificationResult;
    visitorId?: string | null;
    cachedAt: string;
    lastSeenAt: string;
  }>;
  employeeQrScans: Record<string, {
    payloadFingerprint: string;
    result: import('./domain').EmployeeScanResult;
    employeeId?: string | null;
    cachedAt: string;
    lastSeenAt: string;
  }>;
  recentOperationalRecords: Array<{
    id: string;
    recordType: 'visitor' | 'attendance' | 'offline-operation';
    recordId: string;
    title: string;
    status?: string | null;
    occurredAt: string;
  }>;
  metadata: OfflineOperationalCacheMetadata;
};

export type OperationalMetricName =
  | 'app_health'
  | 'api_latency'
  | 'auth_failure'
  | 'scanner_failure'
  | 'scanner_success'
  | 'scan_throughput'
  | 'denied_access'
  | 'visitor_verification'
  | 'workforce_presence'
  | 'notification_failure'
  | 'qr_validation_issue'
  | 'network_degraded'
  | 'offline_operation_queued'
  | 'offline_operation_synced'
  | 'offline_operation_failed'
  | 'operational_events_received'
  | 'runtime_recovery'
  | 'session_invalidated'
  | 'mobile_security_event'
  | 'event_loop_lag'
  | 'slow_runtime_operation'
  | 'memory_pressure';

export type OperationalMetric = {
  id: string;
  name: OperationalMetricName;
  value: number;
  createdAt: string;
  tags?: Record<string, string | number | boolean | null>;
};

export type MobileSessionPolicy = {
  sessionValid: boolean;
  forceLogout: boolean;
  reason?: string | null;
  suspiciousDevice: boolean;
  concurrentSessionCount: number;
  managedMode?: DevicePostureState['managedMode'] | null;
  kioskModeReady?: boolean | null;
  remoteLogoutSupported?: boolean | null;
  checkpointId?: string | null;
  checkpointName?: string | null;
  operationalZone?: string | null;
  operationalModeEnabled?: boolean | null;
  scannerFirst?: boolean | null;
  restrictedNavigation?: boolean | null;
  autoRestoreScanner?: boolean | null;
  sharedOperationalDevice?: boolean | null;
  inactivityTimeoutSeconds?: number | null;
};

export type DeviceIntegritySignals = {
  rootedOrJailbroken: boolean;
  emulator: boolean;
  debugBuild: boolean;
  tamperedRuntime?: boolean;
  suspicious: boolean;
  reasons: string[];
};
