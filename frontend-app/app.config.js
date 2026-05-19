module.exports = ({ config }) => {
  const defaultProjectId = 'f6f82d40-344d-4ae9-93bf-a58c869db1ac';
  const defaultApiBaseUrl = 'https://accessflow-api-goww.onrender.com/api/v1';
  const buildProfile = process.env.EAS_BUILD_PROFILE === 'preview' ? 'preview' : 'production';
  const profileDefaults = {
    preview: {
      environment: 'internal',
      releaseChannel: 'preview',
      distributionChannel: 'internal',
      managedDeviceMode: 'shared-guard',
      otaEnabled: true,
    },
    production: {
      environment: 'production',
      releaseChannel: 'production',
      distributionChannel: 'play-store',
      managedDeviceMode: 'organization-owned',
      otaEnabled: true,
    },
  }[buildProfile];

  const environment = process.env.EXPO_PUBLIC_ACCESSFLOW_ENVIRONMENT || profileDefaults.environment || config.extra?.accessflowEnvironment;
  const releaseChannel = process.env.EXPO_PUBLIC_ACCESSFLOW_RELEASE_CHANNEL || profileDefaults.releaseChannel || config.extra?.accessflowReleaseChannel;
  const distributionChannel = process.env.EXPO_PUBLIC_ACCESSFLOW_DISTRIBUTION_CHANNEL || profileDefaults.distributionChannel || config.extra?.accessflowDistributionChannel;
  const projectId = process.env.EXPO_PUBLIC_ACCESSFLOW_EXPO_PROJECT_ID || config.extra?.eas?.projectId || defaultProjectId;
  const apiBaseUrl = process.env.EXPO_PUBLIC_ACCESSFLOW_API_BASE_URL || config.extra?.accessflowApiBaseUrl || defaultApiBaseUrl;
  const managedDeviceMode = process.env.EXPO_PUBLIC_ACCESSFLOW_MANAGED_DEVICE_MODE || config.extra?.accessflowManagedDeviceMode || profileDefaults.managedDeviceMode;
  const versionCode = config.android?.versionCode || 1;
  const buildId = process.env.EXPO_PUBLIC_ACCESSFLOW_BUILD_ID || `${config.version}+${versionCode}`;
  const updatesEnabled = String(process.env.EXPO_PUBLIC_ACCESSFLOW_OTA_ENABLED ?? profileDefaults.otaEnabled) !== 'false';

  return {
    ...config,
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      enabled: updatesEnabled,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      url: projectId ? `https://u.expo.dev/${projectId}` : undefined,
      requestHeaders: {
        'expo-channel-name': releaseChannel,
      },
    },
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        projectId,
      },
      accessflowReleaseChannel: releaseChannel,
      accessflowDistributionChannel: distributionChannel,
      accessflowBuildId: buildId,
      accessflowEnvironment: environment,
      accessflowApiBaseUrl: apiBaseUrl,
      accessflowManagedDeviceMode: managedDeviceMode,
      accessflowOtaEnabled: updatesEnabled,
    },
  };
};
