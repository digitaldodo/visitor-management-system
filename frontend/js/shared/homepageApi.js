import { request } from "./httpClient.js";

export function getHomepageContent() {
  return request("/homepage", { auth: false });
}

export function getHomepageSettings() {
  return request("/admin/homepage-settings");
}

export function updateHomepageSettings(payload) {
  return request("/admin/homepage-settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
