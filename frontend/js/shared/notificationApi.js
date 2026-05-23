import { request } from "./httpClient.js";

export function getNotifications(limit = 10) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
  return request(`/notifications?limit=${safeLimit}`);
}

export function markNotificationRead(id) {
  return request(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
  });
}

export function markAllNotificationsRead() {
  return request("/notifications/read-all", {
    method: "PATCH",
  });
}
