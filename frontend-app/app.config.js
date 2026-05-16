module.exports = ({ config }) => {
  const environment = process.env.EXPO_PUBLIC_ACCESSFLOW_ENVIRONMENT || config.extra?.accessflowReleaseChannel || 'production';
  const releaseChannel = process.env.EXPO_PUBLIC_ACCESSFLOW_RELEASE_CHANNEL || environment;
  const distributionChannel = process.env.EXPO_PUBLIC_ACCESSFLOW_DISTRIBUTION_CHANNEL || (environment === 'production' ? 'play-store' : 'internal');
  const projectId = process.env.EXPO_PUBLIC_ACCESSFLOW_EXPO_PROJECT_ID || config.extra?.eas?.projectId || '';
  const versionCode = config.android?.versionCode || 1;
  const buildId = process.env.EXPO_PUBLIC_ACCESSFLOW_BUILD_ID || config.extra?.accessflowBuildId || `${config.version}+${versionCode}`;
  const updatesEnabled = String(process.env.EXPO_PUBLIC_ACCESSFLOW_OTA_ENABLED ?? environment !== 'development') !== 'false';

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
      eas: projectId ? { projectId } : config.extra?.eas,
      accessflowReleaseChannel: releaseChannel,
      accessflowDistributionChannel: distributionChannel,
      accessflowBuildId: buildId,
      accessflowEnvironment: environment,
    },
  };
};
