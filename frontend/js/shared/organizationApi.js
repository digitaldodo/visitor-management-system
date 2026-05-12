import { request } from "./httpClient.js";

export function listOrganizations() {
  return request("/organizations/public", { auth: false });
}

export function listManagedOrganizations() {
  return request("/organizations");
}

export function listOrganizationWorkspaceItems() {
  return request("/organizations/workspace");
}

export function getOrganizationWorkspace(id) {
  return request(`/organizations/${encodeURIComponent(id)}/workspace`);
}

export function createOrganization(payload) {
  return request("/organizations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOrganization(id, payload) {
  return request(`/organizations/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
