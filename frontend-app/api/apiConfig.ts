import * as Application from 'expo-application';
import Constants from 'expo-constants';

import type { RuntimeEnvironment } from '../types/runtime';

type RuntimeConfig = {
  apiBaseUrl: string;
  apiRootUrl: string;
  versionsUrl: string;
  isConfigured: boolean;
  appVersion: string;
  runtimeVersion: string;
  buildId: string;
  environment: RuntimeEnvironment;
  releaseChannel: string;
  distributionChannel: string;
  expoProjectId: string;
  observabilityEnabled: boolean;
  telemetryFlushIntervalMs: number;
  firebase: {
    enabled: boolean;
    messagingEnabled: boolean;
    crashlyticsEnabled: boolean;
    analyticsEnabled: boolean;
    appCheckPrepared: boolean;
  };
  sync: {
    securityPollMs: number;
    employeePollMs: number;
    adminPollMs: number;
    staleCacheMs: number;
    eventBatchSize: number;
  };
  release: {
    otaEnabled: boolean;
    stagedRolloutCohort: string;
    internalTesting: boolean;
    diagnosticsUiEnabled: boolean;
    updateCheckIntervalMs: number;
  };
  deviceManagement: {
    managedMode: 'personal' | 'shared-guard' | 'kiosk-ready' | 'organization-owned';
    kioskModeReady: boolean;
  };
  branding: {
    organizationBrandingReady: boolean;
    defaultLogoUrl: string;
  };
  security: {
    inactivityLockMs: number;
    requireBiometricUnlock: boolean;
    screenshotProtectionEnabled: boolean;
    rootDetectionPrepared: boolean;
    certificatePinningEnabled: boolean;
    certificatePinningEnforced: boolean;
    certificatePinningPrepared: boolean;
    certificatePins: Record<string, {
      includeSubdomains: boolean;
      publicKeyHashes: string[];
      backupPublicKeyHashes: string[];
    }>;
    deviceAttestationPrepared: boolean;
  };
};

function normalizeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      return '';
    }
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function deriveApiRoot(apiBaseUrl: string) {
  if (!apiBaseUrl) {
    return '';
  }

  try {
    const url = new URL(apiBaseUrl);
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    url.pathname = normalizedPath.endsWith('/api/v1')
      ? normalizedPath.slice(0, -3)
      : normalizedPath;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function buildVersionsUrl(apiBaseUrl: string, apiRootUrl: string) {
  if (!apiBaseUrl || !apiRootUrl) {
    return '';
  }

  return `${apiRootUrl.replace(/\/+$/, '')}/versions`;
}

function readRuntimeVersion() {
  const nativeBuild = Application.nativeBuildVersion;
  if (nativeBuild) {
    return nativeBuild;
  }

  const versionCode = Constants.expoConfig?.android?.versionCode;
  if (typeof versionCode === 'number') {
    return String(versionCode);
  }

  const iosBuildNumber = Constants.expoConfig?.ios?.buildNumber;
  if (iosBuildNumber) {
    return iosBuildNumber;
  }

  return 'dev';
}

function readEnvironment(apiBaseUrl: string): RuntimeEnvironment {
  const explicit = String(process.env.EXPO_PUBLIC_ACCESSFLOW_ENVIRONMENT ?? '').trim().toLowerCase();
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development' || explicit === 'internal') {
    return explicit;
  }

  if (/onrender\.com/i.test(apiBaseUrl) && !/staging/i.test(apiBaseUrl)) {
    return 'production';
  }

  if (/staging/i.test(apiBaseUrl)) {
    return 'staging';
  }

  return __DEV__ ? 'development' : 'staging';
}

function readBoolean(value: string | undefined, fallbackValue: boolean) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallbackValue;
}

function readPositiveNumber(value: string | undefined, fallbackValue: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function readList(value: string | undefined) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readCertificatePins(apiBaseUrl: string) {
  if (!apiBaseUrl) {
    return {};
  }

  const publicKeyHashes = readList(process.env.EXPO_PUBLIC_ACCESSFLOW_TLS_PUBLIC_KEY_PINS);
  const backupPublicKeyHashes = readList(process.env.EXPO_PUBLIC_ACCESSFLOW_TLS_BACKUP_PUBLIC_KEY_PINS);
  if (!publicKeyHashes.length && !backupPublicKeyHashes.length) {
    return {};
  }

  try {
    const host = new URL(apiBaseUrl).hostname;
    return {
      [host]: {
        includeSubdomains: readBoolean(process.env.EXPO_PUBLIC_ACCESSFLOW_TLS_INCLUDE_SUBDOMAINS, true),
        publicKeyHashes,
        backupPublicKeyHashes,
      },
    };
  } catch {
    return {};
  }
}

const apiBaseUrl = normalizeUrl(
  process.env.EXPO_PUBLIC_ACCESSFLOW_API_BASE_URL
  ?? Constants.expoConfig?.extra?.accessflowApiBaseUrl
  ?? '',
);
const apiRootUrl = deriveApiRoot(apiBaseUrl);
const expoProjectId = (process.env.EXPO_PUBLIC_ACCESSFLOW_EXPO_PROJECT_ID ?? Constants.expoConfig?.extra?.eas?.projectId ?? '').trim();
const appVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';
const runtimeVersion = readRuntimeVersion();
const environment = readEnvironment(apiBaseUrl);
const releaseChannel = String(
  process.env.EXPO_PUBLIC_ACCESSFLOW_RELEASE_CHANNEL
  ?? Constants.expoConfig?.extra?.accessflowReleaseChannel
  ?? environment,
).trim();
const distributionChannel = String(
  process.env.EXPO_PUBLIC_ACCESSFLOW_DISTRIBUTION_CHANNEL
  ?? Constants.expoConfig?.extra?.accessflowDistributionChannel
  ?? (environment === 'production' ? 'play-store' : 'internal'),
).trim();
const buildId = String(
  process.env.EXPO_PUBLIC_ACCESSFLOW_BUILD_ID
  ?? Constants.expoConfig?.extra?.accessflowBuildId
  ?? `${appVersion}+${runtimeVersion}`,
).trim();
const certificatePins = readCertificatePins(apiBaseUrl);

export const apiConfig: RuntimeConfig = {
  apiBaseUrl,
  apiRootUrl,
  versionsUrl: buildVersionsUrl(apiBaseUrl, apiRootUrl),
  isConfigured: Boolean(apiBaseUrl && apiRootUrl),
  appVersion,
  runtimeVersion,
  buildId,
  environment,
  releaseChannel,
  distributionChannel,
  expoProjectId,
  observabilityEnabled: readBoolean(process.env.EXPO_PUBLIC_ACCESSFLOW_OBSERVABILITY_ENABLED, true),
  telemetryFlushIntervalMs: readPositiveNumber(
    process.env.EXPO_PUBLIC_ACCESSFLOW_TELEMETRY_FLUSH_MS,
    environment === 'production' ? 60_000 : 90_000,
  ),
  firebase: {
    enabled: readBoolean(
      process.env.EXPO_PUBLIC_ACCESSFLOW_FIREBASE_ENABLED,
      Boolean(Constants.expoConfig?.extra?.accessflowFirebaseEnabled ?? true),
    ),
    messagingEnabled: readBoolean(
      process.env.EXPO_PUBLIC_ACCESSFLOW_FIREBASE_MESSAGING_ENABLED,
      Boolean(Constants.expoConfig?.extra?.accessflowFirebaseMessagingEnabled ?? true),
    ),
    crashlyticsEnabled: readBoolean(
      process.env.EXPO_PUBLIC_ACCESSFLOW_FIREBASE_CRASHLYTICS_ENABLED,
      Boolean(Constants.expoConfig?.extra?.accessflowFirebaseCrashlyticsEnabled ?? true),
    ),
    analyticsEnabled: readBoolean(
      process.env.EXPO_PUBLIC_ACCESSFLOW_FIREBASE_ANALYTICS_ENABLED,
      Boolean(Constants.expoConfig?.extra?.accessflowFirebaseAnalyticsEnabled ?? true),
    ),
    appCheckPrepared: Boolean(Constants.expoConfig?.extra?.accessflowFirebaseAppCheckPrepared ?? true),
  },
  sync: {
    securityPollMs: readPositiveNumber(process.env.EXPO_PUBLIC_ACCESSFLOW_SECURITY_POLL_MS, 20_000),
    employeePollMs: readPositiveNumber(process.env.EXPO_PUBLIC_ACCESSFLOW_EMPLOYEE_POLL_MS, 35_000),
    adminPollMs: readPositiveNumber(process.env.EXPO_PUBLIC_ACCESSFLOW_ADMIN_POLL_MS, 45_000),
    staleCacheMs: readPositiveNumber(process.env.EXPO_PUBLIC_ACCESSFLOW_STALE_CACHE_MS, 2 * 60_000),
    eventBatchSize: readPositiveNumber(process.env.EXPO_PUBLIC_ACCESSFLOW_EVENT_BATCH_SIZE, 80),
  },
  release: {
    otaEnabled: readBoolean(
      process.env.EXPO_PUBLIC_ACCESSFLOW_OTA_ENABLED,
      Boolean(Constants.expoConfig?.extra?.accessflowOtaEnabled ?? environment !== 'development'),
    ),
    stagedRolloutCohort: String(process.env.EXPO_PUBLIC_ACCESSFLOW_ROLLOUT_COHORT ?? 'stable').trim(),
    internalTesting: distributionChannel === 'internal' || environment === 'internal',
    diagnosticsUiEnabled: readBoolean(
      process.env.EXPO_PUBLIC_ACCESSFLOW_DIAGNOSTICS_UI_ENABLED,
      false,
    ),
    updateCheckIntervalMs: readPositiveNumber(process.env.EXPO_PUBLIC_ACCESSFLOW_UPDATE_CHECK_MS, 15 * 60_000),
  },
  deviceManagement: {
    managedMode: normalizeManagedMode(
      process.env.EXPO_PUBLIC_ACCESSFLOW_MANAGED_DEVICE_MODE
      ?? Constants.expoConfig?.extra?.accessflowManagedDeviceMode,
    ),
    kioskModeReady: readBoolean(process.env.EXPO_PUBLIC_ACCESSFLOW_KIOSK_READY, false),
  },
  branding: {
    organizationBrandingReady: readBoolean(process.env.EXPO_PUBLIC_ACCESSFLOW_BRANDING_READY, false),
    defaultLogoUrl: String(process.env.EXPO_PUBLIC_ACCESSFLOW_DEFAULT_LOGO_URL ?? '').trim(),
  },
  security: {
    inactivityLockMs: readPositiveNumber(
      process.env.EXPO_PUBLIC_ACCESSFLOW_INACTIVITY_LOCK_MS,
      environment === 'production' ? 5 * 60_000 : 10 * 60_000,
    ),
    requireBiometricUnlock: String(process.env.EXPO_PUBLIC_ACCESSFLOW_REQUIRE_BIOMETRIC_UNLOCK ?? '').trim().toLowerCase() === 'true',
    screenshotProtectionEnabled:
      String(process.env.EXPO_PUBLIC_ACCESSFLOW_SCREENSHOT_PROTECTION ?? 'true').trim().toLowerCase() !== 'false',
    rootDetectionPrepared: true,
    certificatePinningEnabled: readBoolean(
      process.env.EXPO_PUBLIC_ACCESSFLOW_TLS_PINNING_ENABLED,
      environment === 'production' || environment === 'staging',
    ),
    certificatePinningEnforced: readBoolean(
      process.env.EXPO_PUBLIC_ACCESSFLOW_TLS_PINNING_ENFORCED,
      environment === 'production',
    ),
    certificatePinningPrepared: Object.keys(certificatePins).length > 0,
    certificatePins,
    deviceAttestationPrepared: false,
  },
};

function normalizeManagedMode(value: string | undefined): RuntimeConfig['deviceManagement']['managedMode'] {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'shared-guard' || normalized === 'kiosk-ready' || normalized === 'organization-owned') {
    return normalized;
  }
  return 'personal';
}
