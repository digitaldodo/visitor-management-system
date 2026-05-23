import {
  enterpriseStatusLabels,
  enterpriseStatusToneMap,
  type EnterpriseStatusTone,
} from '../theme/enterpriseDesign';

export type { EnterpriseStatusTone };

export const ACCESSFLOW_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'EMPLOYEE',
  'SECURITY_GUARD',
  'RECEPTION',
  'OPERATOR',
  'MANAGER',
  'VISITOR',
] as const;

export type BackendRole = typeof ACCESSFLOW_ROLES[number];

export const VISITOR_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CHECKED_IN', 'CHECKED_OUT', 'EXPIRED', 'SUSPENDED'] as const;

export type VisitorStatus = typeof VISITOR_STATUSES[number];

export const VISITOR_INVITE_STATUSES = [
  'INVITED',
  'PRE_REGISTRATION_PENDING',
  'PRE_REGISTERED',
  'PENDING_APPROVAL',
  'APPROVED',
  'BADGE_ISSUED',
  'REJECTED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'SENT',
  'VIEWED',
  'REGISTRATION_COMPLETED',
  'QR_ISSUED',
  'ARRIVED',
  'EXPIRED',
  'REVOKED',
] as const;

export type VisitorInviteStatus = typeof VISITOR_INVITE_STATUSES[number];

export const WORKFORCE_STATUSES = ['ACTIVE', 'UNVERIFIED', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'REJECTED', 'DISABLED', 'LOCKED'] as const;

export type WorkforceStatus = typeof WORKFORCE_STATUSES[number];

export const BADGE_STATES = ['APPROVED', 'BADGE_ISSUED', 'CHECKED_IN', 'CHECKED_OUT', 'EXPIRED', 'REVOKED', 'SUSPENDED'] as const;

export type BadgeState = typeof BADGE_STATES[number];

export const APPROVAL_STATES = ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'] as const;

export type ApprovalState = typeof APPROVAL_STATES[number];

export const VISITOR_STATUS_LABELS: Record<VisitorStatus, string> = {
  ...enterpriseStatusLabels.visitor,
};

export const VISITOR_INVITE_STATUS_LABELS: Record<string, string> = {
  ...enterpriseStatusLabels.invite,
};

export const WORKFORCE_STATUS_LABELS: Record<string, string> = {
  ...enterpriseStatusLabels.workforce,
};

export const NOTIFICATION_EVENT_TYPES = [
  'VISITOR_APPROVAL_REQUEST',
  'VISITOR_APPROVED',
  'VISITOR_ARRIVED',
  'VISITOR_INVITE_SENT',
  'VISITOR_INVITE_VIEWED',
  'VISITOR_PRE_REGISTRATION_COMPLETED',
  'VISITOR_INVITE_REVOKED',
  'VISITOR_CHECKED_IN',
  'VISITOR_REJECTED',
  'VISITOR_EXPIRED',
  'WORKFORCE_ONBOARDING_REQUESTED',
  'WORKFORCE_ONBOARDING_APPROVED',
  'WORKFORCE_ONBOARDING_REJECTED',
  'SECURITY_INVALID_QR_SCAN',
  'SECURITY_DENIED_ENTRY',
  'SECURITY_MANUAL_OVERRIDE',
  'SYSTEM_SESSION_EXPIRED',
] as const;

export type NotificationEventType = typeof NOTIFICATION_EVENT_TYPES[number];

export function canonicalVisitorInviteStage(status?: string | null, qrIssuedAt?: string | null, arrivedAt?: string | null) {
  const normalizedStatus = String(status || 'INVITED').toUpperCase();
  if (normalizedStatus === 'CHECKED_OUT') {
    return 'CHECKED_OUT';
  }
  if (normalizedStatus === 'CHECKED_IN' || normalizedStatus === 'ARRIVED' || arrivedAt) {
    return 'CHECKED_IN';
  }
  if (normalizedStatus === 'BADGE_ISSUED' || normalizedStatus === 'QR_ISSUED' || qrIssuedAt) {
    return 'BADGE_ISSUED';
  }
  if (normalizedStatus === 'SENT') {
    return 'INVITED';
  }
  if (normalizedStatus === 'VIEWED') {
    return 'PRE_REGISTRATION_PENDING';
  }
  if (normalizedStatus === 'REGISTRATION_COMPLETED') {
    return 'PRE_REGISTERED';
  }
  return normalizedStatus;
}

export function isTerminalVisitorInviteStage(status?: string | null, qrIssuedAt?: string | null, arrivedAt?: string | null) {
  const stage = canonicalVisitorInviteStage(status, qrIssuedAt, arrivedAt);
  return ['REVOKED', 'EXPIRED', 'REJECTED', 'CHECKED_IN', 'CHECKED_OUT'].includes(stage);
}

export function canResendVisitorInvite(status?: string | null, visitorEmail?: string | null, qrIssuedAt?: string | null, arrivedAt?: string | null) {
  if (!String(visitorEmail || '').trim()) {
    return false;
  }
  return !isTerminalVisitorInviteStage(status, qrIssuedAt, arrivedAt);
}

export function visitorInviteStatusLabel(status?: string | null) {
  return enterpriseStatusLabel(canonicalVisitorInviteStage(status), 'invite');
}

export function visitorStatusLabel(status?: string | null) {
  return enterpriseStatusLabel(status, 'visitor');
}

export function workforceStatusLabel(status?: string | null) {
  return enterpriseStatusLabel(status, 'workforce');
}

export function enterpriseStatusLabel(status?: string | null, domain: 'visitor' | 'invite' | 'workforce' | 'generic' = 'generic') {
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return 'Unknown';
  }
  if (domain === 'visitor' && normalized in VISITOR_STATUS_LABELS) {
    return VISITOR_STATUS_LABELS[normalized as VisitorStatus];
  }
  if (domain === 'invite' && normalized in VISITOR_INVITE_STATUS_LABELS) {
    return VISITOR_INVITE_STATUS_LABELS[normalized];
  }
  if (domain === 'workforce' && normalized in WORKFORCE_STATUS_LABELS) {
    return WORKFORCE_STATUS_LABELS[normalized as WorkforceStatus];
  }
  if (normalized in VISITOR_STATUS_LABELS) {
    return VISITOR_STATUS_LABELS[normalized as VisitorStatus];
  }
  if (normalized in VISITOR_INVITE_STATUS_LABELS) {
    return VISITOR_INVITE_STATUS_LABELS[normalized];
  }
  if (normalized in WORKFORCE_STATUS_LABELS) {
    return WORKFORCE_STATUS_LABELS[normalized as WorkforceStatus];
  }
  return humanizeStatus(normalized);
}

export function enterpriseStatusTone(status?: string | null): EnterpriseStatusTone {
  return enterpriseStatusToneMap[normalizeStatus(status)] ?? 'neutral';
}

function normalizeStatus(status?: string | null) {
  return String(status || '').trim().toUpperCase().replaceAll('-', '_');
}

function humanizeStatus(status: string) {
  return status
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
