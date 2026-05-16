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
  security: {
    inactivityLockMs: number;
    requireBiometricUnlock: boolean;
    screenshotProtectionEnabled: boolean;
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

  try {
    const versionsUrl = new URL('/versions', `${apiRootUrl}/`);
    return versionsUrl.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
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
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development') {
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

function readPositiveNumber(value: string | undefined, fallbackValue: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

const apiBaseUrl = normalizeUrl(process.env.EXPO_PUBLIC_ACCESSFLOW_API_BASE_URL ?? '');
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
  security: {
    inactivityLockMs: readPositiveNumber(
      process.env.EXPO_PUBLIC_ACCESSFLOW_INACTIVITY_LOCK_MS,
      environment === 'production' ? 5 * 60_000 : 10 * 60_000,
    ),
    requireBiometricUnlock: String(process.env.EXPO_PUBLIC_ACCESSFLOW_REQUIRE_BIOMETRIC_UNLOCK ?? '').trim().toLowerCase() === 'true',
    screenshotProtectionEnabled:
      String(process.env.EXPO_PUBLIC_ACCESSFLOW_SCREENSHOT_PROTECTION ?? 'true').trim().toLowerCase() !== 'false',
  },
};
