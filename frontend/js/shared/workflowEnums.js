import { ENTERPRISE_STATUS_LABELS, ENTERPRISE_STATUS_TONES } from "./enterpriseDesign.js";

export const VISITOR_STATUS_LABELS = ENTERPRISE_STATUS_LABELS.visitor;

export const VISITOR_INVITE_STATUS_LABELS = ENTERPRISE_STATUS_LABELS.invite;

export const WORKFORCE_STATUS_LABELS = ENTERPRISE_STATUS_LABELS.workforce;

export const ROLE_LABELS = Object.freeze({
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
  EMPLOYEE: "Employee",
  SECURITY_GUARD: "Security guard",
  RECEPTION: "Reception",
  OPERATOR: "Operator",
  MANAGER: "Manager",
  VISITOR: "Visitor",
});

export const NOTIFICATION_EVENT_TYPES = Object.freeze([
  "VISITOR_APPROVAL_REQUEST",
  "VISITOR_APPROVED",
  "VISITOR_ARRIVED",
  "VISITOR_INVITE_SENT",
  "VISITOR_INVITE_VIEWED",
  "VISITOR_PRE_REGISTRATION_COMPLETED",
  "VISITOR_INVITE_REVOKED",
  "VISITOR_CHECKED_IN",
  "VISITOR_REJECTED",
  "VISITOR_EXPIRED",
  "WORKFORCE_ONBOARDING_REQUESTED",
  "WORKFORCE_ONBOARDING_APPROVED",
  "WORKFORCE_ONBOARDING_REJECTED",
  "SECURITY_INVALID_QR_SCAN",
  "SECURITY_DENIED_ENTRY",
  "SECURITY_MANUAL_OVERRIDE",
  "SYSTEM_SESSION_EXPIRED",
]);

export function canonicalVisitorInviteStage(inviteOrStatus) {
  const invite = typeof inviteOrStatus === "object" && inviteOrStatus !== null ? inviteOrStatus : { status: inviteOrStatus };
  const status = String(invite.lifecycleStage || invite.status || "INVITED").toUpperCase();
  if (status === "CHECKED_OUT") {
    return "CHECKED_OUT";
  }
  if (status === "CHECKED_IN" || status === "ARRIVED" || invite.arrivedAt) {
    return "CHECKED_IN";
  }
  if (status === "BADGE_ISSUED" || status === "QR_ISSUED" || invite.qrIssuedAt || invite.pass?.qrImageDataUri) {
    return "BADGE_ISSUED";
  }
  if (status === "SENT") {
    return "INVITED";
  }
  if (status === "VIEWED") {
    return "PRE_REGISTRATION_PENDING";
  }
  if (status === "REGISTRATION_COMPLETED") {
    return "PRE_REGISTERED";
  }
  return status;
}

export function visitorInviteStatusLabel(inviteOrStatus) {
  const stage = canonicalVisitorInviteStage(inviteOrStatus);
  return enterpriseStatusLabel(stage, "invite");
}

export function visitorStatusLabel(status) {
  return enterpriseStatusLabel(status, "visitor");
}

export function workforceStatusLabel(status) {
  return enterpriseStatusLabel(status, "workforce");
}

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

export function statusBadgeClass(status) {
  const normalized = normalizeStatus(status).toLowerCase().replaceAll("_", "-") || "neutral";
  return `status-badge--${normalized} status-badge--tone-${enterpriseStatusTone(status)}`;
}

function normalizeStatus(status) {
  return String(status || "").trim().toUpperCase().replaceAll("-", "_");
}

function humanizeStatus(status) {
  return status
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}
