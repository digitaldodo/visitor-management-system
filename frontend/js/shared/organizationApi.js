import { request } from "./httpClient.js";

const PUBLIC_ORGANIZATION_TTL_MS = 5 * 60 * 1000;
let publicOrganizationsCache = null;
let publicOrganizationsLoadedAt = 0;
let publicOrganizationsRequest = null;

export function listOrganizations(options = {}) {
  const { force = false } = options;
  const fresh = publicOrganizationsCache && Date.now() - publicOrganizationsLoadedAt < PUBLIC_ORGANIZATION_TTL_MS;
  if (!force && fresh) {
    return Promise.resolve(publicOrganizationsCache);
  }
  if (!force && publicOrganizationsRequest) {
    return publicOrganizationsRequest;
  }

  publicOrganizationsRequest = request("/organizations/public", { auth: false })
    .then((response) => {
      publicOrganizationsCache = response;
      publicOrganizationsLoadedAt = Date.now();
      return response;
    })
    .finally(() => {
      publicOrganizationsRequest = null;
    });

  return publicOrganizationsRequest;
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
