import type * as ExpoNotifications from 'expo-notifications';

import { logExpoGoNotificationBypass, supportsNativePushNotifications } from './expoRuntime';

declare const require: (moduleName: string) => typeof ExpoNotifications;

let notificationsModule: typeof ExpoNotifications | null | undefined;

export function getNativeNotificationsModule(scope: string) {
  if (!supportsNativePushNotifications()) {
    logExpoGoNotificationBypass(scope);
    return null;
  }

  if (notificationsModule !== undefined) {
    return notificationsModule;
  }

  try {
    notificationsModule = require('expo-notifications');
  } catch {
    notificationsModule = null;
  }

  return notificationsModule;
}
