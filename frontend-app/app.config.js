module.exports = ({ config }) => {
  const defaultProjectId = '695a77a0-f60f-481f-93cd-23ebfb4c256b';
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
  const googleServicesFile = process.env.ACCESSFLOW_FIREBASE_ANDROID_GOOGLE_SERVICES_FILE
    || process.env.GOOGLE_SERVICES_JSON
    || config.android?.googleServicesFile;
  const firebaseEnabled = String(process.env.EXPO_PUBLIC_ACCESSFLOW_FIREBASE_ENABLED ?? 'true') !== 'false';
  const firebaseCrashlyticsEnabled = String(process.env.EXPO_PUBLIC_ACCESSFLOW_FIREBASE_CRASHLYTICS_ENABLED ?? firebaseEnabled) !== 'false';
  const firebaseAnalyticsEnabled = String(process.env.EXPO_PUBLIC_ACCESSFLOW_FIREBASE_ANALYTICS_ENABLED ?? firebaseEnabled) !== 'false';
  const firebaseMessagingEnabled = String(process.env.EXPO_PUBLIC_ACCESSFLOW_FIREBASE_MESSAGING_ENABLED ?? firebaseEnabled) !== 'false';
  const firebasePlugins = firebaseEnabled
    ? [
        '@react-native-firebase/app',
        '@react-native-firebase/messaging',
        '@react-native-firebase/crashlytics',
      ]
    : [];
  const pluginNames = new Set((config.plugins || []).map((plugin) => Array.isArray(plugin) ? plugin[0] : plugin));

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
    android: {
      ...config.android,
      googleServicesFile,
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
      accessflowFirebaseEnabled: firebaseEnabled,
      accessflowFirebaseCrashlyticsEnabled: firebaseCrashlyticsEnabled,
      accessflowFirebaseAnalyticsEnabled: firebaseAnalyticsEnabled,
      accessflowFirebaseMessagingEnabled: firebaseMessagingEnabled,
      accessflowFirebaseAppCheckPrepared: true,
    },
    plugins: [
      ...(config.plugins || []),
      ...firebasePlugins.filter((plugin) => !pluginNames.has(plugin)),
    ],
  };
};
