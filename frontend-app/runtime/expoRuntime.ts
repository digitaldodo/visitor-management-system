import Constants from 'expo-constants';
import { LogBox, Platform } from 'react-native';

const EXPO_GO_NOTIFICATION_WARNING = 'expo-notifications: Android Push notifications functionality was removed from Expo Go';
const loggedExpoGoNotificationScopes = new Set<string>();

export function isExpoGoRuntime() {
  const executionEnvironment = String(Constants.executionEnvironment ?? '').toLowerCase();
  const appOwnership = String(Constants.appOwnership ?? '').toLowerCase();
  return appOwnership === 'expo' || executionEnvironment === 'storeclient' || executionEnvironment.includes('storeclient');
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
    if (loggedExpoGoNotificationScopes.size > 0 || loggedExpoGoNotificationScopes.has(scope)) {
      return;
    }
    loggedExpoGoNotificationScopes.add(scope);
    console.info('[AccessFlow] Native push notifications skipped in Expo Go. Use a development, preview, or production build to test push delivery.');
  }
}
