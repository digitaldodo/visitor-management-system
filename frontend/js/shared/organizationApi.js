import { request } from "./httpClient.js";

export function listOrganizations() {
  return request("/organizations/public", { auth: false });
}

export function listManagedOrganizations() {
  return request("/organizations");
}
