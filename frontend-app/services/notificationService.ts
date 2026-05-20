import { request } from '../api/apiClient';
import type { NotificationInbox } from '../types/domain';

export type NotificationDevicePayload = {
  pushToken?: string | null;
  expoPushToken?: string | null;
  fcmToken?: string | null;
  pushProvider?: 'expo' | 'firebase' | 'firebase-expo' | 'none';
  deviceId: string;
  deviceName?: string | null;
  platform: string;
  appVersion?: string | null;
  runtimeVersion?: string | null;
  projectId?: string | null;
  permissionStatus: string;
};

export async function getNotifications(limit = 20) {
  return request<NotificationInbox>({
    url: '/notifications',
    method: 'GET',
    params: {
      limit,
    },
  });
}

export async function markNotificationRead(notificationId: string) {
  return request<NotificationInbox>({
    url: `/notifications/${encodeURIComponent(notificationId)}/read`,
    method: 'PATCH',
  });
}

export async function markAllNotificationsRead() {
  return request<NotificationInbox>({
    url: '/notifications/read-all',
    method: 'PATCH',
  });
}

export async function registerNotificationDevice(payload: NotificationDevicePayload) {
  const expoPushToken = payload.expoPushToken ?? payload.pushToken ?? null;

  return request<{ success: boolean }>({
    url: '/notifications/devices',
    method: 'POST',
    data: {
      ...payload,
      pushToken: expoPushToken,
      expoPushToken,
    },
  });
}

export async function unregisterNotificationDevice(payload: { expoPushToken?: string | null; fcmToken?: string | null; deviceId?: string | null }) {
  return request<{ success: boolean }>({
    url: '/notifications/devices/unregister',
    method: 'POST',
    data: payload,
  });
}
