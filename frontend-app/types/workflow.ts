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

export type EnterpriseStatusTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const VISITOR_STATUS_LABELS: Record<VisitorStatus, string> = {
  PENDING: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Denied',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
  EXPIRED: 'Expired',
  SUSPENDED: 'Suspended',
};

export const VISITOR_INVITE_STATUS_LABELS: Record<string, string> = {
  INVITED: 'Invited',
  PRE_REGISTRATION_PENDING: 'Pre-registration pending',
  PRE_REGISTERED: 'Pre-registered',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  BADGE_ISSUED: 'Badge issued',
  REJECTED: 'Denied',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
};

export const WORKFORCE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  UNVERIFIED: 'Unverified',
  PENDING_APPROVAL: 'Pending approval',
  CHANGES_REQUESTED: 'Changes requested',
  REJECTED: 'Denied',
  INACTIVE: 'Disabled',
  DISABLED: 'Disabled',
  LOCKED: 'Locked',
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
  switch (normalizeStatus(status)) {
    case 'APPROVED':
    case 'ACTIVE':
    case 'BADGE_ISSUED':
    case 'CHECKED_IN':
    case 'INSIDE':
    case 'IN':
    case 'PRESENT':
    case 'VALID':
    case 'SUCCESS':
      return 'success';
    case 'PENDING':
    case 'PENDING_APPROVAL':
    case 'PRE_REGISTERED':
    case 'CHANGES_REQUESTED':
    case 'LATE':
    case 'NOT_ACTIVE_YET':
    case 'OVERDUE_VISIT':
    case 'SUSPENDED':
    case 'WARNING':
      return 'warning';
    case 'REJECTED':
    case 'DENIED':
    case 'DISABLED':
    case 'INACTIVE':
    case 'LOCKED':
    case 'EXPIRED':
    case 'REVOKED':
    case 'CANCELLED':
    case 'SUSPENDED_VISITOR':
    case 'DANGER':
      return 'danger';
    case 'CHECKED_OUT':
    case 'OUT':
    case 'OUTSIDE':
    case 'UNVERIFIED':
    case 'INVITED':
    case 'PRE_REGISTRATION_PENDING':
    case 'SENT':
    case 'VIEWED':
    case 'INFO':
      return 'info';
    case 'DEFAULT':
    case 'NEUTRAL':
      return 'neutral';
    default:
      return 'neutral';
  }
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
