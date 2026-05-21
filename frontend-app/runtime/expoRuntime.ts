import Constants from 'expo-constants';
import { LogBox, Platform } from 'react-native';

const EXPO_GO_NOTIFICATION_WARNING = 'expo-notifications: Android Push notifications functionality was removed from Expo Go';

export function isExpoGoRuntime() {
  const executionEnvironment = String(Constants.executionEnvironment ?? '').toLowerCase();
  return Constants.appOwnership === 'expo' || executionEnvironment.includes('storeclient');
}

export function supportsNativePushNotifications() {
  return Platform.OS === 'android' && !isExpoGoRuntime();
}

export function suppressExpoGoNotificationWarnings() {
  if (isExpoGoRuntime()) {
    LogBox.ignoreLogs([EXPO_GO_NOTIFICATION_WARNING]);
  }
}

export function logExpoGoNotificationBypass(scope: string) {
  if (__DEV__ && isExpoGoRuntime()) {
    console.info(`[AccessFlow] Native push notifications skipped in Expo Go (${scope}). Use a development, preview, or production build to test push delivery.`);
  }
}
