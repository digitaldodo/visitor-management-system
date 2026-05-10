import { request } from "./httpClient.js";

export function getNotifications(limit = 10) {
  return request(`/notifications?limit=${limit}`);
}

export function markNotificationRead(id) {
  return request(`/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export function markAllNotificationsRead() {
  return request("/notifications/read-all", {
    method: "PATCH",
  });
}
