import { request } from "./httpClient.js";

export function getHealth() {
  return request("/health", { auth: false });
}
