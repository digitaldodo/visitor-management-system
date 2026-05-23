export const VISITOR_STATUS_LABELS = Object.freeze({
  PENDING: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Denied",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
});

export const VISITOR_INVITE_STATUS_LABELS = Object.freeze({
  INVITED: "Invited",
  PRE_REGISTRATION_PENDING: "Pre-registration pending",
  PRE_REGISTERED: "Pre-registered",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  BADGE_ISSUED: "Badge issued",
  REJECTED: "Denied",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  EXPIRED: "Expired",
  REVOKED: "Revoked",
});

export const WORKFORCE_STATUS_LABELS = Object.freeze({
  ACTIVE: "Active",
  UNVERIFIED: "Unverified",
  PENDING_APPROVAL: "Pending approval",
  CHANGES_REQUESTED: "Changes requested",
  REJECTED: "Denied",
  INACTIVE: "Disabled",
  DISABLED: "Disabled",
  LOCKED: "Locked",
});

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
  switch (normalizeStatus(status)) {
    case "APPROVED":
    case "ACTIVE":
    case "BADGE_ISSUED":
    case "CHECKED_IN":
    case "INSIDE":
    case "IN":
    case "PRESENT":
    case "VALID":
    case "SUCCESS":
      return "success";
    case "PENDING":
    case "PENDING_APPROVAL":
    case "PRE_REGISTERED":
    case "CHANGES_REQUESTED":
    case "LATE":
    case "NOT_ACTIVE_YET":
    case "OVERDUE_VISIT":
    case "SUSPENDED":
    case "WARNING":
      return "warning";
    case "REJECTED":
    case "DENIED":
    case "DISABLED":
    case "INACTIVE":
    case "LOCKED":
    case "EXPIRED":
    case "REVOKED":
    case "CANCELLED":
    case "SUSPENDED_VISITOR":
    case "DANGER":
      return "danger";
    case "CHECKED_OUT":
    case "OUT":
    case "OUTSIDE":
    case "UNVERIFIED":
    case "INVITED":
    case "PRE_REGISTRATION_PENDING":
    case "SENT":
    case "VIEWED":
    case "INFO":
      return "info";
    case "DEFAULT":
    case "NEUTRAL":
      return "neutral";
    default:
      return "neutral";
  }
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
