import { enterpriseStatusLabel } from "./statusFormatting.js";

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

export function visitorTypeLabel(type) {
  if (type === "RECURRING") {
    return "Recurring visitor";
  }
  if (type === "CONTRACTOR_VENDOR") {
    return "Contractor / vendor";
  }
  if (type === "WALK_IN") {
    return "Walk-in visitor";
  }
  if (type === "EMERGENCY") {
    return "Emergency access";
  }
  return "One-time visitor";
}
