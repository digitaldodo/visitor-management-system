import AsyncStorage from '@react-native-async-storage/async-storage';

import { readSecureJson, removeSecureValue, writeSecureJson } from './secureStore';
import type {
  EmployeeAttendanceRecord,
  EmployeeDirectoryEntry,
  EmployeeScanResult,
  HostDirectoryEntry,
  QrVerificationResult,
  SecurityMonitoring,
  VisitorRecord,
} from '../types/domain';
import type {
  OfflineOperationalCache,
  OfflineOperationalCacheMetadata,
  OfflineOperationalQueueInput,
  OfflineOperationalQueueItem,
  OfflineOperationalQueueResult,
} from '../types/runtime';
import { visitorStatusLabel } from '../utils/securityFormatting';

const OFFLINE_CACHE_KEY = 'accessflow.mobile.offline-operational-cache.v1';
const OFFLINE_QUEUE_KEY = 'accessflow.mobile.offline-operational-queue.v1';

const MAX_VISITORS = 160;
const MAX_EMPLOYEES = 220;
const MAX_HOSTS = 120;
const MAX_ATTENDANCE = 140;
const MAX_QR_RECORDS = 220;
const MAX_OPERATION_RECORDS = 120;
const MAX_QUEUE_ITEMS = 80;
const MAX_QUEUE_ATTEMPTS = 8;
const CACHE_TTL_MS = 72 * 60 * 60 * 1000;
const STALE_SYNCING_OPERATION_MS = 2 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;
const OFFLINE_VALIDATION_MAX_AGE_MS = 18 * 60 * 60 * 1000;

const emptyCache = (): OfflineOperationalCache => ({
  visitors: {},
  employees: {},
  hosts: {},
  attendance: {},
  qrVerifications: {},
  employeeQrScans: {},
  recentOperationalRecords: [],
  metadata: {
    lastSyncAt: null,
    lastCleanupAt: null,
    schemaVersion: 1,
  },
});

export async function readOfflineOperationalCache(): Promise<OfflineOperationalCache> {
  const rawValue = await AsyncStorage.getItem(OFFLINE_CACHE_KEY);
  if (!rawValue) {
    return emptyCache();
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<OfflineOperationalCache>;
    return {
      ...emptyCache(),
      ...parsed,
      visitors: parsed.visitors ?? {},
      employees: parsed.employees ?? {},
      hosts: parsed.hosts ?? {},
      attendance: parsed.attendance ?? {},
      qrVerifications: parsed.qrVerifications ?? {},
      employeeQrScans: parsed.employeeQrScans ?? {},
      recentOperationalRecords: Array.isArray(parsed.recentOperationalRecords) ? parsed.recentOperationalRecords : [],
      metadata: {
        ...emptyCache().metadata,
        ...(parsed.metadata ?? {}),
      },
    };
  } catch {
    await AsyncStorage.removeItem(OFFLINE_CACHE_KEY);
    return emptyCache();
  }
}

export async function readOfflineOperationalMetadata(): Promise<OfflineOperationalCacheMetadata> {
  return (await readOfflineOperationalCache()).metadata;
}

export async function upsertCachedVisitors(records: Array<VisitorRecord | null | undefined>, source = 'security') {
  const usableRecords = records.filter(Boolean) as VisitorRecord[];
  if (!usableRecords.length) {
    return;
  }

  await mutateCache((cache) => {
    const cachedAt = new Date().toISOString();
    usableRecords.forEach((record) => {
      if (!record.id) {
        return;
      }
      cache.visitors[record.id] = {
        record: sanitizeVisitorRecord(record),
        cachedAt,
        lastSeenAt: cachedAt,
        source,
      };
    });
    cache.metadata.lastSyncAt = cachedAt;
    cache.recentOperationalRecords = mergeRecentOperationalRecords(
      cache.recentOperationalRecords,
      usableRecords.map((record) => ({
        id: `visitor-${record.id}`,
        recordType: 'visitor',
        recordId: record.id,
        title: record.fullName,
        status: record.status ?? null,
        occurredAt: record.updatedAt || record.checkOutTime || record.checkInTime || record.createdAt || cachedAt,
      })),
    );
  });
}

export async function upsertCachedVisitorsFromMonitoring(monitoring?: SecurityMonitoring | null) {
  if (!monitoring) {
    return;
  }

  await upsertCachedVisitors([
    ...(monitoring.currentlyInside ?? []),
    ...(monitoring.overdueVisitors ?? []),
    ...(monitoring.checkedOutVisitors ?? []),
    ...(monitoring.rejectedVisitors ?? []),
    ...(monitoring.approvedVisitors ?? []),
    ...(monitoring.activeRecurringVisitors ?? []),
    ...(monitoring.expiredRecurringVisitors ?? []),
    ...(monitoring.suspendedVisitors ?? []),
    ...(monitoring.dailyAttendanceLogs ?? []),
  ], 'security-monitoring');
}

export async function cacheQrVerification(payload: string, result: QrVerificationResult) {
  const normalized = payload.trim();
  if (!normalized || !result.recognized) {
    return;
  }

  await mutateCache((cache) => {
    const cachedAt = new Date().toISOString();
    const visitorRecord = qrVerificationToVisitorRecord(result);
    if (visitorRecord?.id) {
      cache.visitors[visitorRecord.id] = {
        record: visitorRecord,
        cachedAt,
        lastSeenAt: cachedAt,
        source: 'qr-verification',
      };
    }
    cache.qrVerifications[fingerprintPayload(normalized)] = {
      payloadFingerprint: fingerprintPayload(normalized),
      result: sanitizeQrVerification(result),
      visitorId: result.visitorId ?? null,
      cachedAt,
      lastSeenAt: cachedAt,
    };
    cache.metadata.lastSyncAt = cachedAt;
  });
}

export async function upsertCachedEmployees(records: Array<EmployeeDirectoryEntry | null | undefined>, source = 'security') {
  const usableRecords = records.filter(Boolean) as EmployeeDirectoryEntry[];
  if (!usableRecords.length) {
    return;
  }

  await mutateCache((cache) => {
    const cachedAt = new Date().toISOString();
    usableRecords.forEach((record) => {
      if (!record.id) {
        return;
      }
      cache.employees[record.id] = {
        record: sanitizeEmployeeRecord(record),
        cachedAt,
        lastSeenAt: cachedAt,
        source,
      };
    });
    cache.metadata.lastSyncAt = cachedAt;
  });
}

export async function upsertCachedAttendance(records: Array<EmployeeAttendanceRecord | null | undefined>) {
  const usableRecords = records.filter(Boolean) as EmployeeAttendanceRecord[];
  if (!usableRecords.length) {
    return;
  }

  await mutateCache((cache) => {
    const cachedAt = new Date().toISOString();
    usableRecords.forEach((record) => {
      if (!record.id) {
        return;
      }
      cache.attendance[record.id] = {
        record,
        cachedAt,
        lastSeenAt: cachedAt,
      };
    });
    cache.metadata.lastSyncAt = cachedAt;
    cache.recentOperationalRecords = mergeRecentOperationalRecords(
      cache.recentOperationalRecords,
      usableRecords.map((record) => ({
        id: `attendance-${record.id}`,
        recordType: 'attendance',
        recordId: record.id,
        title: record.employeeName,
        status: record.status ?? record.lastAction ?? null,
        occurredAt: record.updatedAt || record.checkOutTime || record.checkInTime || record.createdAt || cachedAt,
      })),
    );
  });
}

export async function cacheEmployeeScan(payload: string, result: EmployeeScanResult) {
  const normalized = payload.trim();
  if (!normalized || !result.employee?.id) {
    return;
  }

  await mutateCache((cache) => {
    const cachedAt = new Date().toISOString();
    const employee = sanitizeEmployeeRecord(result.employee as EmployeeDirectoryEntry);
    cache.employees[employee.id] = {
      record: employee,
      cachedAt,
      lastSeenAt: cachedAt,
      source: 'employee-qr-scan',
    };
    if (result.attendance?.id) {
      cache.attendance[result.attendance.id] = {
        record: result.attendance,
        cachedAt,
        lastSeenAt: cachedAt,
      };
    }
    cache.employeeQrScans[fingerprintPayload(normalized)] = {
      payloadFingerprint: fingerprintPayload(normalized),
      result: {
        valid: result.valid,
        action: result.action ?? null,
        headline: result.headline ?? null,
        message: result.message ?? null,
        recommendedAction: result.recommendedAction ?? null,
        shiftEligible: result.shiftEligible,
        currentlyIn: result.currentlyIn,
        employee,
        attendance: result.attendance ?? null,
      },
      employeeId: employee.id,
      cachedAt,
      lastSeenAt: cachedAt,
    };
    employeeCredentialAliases(normalized, employee.employeeId).forEach((alias) => {
      cache.employeeQrScans[alias] = {
        payloadFingerprint: alias,
        result: {
          valid: result.valid,
          action: result.action ?? null,
          headline: result.headline ?? null,
          message: result.message ?? null,
          recommendedAction: result.recommendedAction ?? null,
          shiftEligible: result.shiftEligible,
          currentlyIn: result.currentlyIn,
          employee,
          attendance: result.attendance ?? null,
        },
        employeeId: employee.id,
        cachedAt,
        lastSeenAt: cachedAt,
      };
    });
    cache.metadata.lastSyncAt = cachedAt;
  });
}

export async function upsertCachedHosts(records: Array<HostDirectoryEntry | null | undefined>) {
  const usableRecords = records.filter(Boolean) as HostDirectoryEntry[];
  if (!usableRecords.length) {
    return;
  }

  await mutateCache((cache) => {
    const cachedAt = new Date().toISOString();
    usableRecords.forEach((record) => {
      if (!record.id) {
        return;
      }
      cache.hosts[record.id] = {
        record,
        cachedAt,
        lastSeenAt: cachedAt,
      };
    });
    cache.metadata.lastSyncAt = cachedAt;
  });
}

export async function searchCachedVisitors(query: string, status?: string) {
  const cache = await readOfflineOperationalCache();
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedStatus = status && status !== 'ALL' ? status : null;
  return Object.values(cache.visitors)
    .map((entry) => entry.record)
    .filter((visitor) => !normalizedStatus || visitor.status === normalizedStatus)
    .filter((visitor) => !normalizedQuery || visitorSearchText(visitor).includes(normalizedQuery))
    .sort(compareOperationalRecords)
    .slice(0, 30);
}

export async function searchCachedEmployees(query: string) {
  const cache = await readOfflineOperationalCache();
  const normalizedQuery = query.trim().toLowerCase();
  return Object.values(cache.employees)
    .map((entry) => entry.record)
    .filter((employee) => !normalizedQuery || employeeSearchText(employee).includes(normalizedQuery))
    .sort((left, right) => String(left.fullName || '').localeCompare(String(right.fullName || '')))
    .slice(0, 40);
}

export async function readCachedAttendance() {
  const cache = await readOfflineOperationalCache();
  return Object.values(cache.attendance)
    .map((entry) => entry.record)
    .sort(compareAttendanceRecords)
    .slice(0, 40);
}

export async function findCachedQrVerification(payload: string) {
  const cache = await readOfflineOperationalCache();
  const cached = cache.qrVerifications[fingerprintPayload(payload.trim())];
  if (!cached) {
    return null;
  }

  return {
    ...cached,
    cacheAgeMs: Date.now() - Date.parse(cached.cachedAt),
    visitor: cached.visitorId ? cache.visitors[cached.visitorId]?.record ?? null : null,
  };
}

export async function findCachedEmployeeScan(payload: string) {
  const cache = await readOfflineOperationalCache();
  const normalized = payload.trim();
  const cached = cache.employeeQrScans[fingerprintPayload(normalized)]
    ?? employeeCredentialAliases(normalized).map((alias) => cache.employeeQrScans[alias]).find(Boolean);
  if (cached) {
    return {
      ...cached,
      cacheAgeMs: Date.now() - Date.parse(cached.cachedAt),
      employee: cached.employeeId ? cache.employees[cached.employeeId]?.record ?? cached.result.employee ?? null : cached.result.employee ?? null,
    };
  }

  const parsedEmployeeId = parseEmployeeIdFromCredential(normalized);
  const employeeEntry = parsedEmployeeId
    ? Object.values(cache.employees).find((entry) => entry.record.employeeId === parsedEmployeeId)
    : null;
  if (!employeeEntry) {
    return null;
  }

  return {
    payloadFingerprint: `employee-credential:${parsedEmployeeId}`,
    result: {
      valid: true,
      action: null,
      headline: 'Offline workforce directory match',
      message: 'Known worker found in the local workforce directory.',
      recommendedAction: null,
      shiftEligible: true,
      currentlyIn: Boolean(employeeEntry.record.currentlyIn),
      employee: employeeEntry.record,
      attendance: null,
    },
    employeeId: employeeEntry.record.id,
    cachedAt: employeeEntry.cachedAt,
    lastSeenAt: employeeEntry.lastSeenAt,
    cacheAgeMs: Date.now() - Date.parse(employeeEntry.cachedAt),
    employee: employeeEntry.record,
  };
}

export function canUseCachedVisitorForOfflineOperation(input: {
  cachedAt: string;
  result: QrVerificationResult;
  visitor?: VisitorRecord | null;
}) {
  const status = input.visitor?.status ?? input.result.status;
  const expiresAt = input.result.expiresAt ?? input.visitor?.qrExpiresAt ?? input.visitor?.approvalExpiresAt ?? input.visitor?.validityEndDate;
  const stale = Date.now() - Date.parse(input.cachedAt) > OFFLINE_VALIDATION_MAX_AGE_MS;
  const expired = expiresAt ? Date.parse(expiresAt) <= Date.now() : false;
  const blockedStatus = ['REJECTED', 'EXPIRED', 'SUSPENDED'].includes(String(status || ''));

  if (!input.result.recognized || !input.result.visitorId) {
    return { allowed: false, reason: 'Badge is not in the offline cache.' };
  }
  if (stale) {
    return { allowed: false, reason: 'Saved badge data is stale and needs AccessFlow verification.' };
  }
  if (expired) {
    return { allowed: false, reason: 'Cached badge has expired. Connectivity is required.' };
  }
  if (blockedStatus || !input.result.valid) {
    return { allowed: false, reason: 'Cached record is blocked or no longer valid.' };
  }
  if (!['APPROVED', 'CHECKED_IN'].includes(String(status || ''))) {
    return { allowed: false, reason: 'Only approved or checked-in cached visitors can be processed offline.' };
  }

  return { allowed: true, reason: null };
}

export function canUseCachedEmployeeForOfflineOperation(input: {
  cachedAt: string;
  result: EmployeeScanResult;
  employee?: EmployeeDirectoryEntry | null;
}) {
  const employee = input.employee ?? input.result.employee;
  const stale = Date.now() - Date.parse(input.cachedAt) > OFFLINE_VALIDATION_MAX_AGE_MS;
  const inactive = !employee?.active || ['INACTIVE', 'SUSPENDED', 'REVOKED', 'DISABLED'].includes(String(employee?.accountStatus || '').toUpperCase());

  if (!employee?.id) {
    return { allowed: false, reason: 'Worker badge is not in the offline cache.' };
  }
  if (stale) {
    return { allowed: false, reason: 'Saved workforce record is stale and needs AccessFlow verification.' };
  }
  if (inactive || !input.result.valid) {
    return { allowed: false, reason: 'Cached workforce credential is not active.' };
  }

  return { allowed: true, reason: null };
}

export function buildOfflineVisitorVerification(input: {
  cachedAt: string;
  result: QrVerificationResult;
  visitor?: VisitorRecord | null;
  queued: boolean;
}) {
  const visitor = input.visitor;
  const status = visitor?.status ?? input.result.status;
  const action = status === 'CHECKED_IN' ? 'check-out' : 'check-in';
  return {
    ...input.result,
    status,
    statusLabel: visitorStatusLabel(status),
    valid: true,
    canCheckIn: false,
    canCheckOut: false,
    headline: 'Offline cache match',
    message: input.queued
      ? `Known ${visitor?.fullName ?? input.result.fullName ?? 'visitor'} ${action} was queued for secure sync.`
      : 'Known visitor found in local cache. Connectivity is required for privileged actions.',
    recommendedAction: `Offline data from ${formatCacheAge(input.cachedAt)}. Treat as provisional until sync confirms.`,
  } satisfies QrVerificationResult;
}

export function buildOfflineEmployeeScan(input: {
  cachedAt: string;
  result: EmployeeScanResult;
  employee?: EmployeeDirectoryEntry | null;
  queued: boolean;
}) {
  const employee = input.employee ?? input.result.employee;
  const currentlyIn = Boolean(employee?.currentlyIn ?? input.result.currentlyIn);
  return {
    ...input.result,
    employee: employee ?? input.result.employee ?? null,
    valid: true,
    currentlyIn,
    action: currentlyIn ? 'CHECKED_OUT' : 'CHECKED_IN',
    headline: 'Offline workforce match',
    message: input.queued
      ? `${employee?.fullName ?? 'Worker'} ${currentlyIn ? 'check-out' : 'check-in'} was queued for secure sync.`
      : 'Known worker found in local cache. Connectivity is required for privileged actions.',
    recommendedAction: `Offline data from ${formatCacheAge(input.cachedAt)}. Treat as provisional until sync confirms.`,
  } satisfies EmployeeScanResult;
}

export async function readOfflineOperationalQueue(): Promise<OfflineOperationalQueueItem[]> {
  const queued = await readSecureJson<OfflineOperationalQueueItem[]>(OFFLINE_QUEUE_KEY);
  return Array.isArray(queued) ? queued : [];
}

export async function recoverOfflineOperationalQueue() {
  const now = Date.now();
  let changed = false;
  const queue = (await readOfflineOperationalQueue()).map((item) => {
    if (item.status !== 'syncing') {
      return item;
    }
    const updatedAt = Date.parse(item.updatedAt || item.createdAt || '');
    if (Number.isFinite(updatedAt) && now - updatedAt < STALE_SYNCING_OPERATION_MS) {
      return item;
    }
    changed = true;
    return {
      ...item,
      status: 'pending',
      updatedAt: new Date(now).toISOString(),
      nextAttemptAt: null,
    } satisfies OfflineOperationalQueueItem;
  });
  if (changed) {
    await writeQueue(queue);
  }
  return queue;
}

export async function enqueueOfflineOperation(input: OfflineOperationalQueueInput): Promise<OfflineOperationalQueueResult> {
  const now = new Date().toISOString();
  const payloadFingerprint = input.qrPayload ? fingerprintPayload(input.qrPayload.trim()) : input.payloadFingerprint ?? null;
  const dedupeKey = input.dedupeKey ?? [
    input.operationType,
    input.targetId ?? payloadFingerprint ?? 'unknown',
  ].join(':');
  const current = await readOfflineOperationalQueue();
  const activeDuplicate = current.find((item) => item.dedupeKey === dedupeKey && item.status !== 'failed');
  if (activeDuplicate) {
    return {
      item: activeDuplicate,
      duplicate: true,
    };
  }

  const item: OfflineOperationalQueueItem = {
    id: `offline-op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    clientOperationId: `af-${dedupeKey}-${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9._:-]/g, '-'),
    dedupeKey,
    operationType: input.operationType,
    kind: input.kind,
    qrPayload: input.qrPayload?.trim() ?? null,
    payloadFingerprint,
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel ?? null,
    localStatus: input.localStatus ?? null,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    status: 'pending',
    nextAttemptAt: null,
    lastError: null,
  };

  const nextQueue = [item, ...current].slice(0, MAX_QUEUE_ITEMS);
  await writeQueue(nextQueue);
  await appendLocalOperationalRecord(item);
  return { item, duplicate: false };
}

export async function markOfflineOperationAttempt(id: string, errorMessage?: string | null) {
  const now = new Date().toISOString();
  const nextQueue = (await readOfflineOperationalQueue()).map((item) => {
    if (item.id !== id) {
      return item;
    }
    const attempts = item.attempts + 1;
    return {
      ...item,
      attempts,
      updatedAt: now,
      status: attempts >= MAX_QUEUE_ATTEMPTS ? 'failed' : 'pending',
      nextAttemptAt: attempts >= MAX_QUEUE_ATTEMPTS ? null : new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
      lastError: errorMessage ?? null,
    } satisfies OfflineOperationalQueueItem;
  });
  await writeQueue(nextQueue);
}

export async function markOfflineOperationSyncing(id: string) {
  const now = new Date().toISOString();
  const nextQueue = (await readOfflineOperationalQueue()).map((item) => item.id === id
    ? { ...item, status: 'syncing', updatedAt: now, nextAttemptAt: null } satisfies OfflineOperationalQueueItem
    : item);
  await writeQueue(nextQueue);
}

export async function removeOfflineOperation(id: string) {
  const nextQueue = (await readOfflineOperationalQueue()).filter((item) => item.id !== id);
  await writeQueue(nextQueue);
}

export async function cleanupOfflineOperationalCache() {
  await mutateCache((cache) => {
    cache.metadata.lastCleanupAt = new Date().toISOString();
  });
}

export function fingerprintPayload(payload: string) {
  let hash = 0;
  for (let index = 0; index < payload.length; index += 1) {
    hash = ((hash << 5) - hash + payload.charCodeAt(index)) | 0;
  }
  return `qr-${Math.abs(hash).toString(36)}-${payload.length}`;
}

function employeeCredentialAliases(payload: string, knownEmployeeId?: string | null) {
  const employeeId = knownEmployeeId || parseEmployeeIdFromCredential(payload);
  return employeeId ? [`employee-credential:${employeeId}`] : [];
}

function parseEmployeeIdFromCredential(payload: string) {
  const normalized = payload.trim();
  if (normalized.startsWith('ACCESSFLOW_EMPLOYEE_DYNAMIC:') || normalized.startsWith('ACCESSFLOW_EMPLOYEE:')) {
    const parts = normalized.split(':');
    return parts.length > 2 && parts[2] ? parts[2] : null;
  }
  return null;
}

async function mutateCache(mutator: (cache: OfflineOperationalCache) => void) {
  const cache = await readOfflineOperationalCache();
  mutator(cache);
  await AsyncStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(trimCache(cache)));
}

function trimCache(cache: OfflineOperationalCache): OfflineOperationalCache {
  const cutoff = Date.now() - CACHE_TTL_MS;
  return {
    visitors: trimMap(cache.visitors, MAX_VISITORS, cutoff),
    employees: trimMap(cache.employees, MAX_EMPLOYEES, cutoff),
    hosts: trimMap(cache.hosts, MAX_HOSTS, cutoff),
    attendance: trimMap(cache.attendance, MAX_ATTENDANCE, cutoff),
    qrVerifications: trimMap(cache.qrVerifications, MAX_QR_RECORDS, cutoff),
    employeeQrScans: trimMap(cache.employeeQrScans, MAX_QR_RECORDS, cutoff),
    recentOperationalRecords: cache.recentOperationalRecords
      .sort((left, right) => Date.parse(right.occurredAt || '') - Date.parse(left.occurredAt || ''))
      .slice(0, MAX_OPERATION_RECORDS),
    metadata: cache.metadata,
  };
}

function trimMap<T extends { cachedAt: string; lastSeenAt?: string | null }>(records: Record<string, T>, limit: number, cutoff: number) {
  return Object.fromEntries(
    Object.entries(records)
      .filter(([, entry]) => Date.parse(entry.cachedAt) >= cutoff)
      .sort(([, left], [, right]) => Date.parse(right.lastSeenAt || right.cachedAt) - Date.parse(left.lastSeenAt || left.cachedAt))
      .slice(0, limit),
  );
}

function writeQueue(queue: OfflineOperationalQueueItem[]) {
  return writeSecureJson(OFFLINE_QUEUE_KEY, queue.slice(0, MAX_QUEUE_ITEMS));
}

function retryDelayMs(attempts: number) {
  const boundedAttempts = Math.max(1, Math.min(attempts, 6));
  return Math.min(MAX_RETRY_DELAY_MS, 15_000 * 2 ** (boundedAttempts - 1));
}

async function appendLocalOperationalRecord(item: OfflineOperationalQueueItem) {
  await mutateCache((cache) => {
    cache.recentOperationalRecords = mergeRecentOperationalRecords(cache.recentOperationalRecords, [{
      id: item.id,
      recordType: 'offline-operation',
      recordId: item.targetId ?? item.payloadFingerprint ?? item.id,
      title: item.targetLabel ?? offlineOperationLabel(item),
      status: item.status,
      occurredAt: item.createdAt,
    }]);
  });
}

function offlineOperationLabel(item: OfflineOperationalQueueItem) {
  switch (item.operationType) {
    case 'visitor-qr-check-in':
      return 'Offline visitor check-in';
    case 'visitor-check-out':
      return 'Offline visitor check-out';
    case 'employee-qr-scan':
      return 'Offline workforce scan';
    default:
      return 'Offline verification';
  }
}

function sanitizeVisitorRecord(record: VisitorRecord): VisitorRecord {
  return {
    ...record,
    photoUrl: record.photoUrl ?? null,
    statusHistory: (record.statusHistory ?? []).slice(0, 12),
  };
}

function sanitizeEmployeeRecord(record: EmployeeDirectoryEntry): EmployeeDirectoryEntry {
  return {
    ...record,
    email: record.email || '',
  };
}

function sanitizeQrVerification(result: QrVerificationResult): QrVerificationResult {
  return {
    ...result,
    photoUrl: result.photoUrl ?? null,
  };
}

function qrVerificationToVisitorRecord(result: QrVerificationResult): VisitorRecord | null {
  if (!result.visitorId) {
    return null;
  }

  return {
    id: result.visitorId,
    fullName: result.fullName || 'Cached visitor',
    companyName: result.companyName ?? null,
    organizationName: result.organizationName ?? null,
    organizationCode: result.organizationCode ?? null,
    organizationTimezone: result.organizationTimezone ?? null,
    visitorType: result.visitorType ?? null,
    vendorCompanyName: result.vendorCompanyName ?? null,
    hostEmployee: result.hostEmployee ?? null,
    hostEmployeeDepartment: result.hostEmployeeDepartment ?? null,
    sponsorEmployee: result.sponsorEmployee ?? null,
    department: result.department ?? null,
    validityStartDate: result.validityStartDate ?? null,
    validityEndDate: result.validityEndDate ?? null,
    recurringSchedule: result.recurringSchedule ?? null,
    allowedWeekdays: result.allowedWeekdays ?? null,
    allowedEntryStartTime: result.allowedEntryStartTime ?? null,
    allowedEntryEndTime: result.allowedEntryEndTime ?? null,
    photoUrl: result.photoUrl ?? null,
    status: result.status ?? null,
    badgeId: result.badgeId ?? null,
    qrExpiresAt: result.expiresAt ?? null,
    scheduledStartTime: result.scheduledStartTime ?? null,
    scheduledEndTime: result.scheduledEndTime ?? null,
    accessWindowStartTime: result.accessWindowStartTime ?? null,
    accessWindowEndTime: result.accessWindowEndTime ?? null,
    expectedDurationMinutes: result.expectedDurationMinutes ?? null,
    checkInTime: result.checkInTime ?? null,
    checkOutTime: result.checkOutTime ?? null,
    qrIssuedAt: result.issuedAt ?? null,
    updatedAt: new Date().toISOString(),
  };
}

function mergeRecentOperationalRecords(
  current: OfflineOperationalCache['recentOperationalRecords'],
  incoming: OfflineOperationalCache['recentOperationalRecords'],
) {
  const merged = new Map<string, OfflineOperationalCache['recentOperationalRecords'][number]>();
  [...incoming, ...current].forEach((record) => {
    if (record.id) {
      merged.set(record.id, record);
    }
  });
  return Array.from(merged.values())
    .sort((left, right) => Date.parse(right.occurredAt || '') - Date.parse(left.occurredAt || ''))
    .slice(0, MAX_OPERATION_RECORDS);
}

function visitorSearchText(visitor: VisitorRecord) {
  return [
    visitor.fullName,
    visitor.companyName,
    visitor.organizationName,
    visitor.hostEmployee,
    visitor.badgeId,
    visitor.phone,
    visitor.email,
    visitor.status,
  ].filter(Boolean).join(' ').toLowerCase();
}

function employeeSearchText(employee: EmployeeDirectoryEntry) {
  return [
    employee.fullName,
    employee.employeeId,
    employee.email,
    employee.department,
    employee.designation,
    employee.employeeType,
    employee.organizationName,
    employee.accountStatus,
  ].filter(Boolean).join(' ').toLowerCase();
}

function compareOperationalRecords(left: VisitorRecord, right: VisitorRecord) {
  return Date.parse(right.updatedAt || right.checkOutTime || right.checkInTime || right.createdAt || '')
    - Date.parse(left.updatedAt || left.checkOutTime || left.checkInTime || left.createdAt || '');
}

function compareAttendanceRecords(left: EmployeeAttendanceRecord, right: EmployeeAttendanceRecord) {
  return Date.parse(right.updatedAt || right.checkOutTime || right.checkInTime || right.createdAt || '')
    - Date.parse(left.updatedAt || left.checkOutTime || left.checkInTime || left.createdAt || '');
}

function formatCacheAge(cachedAt: string) {
  const ageMinutes = Math.max(0, Math.round((Date.now() - Date.parse(cachedAt)) / 60_000));
  if (ageMinutes < 1) {
    return 'moments ago';
  }
  if (ageMinutes < 60) {
    return `${ageMinutes} min ago`;
  }
  return `${Math.round(ageMinutes / 60)} hr ago`;
}
