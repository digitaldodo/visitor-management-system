import { enterpriseStatusTone, normalizeStatus } from "./statusFormatting.js";

export function statusBadgeClass(status) {
  const normalized = normalizeStatus(status).toLowerCase().replaceAll("_", "-") || "neutral";
  return `status-badge--${normalized} status-badge--tone-${enterpriseStatusTone(status)}`;
}
