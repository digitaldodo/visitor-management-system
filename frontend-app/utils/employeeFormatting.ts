import type { EmployeeAttendanceRecord, NotificationRecord, VisitorRecord, VisitorStatus } from '../types/domain';

export function formatDateTime(value?: string | null, timezone?: string | null) {
  const date = parseDate(value);
  if (!date) {
    return 'Not available';
  }

  return formatWithTimezone(date, timezone, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(value?: string | null, timezone?: string | null) {
  const date = parseDate(value);
  if (!date) {
    return 'Not available';
  }

  return formatWithTimezone(date, timezone, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDay(value?: string | null, timezone?: string | null) {
  const date = parseDate(value);
  if (!date) {
    return 'Not available';
  }

  return formatWithTimezone(date, timezone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatWindow(start?: string | null, end?: string | null, timezone?: string | null) {
  if (!start && !end) {
    return 'Window not assigned';
  }

  if (start && end) {
    return `${formatTime(start, timezone)} - ${formatTime(end, timezone)}`;
  }

  return start ? `Starts ${formatTime(start, timezone)}` : `Until ${formatTime(end, timezone)}`;
}

export function formatShift(shiftName?: string | null, shiftStartTime?: string | null, shiftEndTime?: string | null) {
  const parts = [shiftName, shiftStartTime && shiftEndTime ? `${shiftStartTime} - ${shiftEndTime}` : null].filter(Boolean);
  return parts.length ? parts.join(' | ') : 'General shift';
}

export function formatVisitorType(value?: string | null) {
  return humanizeToken(value || 'Visitor');
}

export function formatStatusLabel(value?: string | null) {
  return humanizeToken(value || 'Pending');
}

export function visitorTone(status?: VisitorStatus | null): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'APPROVED':
    case 'CHECKED_IN':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'REJECTED':
    case 'SUSPENDED':
    case 'EXPIRED':
      return 'danger';
    case 'CHECKED_OUT':
      return 'info';
    default:
      return 'default';
  }
}

export function notificationTone(notification: NotificationRecord): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const normalizedType = String(notification.type || '').toUpperCase();
  if (normalizedType.includes('DENIAL') || normalizedType.includes('REVOKED') || normalizedType.includes('ISSUE')) {
    return 'danger';
  }
  if (normalizedType.includes('ARRIVAL') || normalizedType.includes('APPROVAL')) {
    return 'info';
  }
  return notification.read ? 'default' : 'warning';
}

export function accessWindowLabel(visitor: VisitorRecord) {
  return formatWindow(
    visitor.accessWindowStartTime || visitor.scheduledStartTime,
    visitor.accessWindowEndTime || visitor.scheduledEndTime,
    visitor.organizationTimezone || visitor.scheduledTimezone,
  );
}

export function visitScheduleLabel(visitor: VisitorRecord) {
  const start = visitor.scheduledStartTime || visitor.validityStartDate;
  const end = visitor.scheduledEndTime || visitor.validityEndDate;
  if (!start && !end) {
    return 'Schedule pending';
  }

  if (visitor.visitorType === 'RECURRING' && visitor.recurringSchedule) {
    return `${formatVisitorType(visitor.visitorType)} | ${visitor.recurringSchedule}`;
  }

  const timezone = visitor.organizationTimezone || visitor.scheduledTimezone;
  return start && end
    ? `${formatDay(start, timezone)} | ${formatTime(start, timezone)} - ${formatTime(end, timezone)}`
    : formatDateTime(start || end, timezone);
}

export function derivePresenceState(records: EmployeeAttendanceRecord[]) {
  const latest = records[0];
  const lastCheckIn = records.find((entry) => entry.checkInTime)?.checkInTime ?? null;
  const lastCheckOut = records.find((entry) => entry.checkOutTime)?.checkOutTime ?? null;
  const currentState = latest?.state === 'IN' ? 'On site' : latest?.state === 'OUT' ? 'Off site' : 'Unknown';
  const status = latest?.status ? formatStatusLabel(latest.status) : currentState;

  return {
    currentState,
    status,
    lastCheckIn,
    lastCheckOut,
  };
}

function formatWithTimezone(date: Date, timezone: string | null | undefined, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: timezone || undefined,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

function parseDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
