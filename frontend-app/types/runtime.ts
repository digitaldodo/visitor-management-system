export type RuntimeEnvironment = 'development' | 'staging' | 'production';

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
};

export type DiagnosticLevel = 'info' | 'warn' | 'error';
export type DiagnosticScope = 'api' | 'auth' | 'runtime' | 'scanner' | 'notification' | 'navigation' | 'security';
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

export type SessionLockReason = 'inactive' | 'background' | 'manual' | 'update-required';

export type SessionLockState = {
  isLocked: boolean;
  reason: SessionLockReason | null;
  lockedAt: string | null;
  inactivityTimeoutMs: number;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  screenshotProtectionEnabled: boolean;
};
