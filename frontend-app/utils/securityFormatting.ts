import type {
  EmployeeAttendanceRecord,
  EmployeeDirectoryEntry,
  QrVerificationResult,
  VisitorRecord,
  VisitorStatus,
  VisitorType,
} from '../types/domain';
import { enterpriseStatusLabel, enterpriseStatusTone, type EnterpriseStatusTone } from '../types/workflow';

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
  return enterpriseStatusLabel(status, 'visitor');
}

export function statusTone(status?: string | null): EnterpriseStatusTone {
  return enterpriseStatusTone(status);
}

export function verificationTone(result?: QrVerificationResult | null): EnterpriseStatusTone {
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
    return enterpriseStatusLabel(entry.status, 'workforce');
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
