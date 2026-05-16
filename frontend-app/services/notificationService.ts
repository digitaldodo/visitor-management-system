import { request } from '../api/apiClient';
import type { NotificationRecord } from '../types/domain';

export async function getNotifications(limit = 20) {
  return request<{ items: NotificationRecord[] }>({
    url: '/notifications',
    method: 'GET',
    params: {
      limit,
    },
  });
}
