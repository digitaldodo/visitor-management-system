import { request } from "./httpClient.js";

export function getOperationalEvents(cursor = "", limit = 80) {
  const query = new URLSearchParams();
  if (cursor) {
    query.set("cursor", cursor);
  }
  query.set("limit", String(limit));
  return request(`/mobile/operations/events?${query.toString()}`);
}
