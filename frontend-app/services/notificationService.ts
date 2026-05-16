import { request } from '../api/apiClient';
import type { NotificationInbox } from '../types/domain';

export type NotificationDevicePayload = {
  expoPushToken?: string | null;
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
  return request<{ success: boolean }>({
    url: '/notifications/devices',
    method: 'POST',
    data: payload,
  });
}

export async function unregisterNotificationDevice(payload: { expoPushToken?: string | null; deviceId?: string | null }) {
  return request<{ success: boolean }>({
    url: '/notifications/devices/unregister',
    method: 'POST',
    data: payload,
  });
}
