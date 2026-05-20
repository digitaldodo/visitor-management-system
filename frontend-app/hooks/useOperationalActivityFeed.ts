import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../auth/AuthProvider';
import { useLocalization } from '../localization/LocalizationProvider';
import { useOperationalRuntime } from '../runtime/OperationalRuntimeProvider';
import { getAdminUsers, getAdminVisitors, getAdminWorkforceAttendance, getAdminWorkforceOnboarding } from '../services/adminService';
import { getEmergencyFeed, getEmergencyState } from '../services/emergencyService';
import { getEmployeeApprovals, getEmployeeAttendance, getEmployeeNotifications, getEmployeePreApprovals } from '../services/employeeService';
import { getNotifications } from '../services/notificationService';
import { getSecurityAttendance, getSecurityMonitoring, getSecurityVisitors } from '../services/securityService';
import { getVisitorNotifications, getVisitorVisits } from '../services/visitorService';
import { readOfflineOperationalCache, readOfflineOperationalQueue } from '../storage/offlineOperationalStore';
import type { ActiveWorkspaceRole } from '../types/auth';
import type {
  EmployeeAttendanceRecord,
  EmergencyIncident,
  NotificationRecord,
  SecurityMonitoring,
  VisitorRecord,
  WorkforceOnboardingRecord,
} from '../types/domain';
import type { OfflineOperationalCache, OfflineOperationalQueueItem } from '../types/runtime';

export type OperationalFeedSeverity = 'info' | 'warning' | 'security' | 'emergency' | 'approval' | 'denied';
export type OperationalFeedCategory = 'visitor' | 'workforce' | 'approval' | 'incident' | 'sync' | 'notification' | 'runtime';

export type OperationalFeedItem = {
  id: string;
  category: OperationalFeedCategory;
  severity: OperationalFeedSeverity;
  actor: string;
  title: string;
  detail?: string | null;
  occurredAt: string;
  organization?: string | null;
  checkpoint?: string | null;
  source: string;
  targetType?: 'visitor' | 'workforce' | 'incident' | 'notification' | 'sync' | 'runtime';
  targetId?: string | null;
  pendingSync?: boolean;
  offlineGenerated?: boolean;
  stale?: boolean;
  groupKey: string;
  groupCount?: number;
};

type OfflineSnapshot = {
  queue: OfflineOperationalQueueItem[];
  cache: OfflineOperationalCache;
};

const FEED_LIMIT = 80;

export function useOperationalActivityFeed() {
  const auth = useAuth();
  const runtime = useOperationalRuntime();
  const { t } = useLocalization();
  const role = auth.status === 'authenticated' ? auth.session.user.activeRole : null;
  const user = auth.status === 'authenticated' ? auth.session.user : null;

  const securityEnabled = role === 'SECURITY_GUARD';
  const adminEnabled = role === 'ADMIN';
  const employeeEnabled = role === 'EMPLOYEE';
  const visitorEnabled = role === 'VISITOR';
  const opsEnabled = Boolean(role);

  const securityMonitoring = useQuery({
    queryKey: ['security', 'monitoring', 'feed'],
    queryFn: () => getSecurityMonitoring(),
    enabled: securityEnabled,
    refetchInterval: 20_000,
    placeholderData: (previous) => previous,
  });
  const securityVisitors = useQuery({
    queryKey: ['security', 'visitors', 'feed'],
    queryFn: () => getSecurityVisitors({ size: 30 }),
    enabled: securityEnabled,
    refetchInterval: 25_000,
    placeholderData: (previous) => previous,
  });
  const securityAttendance = useQuery({
    queryKey: ['security', 'attendance', 'feed'],
    queryFn: getSecurityAttendance,
    enabled: securityEnabled,
    refetchInterval: 25_000,
    placeholderData: (previous) => previous,
  });

  const adminVisitors = useQuery({
    queryKey: ['admin', 'visitors', 'feed'],
    queryFn: () => getAdminVisitors({ size: 35 }),
    enabled: adminEnabled,
    refetchInterval: 25_000,
    placeholderData: (previous) => previous,
  });
  const adminWorkforce = useQuery({
    queryKey: ['admin', 'workforce-onboarding', 'feed'],
    queryFn: getAdminWorkforceOnboarding,
    enabled: adminEnabled,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
  const adminUsers = useQuery({
    queryKey: ['admin', 'users', 'feed'],
    queryFn: getAdminUsers,
    enabled: adminEnabled,
    refetchInterval: 45_000,
    placeholderData: (previous) => previous,
  });
  const adminAttendance = useQuery({
    queryKey: ['admin', 'workforce-attendance', 'feed'],
    queryFn: getAdminWorkforceAttendance,
    enabled: adminEnabled,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });

  const employeeApprovals = useQuery({
    queryKey: ['employee', 'approvals', 'feed'],
    queryFn: getEmployeeApprovals,
    enabled: employeeEnabled,
    refetchInterval: 25_000,
    placeholderData: (previous) => previous,
  });
  const employeePreApprovals = useQuery({
    queryKey: ['employee', 'pre-approvals', 'feed'],
    queryFn: getEmployeePreApprovals,
    enabled: employeeEnabled,
    refetchInterval: 35_000,
    placeholderData: (previous) => previous,
  });
  const employeeAttendance = useQuery({
    queryKey: ['employee', 'attendance', 'feed'],
    queryFn: getEmployeeAttendance,
    enabled: employeeEnabled,
    refetchInterval: 35_000,
    placeholderData: (previous) => previous,
  });
  const employeeNotifications = useQuery({
    queryKey: ['employee', 'notifications', 'feed'],
    queryFn: () => getEmployeeNotifications(20),
    enabled: employeeEnabled,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });

  const visitorVisits = useQuery({
    queryKey: ['visitor', 'visits', 'feed'],
    queryFn: getVisitorVisits,
    enabled: visitorEnabled,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
  const visitorNotifications = useQuery({
    queryKey: ['visitor', 'notifications', 'feed'],
    queryFn: () => getVisitorNotifications(20),
    enabled: visitorEnabled,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });

  const notifications = useQuery({
    queryKey: ['notifications', 'feed'],
    queryFn: () => getNotifications(25),
    enabled: opsEnabled && !visitorEnabled && !employeeEnabled,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });

  const emergencyState = useQuery({
    queryKey: ['emergency', 'state', 'feed'],
    queryFn: getEmergencyState,
    enabled: opsEnabled && !visitorEnabled,
    refetchInterval: 20_000,
    placeholderData: (previous) => previous,
  });
  const emergencyFeed = useQuery({
    queryKey: ['emergency', 'feed', 'activity'],
    queryFn: getEmergencyFeed,
    enabled: opsEnabled && !visitorEnabled,
    refetchInterval: 20_000,
    placeholderData: (previous) => previous,
  });

  const offlineSnapshot = useQuery({
    queryKey: ['offline-operational', 'activity-feed'],
    queryFn: async (): Promise<OfflineSnapshot> => {
      const [queue, cache] = await Promise.all([
        readOfflineOperationalQueue(),
        readOfflineOperationalCache(),
      ]);
      return { queue, cache };
    },
    enabled: opsEnabled,
    refetchInterval: 12_000,
    placeholderData: (previous) => previous,
  });

  const items = useMemo(() => {
    if (!role || !user) {
      return [];
    }

    const nextItems: OperationalFeedItem[] = [];
    const organization = user.organizationName || user.organizationCode || null;

    if (securityEnabled) {
      nextItems.push(
        ...buildSecurityVisitorItems(securityMonitoring.data, securityVisitors.data?.items ?? [], t),
        ...buildAttendanceItems(securityAttendance.data ?? [], role, t),
      );
    }

    if (adminEnabled) {
      nextItems.push(
        ...buildVisitorItems(adminVisitors.data?.items ?? [], role, t),
        ...buildWorkforceOnboardingItems([...(adminWorkforce.data ?? []), ...(adminUsers.data ?? [])], role, t),
        ...buildAttendanceItems(adminAttendance.data ?? [], role, t),
      );
    }

    if (employeeEnabled) {
      nextItems.push(
        ...buildVisitorItems([...(employeeApprovals.data?.items ?? []), ...(employeePreApprovals.data ?? [])], role, t),
        ...buildAttendanceItems(employeeAttendance.data ?? [], role, t),
        ...buildNotificationItems(employeeNotifications.data?.items ?? [], role, t),
      );
    }

    if (visitorEnabled) {
      nextItems.push(
        ...buildVisitorItems(visitorVisits.data ?? [], role, t),
        ...buildNotificationItems(visitorNotifications.data?.items ?? [], role, t),
      );
    }

    nextItems.push(
      ...buildLiveOperationalItems(runtime.liveOperationalEvents, t),
      ...buildNotificationItems(notifications.data?.items ?? [], role, t),
      ...buildEmergencyItems(emergencyFeed.data ?? [], t),
      ...buildRuntimeItems(runtime, t, organization),
      ...buildOfflineItems(offlineSnapshot.data, t, organization),
    );

    if (emergencyState.data?.lockdownActive || emergencyState.data?.evacuationActive) {
      nextItems.push({
        id: `emergency-state-${emergencyState.data.updatedAt ?? emergencyState.data.lockdownStartedAt ?? emergencyState.data.evacuationStartedAt ?? 'active'}`,
        category: 'incident',
        severity: 'emergency',
        actor: t('feed.actorSystem'),
        title: t('feed.eventEmergency'),
        detail: emergencyState.data.lockdownReason || emergencyState.data.latestBroadcastMessage || null,
        occurredAt: emergencyState.data.updatedAt || emergencyState.data.latestBroadcastAt || emergencyState.data.lockdownStartedAt || new Date().toISOString(),
        organization: emergencyState.data.organizationName ?? organization,
        checkpoint: emergencyState.data.lockdownScope ?? emergencyState.data.evacuationScope ?? null,
        source: t('feed.sourceRuntime'),
        targetType: 'incident',
        targetId: null,
        groupKey: 'emergency-state-active',
      });
    }

    return groupAndSort(nextItems);
  }, [
    adminAttendance.data,
    adminEnabled,
    adminUsers.data,
    adminVisitors.data,
    adminWorkforce.data,
    emergencyFeed.data,
    emergencyState.data,
    employeeApprovals.data,
    employeeAttendance.data,
    employeeEnabled,
    employeeNotifications.data,
    employeePreApprovals.data,
    notifications.data,
    offlineSnapshot.data,
    role,
    runtime,
    securityAttendance.data,
    securityEnabled,
    securityMonitoring.data,
    securityVisitors.data,
    t,
    user,
    visitorEnabled,
    visitorNotifications.data,
    visitorVisits.data,
  ]);

  const isLoading = [
    securityMonitoring,
    securityVisitors,
    securityAttendance,
    adminVisitors,
    adminWorkforce,
    adminUsers,
    adminAttendance,
    employeeApprovals,
    employeePreApprovals,
    employeeAttendance,
    employeeNotifications,
    visitorVisits,
    visitorNotifications,
    notifications,
    emergencyState,
    emergencyFeed,
    offlineSnapshot,
  ].some((query) => query.isLoading);

  const isRefetching = [
    securityMonitoring,
    securityVisitors,
    securityAttendance,
    adminVisitors,
    adminWorkforce,
    adminUsers,
    adminAttendance,
    employeeApprovals,
    employeePreApprovals,
    employeeAttendance,
    employeeNotifications,
    visitorVisits,
    visitorNotifications,
    notifications,
    emergencyState,
    emergencyFeed,
    offlineSnapshot,
  ].some((query) => query.isRefetching);

  const refetch = async () => {
    const refetches: Array<Promise<unknown>> = [offlineSnapshot.refetch()];

    if (securityEnabled) {
      refetches.push(securityMonitoring.refetch(), securityVisitors.refetch(), securityAttendance.refetch());
    }
    if (adminEnabled) {
      refetches.push(adminVisitors.refetch(), adminWorkforce.refetch(), adminUsers.refetch(), adminAttendance.refetch());
    }
    if (employeeEnabled) {
      refetches.push(employeeApprovals.refetch(), employeePreApprovals.refetch(), employeeAttendance.refetch(), employeeNotifications.refetch());
    }
    if (visitorEnabled) {
      refetches.push(visitorVisits.refetch(), visitorNotifications.refetch());
    }
    if (opsEnabled && !visitorEnabled && !employeeEnabled) {
      refetches.push(notifications.refetch());
    }
    if (opsEnabled && !visitorEnabled) {
      refetches.push(emergencyState.refetch(), emergencyFeed.refetch());
    }

    await Promise.all(refetches);
  };

  return {
    items,
    isLoading,
    isRefetching,
    refetch,
  };
}

function buildSecurityVisitorItems(monitoring: SecurityMonitoring | undefined, visitors: VisitorRecord[], t: ReturnType<typeof useLocalization>['t']) {
  return buildVisitorItems([
    ...(monitoring?.suspendedVisitors ?? []),
    ...(monitoring?.rejectedVisitors ?? []),
    ...(monitoring?.overdueVisitors ?? []),
    ...(monitoring?.currentlyInside ?? []),
    ...(monitoring?.checkedOutVisitors ?? []),
    ...(monitoring?.approvedVisitors ?? []),
    ...(monitoring?.dailyAttendanceLogs ?? []),
    ...visitors,
  ], 'SECURITY_GUARD', t);
}

function buildVisitorItems(visitors: VisitorRecord[], role: ActiveWorkspaceRole, t: ReturnType<typeof useLocalization>['t']) {
  const actor = role === 'ADMIN' ? t('feed.actorAdmin') : role === 'EMPLOYEE' ? t('feed.actorEmployee') : t('feed.actorGuard');
  const seen = new Set<string>();

  return visitors
    .filter((visitor) => {
      if (!visitor?.id || seen.has(visitor.id)) {
        return false;
      }
      seen.add(visitor.id);
      return true;
    })
    .map((visitor): OperationalFeedItem => {
      const status = String(visitor.status || '').toUpperCase();
      const statusConfig = visitorStatusConfig(status, visitor, t);
      return {
        id: `visitor-${visitor.id}-${status}-${statusConfig.occurredAt}`,
        category: status === 'PENDING' || status === 'APPROVED' ? 'approval' : 'visitor',
        severity: statusConfig.severity,
        actor,
        title: statusConfig.title,
        detail: [visitor.companyName || visitor.hostEmployee || visitor.purposeOfVisit, visitor.badgeId ? `Badge ${visitor.badgeId}` : null].filter(Boolean).join(' · ') || null,
        occurredAt: statusConfig.occurredAt,
        organization: visitor.organizationName || visitor.organizationCode || null,
        checkpoint: visitor.accessWindowStartTime || visitor.scheduledStartTime ? visitor.scheduledTimezone ?? null : null,
        source: t('feed.sourceVisitor'),
        targetType: 'visitor',
        targetId: visitor.id,
        pendingSync: false,
        offlineGenerated: false,
        stale: isStale(statusConfig.occurredAt),
        groupKey: `visitor:${status}:${visitor.id}`,
      };
    });
}

function buildAttendanceItems(records: EmployeeAttendanceRecord[], role: ActiveWorkspaceRole, t: ReturnType<typeof useLocalization>['t']) {
  const actor = role === 'ADMIN' ? t('feed.actorAdmin') : t('feed.actorGuard');
  return records.slice(0, 40).map((record): OperationalFeedItem => {
    const checkedOut = Boolean(record.checkOutTime) || record.lastAction === 'CHECKED_OUT' || record.status === 'CHECKED_OUT';
    const occurredAt = record.checkOutTime || record.checkInTime || record.updatedAt || record.createdAt || new Date().toISOString();
    return {
      id: `attendance-${record.id}-${record.lastAction ?? record.status ?? 'activity'}-${occurredAt}`,
      category: 'workforce',
      severity: record.late ? 'warning' : 'info',
      actor,
      title: checkedOut
        ? t('feed.eventWorkforceOut', { name: record.employeeName || record.employeeId || t('common.unknown') })
        : t('feed.eventWorkforceIn', { name: record.employeeName || record.employeeId || t('common.unknown') }),
      detail: [record.department, record.shiftName, record.overrideReason ? `Override: ${record.overrideReason}` : null].filter(Boolean).join(' · ') || null,
      occurredAt,
      organization: record.organizationName || record.organizationCode || null,
      checkpoint: record.securityGuardName ?? null,
      source: t('feed.sourceWorkforce'),
      targetType: 'workforce',
      targetId: record.employeeUserId || record.employeeId || record.id,
      stale: isStale(occurredAt),
      groupKey: `workforce:${checkedOut ? 'out' : 'in'}:${record.employeeUserId || record.employeeId || record.id}`,
    };
  });
}

function buildWorkforceOnboardingItems(records: WorkforceOnboardingRecord[], role: ActiveWorkspaceRole, t: ReturnType<typeof useLocalization>['t']) {
  const actor = role === 'ADMIN' ? t('feed.actorAdmin') : t('feed.actorGuard');
  const seen = new Set<string>();
  return records
    .filter((record) => {
      if (!record.id || seen.has(record.id)) {
        return false;
      }
      seen.add(record.id);
      return true;
    })
    .map((record): OperationalFeedItem => {
      const approved = Boolean(record.workforceApprovedAt) || record.active;
      const rejected = Boolean(record.workforceRejectedAt) || String(record.accountStatus || '').toUpperCase().includes('REJECT');
      const occurredAt = record.workforceApprovedAt || record.workforceRejectedAt || record.updatedAt || record.createdAt || new Date().toISOString();
      return {
        id: `workforce-onboarding-${record.id}-${occurredAt}`,
        category: 'approval',
        severity: rejected ? 'denied' : approved ? 'approval' : 'warning',
        actor,
        title: rejected
          ? t('feed.eventWorkforceDenied', { name: record.fullName || record.email || t('common.unknown') })
          : approved
            ? t('feed.eventWorkforceApproved', { name: record.fullName || record.email || t('common.unknown') })
            : t('feed.eventWorkforcePending', { name: record.fullName || record.email || t('common.unknown') }),
        detail: [record.department, record.designation, record.workforceRejectionReason].filter(Boolean).join(' · ') || null,
        occurredAt,
        organization: record.organizationName || record.organizationCode || null,
        source: t('feed.sourceWorkforce'),
        targetType: 'workforce',
        targetId: record.id,
        stale: isStale(occurredAt),
        groupKey: `workforce-approval:${approved ? 'approved' : rejected ? 'denied' : 'pending'}:${record.id}`,
      };
    });
}

function buildNotificationItems(records: NotificationRecord[], role: ActiveWorkspaceRole, t: ReturnType<typeof useLocalization>['t']) {
  const actor = role === 'ADMIN' ? t('feed.actorAdmin') : role === 'SECURITY_GUARD' ? t('feed.actorGuard') : t('feed.actorSystem');
  return records.map((record): OperationalFeedItem => ({
    id: `notification-${record.id}`,
    category: 'notification',
    severity: notificationSeverity(record),
    actor: record.actorName || actor,
    title: t('feed.eventNotification', { title: record.title }),
    detail: record.message,
    occurredAt: record.createdAt || new Date().toISOString(),
    organization: null,
    source: t('feed.sourceNotification'),
    targetType: record.visitorId ? 'visitor' : 'notification',
    targetId: record.visitorId || record.id,
    stale: isStale(record.createdAt),
    groupKey: `notification:${record.type ?? record.category ?? record.id}:${record.visitorId ?? record.id}`,
  }));
}

function buildLiveOperationalItems(records: ReturnType<typeof useOperationalRuntime>['liveOperationalEvents'], t: ReturnType<typeof useLocalization>['t']) {
  return records.map((record): OperationalFeedItem => {
    const category = normalizeFeedCategory(record.category);
    const severity = normalizeFeedSeverity(record.severity, category);
    return {
      id: `live-${record.id}`,
      category,
      severity,
      actor: record.actorName || t('feed.actorSystem'),
      title: record.title || record.type.replaceAll('_', ' '),
      detail: record.detail,
      occurredAt: record.occurredAt || new Date().toISOString(),
      organization: record.organizationName ?? null,
      source: t('feed.sourceRuntime'),
      targetType: normalizeTargetType(record.targetType, category),
      targetId: record.targetId ?? null,
      stale: false,
      groupKey: `live:${record.type}:${record.targetId ?? record.id}`,
    };
  });
}

function normalizeFeedCategory(value?: string | null): OperationalFeedCategory {
  const normalized = String(value || '').toLowerCase();
  if (['visitor', 'workforce', 'approval', 'incident', 'sync', 'notification', 'runtime'].includes(normalized)) {
    return normalized as OperationalFeedCategory;
  }
  return 'runtime';
}

function normalizeFeedSeverity(value: string | null | undefined, category: OperationalFeedCategory): OperationalFeedSeverity {
  const normalized = String(value || '').toLowerCase();
  if (['info', 'warning', 'security', 'emergency', 'approval', 'denied'].includes(normalized)) {
    return normalized as OperationalFeedSeverity;
  }
  return category === 'approval' ? 'approval' : category === 'incident' ? 'security' : 'info';
}

function normalizeTargetType(value: string | null | undefined, category: OperationalFeedCategory): OperationalFeedItem['targetType'] {
  const normalized = String(value || '').toUpperCase();
  const feedCategory = category as string;
  if (normalized.includes('VISITOR')) {
    return 'visitor';
  }
  if (normalized.includes('EMPLOYEE') || normalized.includes('WORKFORCE')) {
    return 'workforce';
  }
  if (normalized.includes('EMERGENCY') || feedCategory === 'incident') {
    return 'incident';
  }
  if (feedCategory === 'visitor') {
    return 'visitor';
  }
  if (feedCategory === 'workforce') {
    return 'workforce';
  }
  if (feedCategory === 'incident') {
    return 'incident';
  }
  return 'runtime';
}

function buildEmergencyItems(records: EmergencyIncident[], t: ReturnType<typeof useLocalization>['t']) {
  return records.map((record): OperationalFeedItem => ({
    id: `incident-${record.id}`,
    category: 'incident',
    severity: record.severity === 'CRITICAL' ? 'emergency' : record.severity === 'HIGH' ? 'security' : 'warning',
    actor: record.actorName || t('feed.actorSystem'),
    title: record.title || t('feed.eventIncident', { name: record.subjectName || t('common.unknown') }),
    detail: record.message || record.notes || null,
    occurredAt: record.createdAt || new Date().toISOString(),
    checkpoint: record.checkpoint,
    source: t('feed.sourceRuntime'),
    targetType: 'incident',
    targetId: record.id,
    stale: isStale(record.createdAt),
    groupKey: `incident:${record.type}:${record.subjectId ?? record.id}`,
  }));
}

function buildRuntimeItems(
  runtime: ReturnType<typeof useOperationalRuntime>,
  t: ReturnType<typeof useLocalization>['t'],
  organization?: string | null,
) {
  const now = new Date().toISOString();
  const items: OperationalFeedItem[] = [];
  if (runtime.offlineOperationalMode === 'offline') {
    items.push({
      id: `runtime-offline-${runtime.networkState.lastOfflineAt ?? 'active'}`,
      category: 'runtime',
      severity: 'warning',
      actor: t('feed.actorSystem'),
      title: t('feed.eventRuntimeOffline'),
      detail: runtime.offlineOperationalQueueSize ? t('runtime.offlineBody', { count: runtime.offlineOperationalQueueSize }) : null,
      occurredAt: runtime.networkState.lastOfflineAt || now,
      organization,
      source: t('feed.sourceRuntime'),
      targetType: 'runtime',
      stale: false,
      groupKey: 'runtime:offline',
    });
  } else if (runtime.offlineOperationalMode === 'degraded' || runtime.networkState.consecutiveFailures > 0) {
    items.push({
      id: `runtime-degraded-${runtime.networkState.lastApiReachableAt ?? 'active'}`,
      category: 'runtime',
      severity: 'warning',
      actor: t('feed.actorSystem'),
      title: t('feed.eventRuntimeDegraded'),
      detail: runtime.degradedMessage,
      occurredAt: runtime.networkState.lastApiReachableAt || now,
      organization,
      source: t('feed.sourceRuntime'),
      targetType: 'runtime',
      stale: false,
      groupKey: 'runtime:degraded',
    });
  }

  if (runtime.devicePosture.suspicious) {
    items.push({
      id: `runtime-device-${runtime.devicePosture.lastPolicySyncAt ?? 'suspicious'}`,
      category: 'runtime',
      severity: 'security',
      actor: t('feed.actorSystem'),
      title: t('feed.eventSuspiciousDevice'),
      detail: null,
      occurredAt: runtime.devicePosture.lastPolicySyncAt || now,
      organization,
      source: t('feed.sourceRuntime'),
      targetType: 'runtime',
      stale: false,
      groupKey: 'runtime:suspicious-device',
    });
  }

  return items;
}

function buildOfflineItems(snapshot: OfflineSnapshot | undefined, t: ReturnType<typeof useLocalization>['t'], organization?: string | null) {
  if (!snapshot) {
    return [];
  }
  const queueItems = snapshot.queue.map((item): OperationalFeedItem => {
    const title = item.targetLabel || offlineOperationTitle(item, t);
    return {
      id: `offline-queue-${item.id}`,
      category: 'sync',
      severity: item.status === 'failed' ? 'warning' : 'info',
      actor: t('feed.actorGuard'),
      title: t('feed.eventOfflineQueued', { title }),
      detail: item.lastError || item.localStatus || null,
      occurredAt: item.createdAt,
      organization,
      source: t('feed.sourceOffline'),
      targetType: item.kind === 'employee' ? 'workforce' : item.kind === 'visitor' ? 'visitor' : 'sync',
      targetId: item.targetId,
      pendingSync: item.status !== 'failed',
      offlineGenerated: true,
      stale: false,
      groupKey: `offline:${item.operationType}:${item.targetId ?? item.payloadFingerprint ?? item.id}`,
    };
  });

  const cacheItems = snapshot.cache.recentOperationalRecords.map((record): OperationalFeedItem => ({
    id: `offline-cache-${record.id}`,
    category: record.recordType === 'attendance' ? 'workforce' : record.recordType === 'visitor' ? 'visitor' : 'sync',
    severity: 'info',
    actor: t('feed.actorSystem'),
    title: record.title,
    detail: record.status ?? null,
    occurredAt: record.occurredAt,
    organization,
    source: t('feed.sourceOffline'),
    targetType: record.recordType === 'attendance' ? 'workforce' : record.recordType === 'visitor' ? 'visitor' : 'sync',
    targetId: record.recordId,
    pendingSync: record.recordType === 'offline-operation',
    offlineGenerated: record.recordType === 'offline-operation',
    stale: isStale(record.occurredAt),
    groupKey: `cache:${record.recordType}:${record.recordId}:${record.status ?? ''}`,
  }));

  return [...queueItems, ...cacheItems];
}

function visitorStatusConfig(status: string, visitor: VisitorRecord, t: ReturnType<typeof useLocalization>['t']) {
  const name = visitor.fullName || t('common.unknown');
  switch (status) {
    case 'CHECKED_IN':
      return {
        title: t('feed.eventCheckedIn', { name }),
        severity: 'info' as const,
        occurredAt: visitor.checkInTime || visitor.updatedAt || visitor.createdAt || new Date().toISOString(),
      };
    case 'CHECKED_OUT':
      return {
        title: t('feed.eventCheckedOut', { name }),
        severity: 'info' as const,
        occurredAt: visitor.checkOutTime || visitor.updatedAt || visitor.createdAt || new Date().toISOString(),
      };
    case 'APPROVED':
      return {
        title: t('feed.eventApproved', { name }),
        severity: 'approval' as const,
        occurredAt: visitor.approvedAt || visitor.updatedAt || visitor.createdAt || new Date().toISOString(),
      };
    case 'PENDING':
      return {
        title: t('feed.eventPendingApproval', { name }),
        severity: 'warning' as const,
        occurredAt: visitor.updatedAt || visitor.createdAt || new Date().toISOString(),
      };
    case 'REJECTED':
      return {
        title: t('feed.eventDenied', { name }),
        severity: 'denied' as const,
        occurredAt: visitor.rejectedAt || visitor.updatedAt || visitor.createdAt || new Date().toISOString(),
      };
    case 'SUSPENDED':
      return {
        title: t('feed.eventSuspended', { name }),
        severity: 'security' as const,
        occurredAt: visitor.suspendedAt || visitor.updatedAt || visitor.createdAt || new Date().toISOString(),
      };
    case 'EXPIRED':
      return {
        title: t('feed.eventExpired', { name }),
        severity: 'warning' as const,
        occurredAt: visitor.qrExpiresAt || visitor.validityEndDate || visitor.updatedAt || visitor.createdAt || new Date().toISOString(),
      };
    case 'REVOKED':
      return {
        title: t('feed.eventRevoked', { name }),
        severity: 'security' as const,
        occurredAt: visitor.revokedAt || visitor.updatedAt || visitor.createdAt || new Date().toISOString(),
      };
    default:
      return {
        title: t('feed.eventVisitorUpdated', { name }),
        severity: 'info' as const,
        occurredAt: visitor.updatedAt || visitor.createdAt || new Date().toISOString(),
      };
  }
}

function notificationSeverity(record: NotificationRecord): OperationalFeedSeverity {
  if (record.priority === 'CRITICAL') {
    return 'emergency';
  }
  if (record.priority === 'HIGH' || record.category === 'SECURITY') {
    return 'security';
  }
  if (record.category === 'VISITOR' || record.type?.includes('APPROVAL')) {
    return 'approval';
  }
  return record.priority === 'MEDIUM' ? 'warning' : 'info';
}

function offlineOperationTitle(item: OfflineOperationalQueueItem, t: ReturnType<typeof useLocalization>['t']) {
  switch (item.operationType) {
    case 'visitor-check-out':
      return t('feed.eventCheckedOut', { name: item.targetLabel || t('common.unknown') });
    case 'visitor-qr-check-in':
      return t('feed.eventCheckedIn', { name: item.targetLabel || t('common.unknown') });
    case 'employee-qr-scan':
      return t('feed.eventWorkforceIn', { name: item.targetLabel || t('common.unknown') });
    default:
      return item.targetLabel || t('feed.pendingSync');
  }
}

function isStale(value?: string | null) {
  if (!value) {
    return true;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return true;
  }
  return Date.now() - timestamp > 10 * 60 * 1000;
}

function groupAndSort(items: OperationalFeedItem[]) {
  const deduped = new Map<string, OperationalFeedItem>();
  items.forEach((item) => {
    if (!item.occurredAt || Number.isNaN(Date.parse(item.occurredAt))) {
      return;
    }
    const existing = deduped.get(item.id);
    if (!existing || Date.parse(item.occurredAt) > Date.parse(existing.occurredAt)) {
      deduped.set(item.id, item);
    }
  });

  const grouped = new Map<string, OperationalFeedItem>();
  Array.from(deduped.values())
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .forEach((item) => {
      const bucket = `${item.groupKey}:${Math.floor(Date.parse(item.occurredAt) / (10 * 60 * 1000))}`;
      const existing = grouped.get(bucket);
      if (!existing) {
        grouped.set(bucket, item);
        return;
      }
      grouped.set(bucket, {
        ...existing,
        severity: severityRank(item.severity) > severityRank(existing.severity) ? item.severity : existing.severity,
        groupCount: (existing.groupCount ?? 1) + 1,
        pendingSync: existing.pendingSync || item.pendingSync,
        offlineGenerated: existing.offlineGenerated || item.offlineGenerated,
      });
    });

  return Array.from(grouped.values())
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, FEED_LIMIT);
}

function severityRank(severity: OperationalFeedSeverity) {
  const ranks: Record<OperationalFeedSeverity, number> = {
    info: 1,
    approval: 2,
    warning: 3,
    denied: 4,
    security: 5,
    emergency: 6,
  };
  return ranks[severity];
}
