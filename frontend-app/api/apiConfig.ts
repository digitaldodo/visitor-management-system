import * as Application from 'expo-application';
import Constants from 'expo-constants';

type RuntimeConfig = {
  apiBaseUrl: string;
  apiRootUrl: string;
  versionsUrl: string;
  isConfigured: boolean;
  appVersion: string;
  runtimeVersion: string;
  expoProjectId: string;
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

const apiBaseUrl = normalizeUrl(process.env.EXPO_PUBLIC_ACCESSFLOW_API_BASE_URL ?? '');
const apiRootUrl = deriveApiRoot(apiBaseUrl);
const expoProjectId = (process.env.EXPO_PUBLIC_ACCESSFLOW_EXPO_PROJECT_ID ?? Constants.expoConfig?.extra?.eas?.projectId ?? '').trim();

export const apiConfig: RuntimeConfig = {
  apiBaseUrl,
  apiRootUrl,
  versionsUrl: buildVersionsUrl(apiBaseUrl, apiRootUrl),
  isConfigured: Boolean(apiBaseUrl && apiRootUrl),
  appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0',
  runtimeVersion: readRuntimeVersion(),
  expoProjectId,
};
