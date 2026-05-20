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
export type DiagnosticScope = 'api' | 'auth' | 'runtime' | 'scanner' | 'notification' | 'navigation' | 'security' | 'telemetry' | 'sync';
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

export type SessionLockReason = 'inactive' | 'background' | 'manual' | 'update-required' | 'remote-invalidated' | 'suspicious-device';

export type SessionLockState = {
  isLocked: boolean;
  reason: SessionLockReason | null;
  lockedAt: string | null;
  inactivityTimeoutMs: number;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
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
  managedMode: 'personal' | 'shared-guard' | 'kiosk-ready' | 'organization-owned';
  kioskModeReady: boolean;
  remoteLogoutSupported: boolean;
  suspicious: boolean;
  concurrentSessionCount: number;
  lastPolicySyncAt: string | null;
};

export type OfflineScanQueueItem = {
  id: string;
  payload: string;
  payloadFingerprint: string;
  kind: 'visitor' | 'employee' | 'unknown';
  createdAt: string;
  attempts: number;
  lastError?: string | null;
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
  | 'runtime_recovery'
  | 'session_invalidated';

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
  deviceTrusted?: boolean;
  biometricRequired?: boolean;
  trustStatus?: TrustedDeviceStatus | null;
};

export type TrustedDeviceStatus = 'TRUSTED' | 'UNTRUSTED' | 'REVOKED' | 'SUSPICIOUS';

export type DeviceIntegritySignals = {
  rootedOrJailbroken: boolean;
  emulator: boolean;
  debugBuild: boolean;
  suspicious: boolean;
  reasons: string[];
};

export type TrustedDeviceRecord = {
  id: string;
  deviceId: string;
  deviceName?: string | null;
  deviceType?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  runtimeVersion?: string | null;
  trustStatus: TrustedDeviceStatus;
  trusted: boolean;
  active: boolean;
  biometricEnabled: boolean;
  currentDevice: boolean;
  suspicious: boolean;
  lastActiveAt?: string | null;
  trustEstablishedAt?: string | null;
  trustRevokedAt?: string | null;
  revokedReason?: string | null;
  integritySignals?: DeviceIntegritySignals | null;
};

export type TrustedDeviceListResponse = {
  devices: TrustedDeviceRecord[];
};
