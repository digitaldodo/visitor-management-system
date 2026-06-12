import { ENTERPRISE_STATUS_LABELS, ENTERPRISE_STATUS_TONES } from "./enterpriseDesign.js";

export const VISITOR_STATUS_LABELS = ENTERPRISE_STATUS_LABELS.visitor;

export const VISITOR_INVITE_STATUS_LABELS = ENTERPRISE_STATUS_LABELS.invite;

export const WORKFORCE_STATUS_LABELS = ENTERPRISE_STATUS_LABELS.workforce;

export function enterpriseStatusLabel(status, domain = "generic") {
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return "Unknown";
  }
  if (domain === "visitor" && VISITOR_STATUS_LABELS[normalized]) {
    return VISITOR_STATUS_LABELS[normalized];
  }
  if (domain === "invite" && VISITOR_INVITE_STATUS_LABELS[normalized]) {
    return VISITOR_INVITE_STATUS_LABELS[normalized];
  }
  if (domain === "workforce" && WORKFORCE_STATUS_LABELS[normalized]) {
    return WORKFORCE_STATUS_LABELS[normalized];
  }
  if (VISITOR_STATUS_LABELS[normalized]) {
    return VISITOR_STATUS_LABELS[normalized];
  }
  if (VISITOR_INVITE_STATUS_LABELS[normalized]) {
    return VISITOR_INVITE_STATUS_LABELS[normalized];
  }
  if (WORKFORCE_STATUS_LABELS[normalized]) {
    return WORKFORCE_STATUS_LABELS[normalized];
  }
  return humanizeStatus(normalized);
}

export function enterpriseStatusTone(status) {
  return ENTERPRISE_STATUS_TONES[normalizeStatus(status)] || "neutral";
}

export function normalizeStatus(status) {
  return String(status || "").trim().toUpperCase().replaceAll("-", "_");
}

export function humanizeStatus(status) {
  return String(status || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}
