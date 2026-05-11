import { request } from "./httpClient.js";

export function searchVisitors(basePath, params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });
  return request(`${basePath}/visitors?${query.toString()}`);
}

export function createVisitor(basePath, payload) {
  return request(`${basePath}/visitors`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateVisitor(basePath, id, payload) {
  return request(`${basePath}/visitors/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function preApproveVisitor(payload) {
  return request("/employee/pre-approvals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function uploadVisitorPhoto(basePath, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`${basePath}/visitors/photo`, {
    method: "POST",
    body: formData,
  });
}

export function uploadVisitPhoto(file) {
  const formData = new FormData();
  formData.append("file", file);
  return request("/visitor/visits/photo", {
    method: "POST",
    body: formData,
  });
}

export function approveVisitor(basePath, id, note = "") {
  return request(`${basePath}/visitors/${id}/approve`, {
    method: "PATCH",
    body: JSON.stringify({ note }),
  });
}

export function rejectVisitor(basePath, id, note = "") {
  return request(`${basePath}/visitors/${id}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ note }),
  });
}

export function getVisitorPass(basePath, id) {
  if (basePath === "/visitor") {
    return request(`/visitor/visits/${id}/pass`);
  }
  return request(`${basePath}/visitors/${id}/pass`);
}

export function markBadgePrinted(basePath, id) {
  return request(`${basePath}/visitors/${id}/badge-printed`, {
    method: "PATCH",
  });
}

export function verifyQrPayload(basePath, qrPayload) {
  return request(`${basePath}/qr-verification`, {
    method: "POST",
    body: JSON.stringify({ qrPayload }),
  });
}

export function getSecurityMonitoring(query = "") {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
  return request(`/security/monitoring${suffix}`);
}

export function getVisitorHistory(basePath, id) {
  if (basePath === "/visitor") {
    return request("/visitor/history");
  }
  return request(`${basePath}/visitors/${id}/history`);
}


export function checkInVisitor(basePath, id) {
  return request(`${basePath}/visitors/${id}/check-in`, {
    method: "PATCH",
  });
}

export function checkOutVisitor(basePath, id) {
  return request(`${basePath}/visitors/${id}/check-out`, {
    method: "PATCH",
  });
}

export function deleteVisitor(basePath, id) {
  return request(`${basePath}/visitors/${id}`, {
    method: "DELETE",
  });
}
