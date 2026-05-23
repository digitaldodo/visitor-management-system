export const VISITOR_STATUS_LABELS = Object.freeze({
  PENDING: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
});

export const VISITOR_INVITE_STATUS_LABELS = Object.freeze({
  INVITED: "Invited",
  PRE_REGISTRATION_PENDING: "Pre-registration pending",
  PRE_REGISTERED: "Pre-registered",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  BADGE_ISSUED: "Badge issued",
  REJECTED: "Rejected",
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
  REJECTED: "Rejected",
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
  return VISITOR_INVITE_STATUS_LABELS[stage] || stage.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (value) => value.toUpperCase());
}

export function visitorStatusLabel(status) {
  return VISITOR_STATUS_LABELS[status] || String(status || "Unknown").replaceAll("_", " ");
}
