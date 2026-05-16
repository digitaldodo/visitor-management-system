import type {
  EmployeeAttendanceRecord,
  EmployeeDirectoryEntry,
  QrVerificationResult,
  VisitorRecord,
  VisitorStatus,
  VisitorType,
} from '../types/domain';

export function formatDateTime(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not recorded';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  }).format(date);
}

export function formatTime(value?: string | null) {
  if (!value) {
    return 'Any time';
  }
  return value;
}

export function formatVisitorWindow(visitor: Pick<VisitorRecord, 'accessWindowStartTime' | 'accessWindowEndTime' | 'scheduledStartTime' | 'scheduledEndTime'>) {
  const start = visitor.accessWindowStartTime ?? visitor.scheduledStartTime;
  const end = visitor.accessWindowEndTime ?? visitor.scheduledEndTime;
  if (!start || !end) {
    return 'Window unavailable';
  }
  return `${formatDateTime(start)} - ${formatDateTime(end, { hour: 'numeric', minute: '2-digit' })}`;
}

export function visitorTypeLabel(type?: VisitorType | null) {
  const labels: Record<VisitorType, string> = {
    ONE_TIME: 'One-time',
    WALK_IN: 'Walk-in',
    EMERGENCY: 'Emergency',
    RECURRING: 'Recurring',
    CONTRACTOR_VENDOR: 'Contractor',
  };

  return type ? labels[type] : 'Visitor';
}

export function visitorStatusLabel(status?: VisitorStatus | null) {
  const labels: Record<VisitorStatus, string> = {
    PENDING: 'Pending approval',
    APPROVED: 'Approved',
    REJECTED: 'Denied',
    CHECKED_IN: 'Checked in',
    CHECKED_OUT: 'Checked out',
    EXPIRED: 'Expired',
    SUSPENDED: 'Suspended',
  };

  return status ? labels[status] : 'Unknown';
}

export function statusTone(status?: string | null): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'APPROVED':
    case 'CHECKED_IN':
    case 'INSIDE':
    case 'PRESENT':
    case 'CHECKED_IN':
      return 'success';
    case 'PENDING':
    case 'LATE':
    case 'OUTSIDE_REVIEW':
    case 'SUSPENDED':
      return 'warning';
    case 'REJECTED':
    case 'EXPIRED':
    case 'DENIED':
    case 'CHECKED_OUT':
      return 'danger';
    default:
      return 'info';
  }
}

export function verificationTone(result?: QrVerificationResult | null): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  if (!result) {
    return 'info';
  }
  if (result.valid) {
    return 'success';
  }
  if (result.resultCode === 'PENDING_APPROVAL' || result.resultCode === 'NOT_ACTIVE_YET' || result.resultCode === 'OVERDUE_VISIT') {
    return 'warning';
  }
  return 'danger';
}

export function employeePresenceLabel(entry?: EmployeeAttendanceRecord | EmployeeDirectoryEntry | null) {
  if (!entry) {
    return 'Unknown';
  }
  if ('status' in entry && entry.status) {
    return String(entry.status).replaceAll('_', ' ');
  }
  return 'currentlyIn' in entry && entry.currentlyIn ? 'Inside' : 'Outside';
}

export function scanResultLabel(value?: string | null) {
  return value ? value.replaceAll('_', ' ') : 'Recorded';
}

export function relativePresenceSummary(entry?: EmployeeAttendanceRecord | null) {
  if (!entry) {
    return 'No presence event yet.';
  }
  if (entry.checkOutTime) {
    return `Checked out at ${formatDateTime(entry.checkOutTime, { hour: 'numeric', minute: '2-digit' })}.`;
  }
  if (entry.checkInTime) {
    return `Checked in at ${formatDateTime(entry.checkInTime, { hour: 'numeric', minute: '2-digit' })}.`;
  }
  return 'Presence event pending.';
}
