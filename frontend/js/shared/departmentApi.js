import { request } from "./httpClient.js";

export function listDepartments(options = {}) {
  const params = new URLSearchParams();
  if (options.organizationId) {
    params.set("organizationId", options.organizationId);
  }
  if (options.includeInactive) {
    params.set("includeInactive", "true");
  }
  const query = params.toString();
  return request(`/admin/departments${query ? `?${query}` : ""}`);
}

export function createDepartment(payload) {
  return request("/admin/departments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDepartment(id, payload) {
  return request(`/admin/departments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
