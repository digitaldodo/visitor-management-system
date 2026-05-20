import { Children, useMemo, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { DetailRow } from '../../components/employee/DetailRow';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { AppScreen } from '../../components/layout/AppScreen';
import { NotificationCenter } from '../../components/notifications/NotificationCenter';
import { ReasonCaptureModal } from '../../components/security/ReasonCaptureModal';
import { AccountProfileScreen } from '../common/AccountProfileScreen';
import {
  useAdminOverview,
  useAdminAnalytics,
  useAdminReports,
  useAdminUsers,
  useAdminVisitors,
  useAdminWorkforceAttendance,
  useAdminWorkforceOnboarding,
  useApproveAdminVisitorMutation,
  useApproveAdminWorkforceMutation,
  useCheckInAdminVisitorMutation,
  useCheckOutAdminVisitorMutation,
  useDenyAdminVisitorMutation,
  useDisableAdminUserMutation,
  useEnableAdminUserMutation,
  useEscalateAdminVisitorMutation,
  useReactivateAdminVisitorMutation,
  useRejectAdminVisitorMutation,
  useRejectAdminWorkforceMutation,
  useSuspendAdminVisitorMutation,
} from '../../hooks/useAdminWorkspace';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useNotificationsQuery } from '../../hooks/useNotificationsQuery';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { markAllNotificationsRead, markNotificationRead } from '../../services/notificationService';
import { shareOperationalReport } from '../../services/operationalExportService';
import { theme } from '../../theme';
import type {
  AdminOperationalAnalytics,
  AnalyticsHeatmapRow,
  AnalyticsPoint,
  AnalyticsSnapshot,
  EmployeeAttendanceRecord,
  NotificationRecord,
  OperationalInsight,
  VisitorRecord,
  VisitorStatus,
  WorkforceOnboardingRecord,
} from '../../types/domain';
import {
  employeePresenceLabel,
  formatDateTime,
  formatVisitorWindow,
  statusTone,
  visitorStatusLabel,
  visitorTypeLabel,
} from '../../utils/securityFormatting';

type AdminAction =
  | { type: 'reject-workforce'; worker: WorkforceOnboardingRecord }
  | { type: 'changes-workforce'; worker: WorkforceOnboardingRecord }
  | { type: 'reject-visitor'; visitor: VisitorRecord }
  | { type: 'deny-visitor'; visitor: VisitorRecord }
  | { type: 'suspend-visitor'; visitor: VisitorRecord }
  | { type: 'escalate-visitor'; visitor: VisitorRecord }
  | { type: 'disable-user'; user: WorkforceOnboardingRecord };

type SectionProps = {
  section: 'dashboard' | 'approvals' | 'visitors' | 'workforce' | 'alerts' | 'register' | 'employees' | 'settings';
};

const REGISTER_STATUSES: { label: string; value: 'ALL' | VisitorStatus }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Inside', value: 'CHECKED_IN' },
  { label: 'Denied', value: 'REJECTED' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Suspended', value: 'SUSPENDED' },
];

export function AdminDashboardScreen() {
  return <AdminOperationalScreen section="dashboard" />;
}

export function AdminApprovalsScreen() {
  return <AdminOperationalScreen section="approvals" />;
}

export function AdminVisitorsScreen() {
  return <AdminOperationalScreen section="visitors" />;
}

export function AdminWorkforceScreen() {
  return <AdminOperationalScreen section="workforce" />;
}

export function AdminAlertsScreen() {
  return <AdminOperationalScreen section="alerts" />;
}

export function AdminRegisterScreen() {
  return <AdminOperationalScreen section="register" />;
}

export function AdminEmployeesScreen() {
  return <AdminOperationalScreen section="employees" />;
}

export function AdminSettingsScreen() {
  return <AdminAccountSettingsScreen />;
}

function AdminAccountSettingsScreen() {
  const overview = useAdminOverview();
  const reports = useAdminReports();
  const users = useAdminUsers();
  const workforceOnboarding = useAdminWorkforceOnboarding();
  const notifications = useNotificationsQuery(24);

  const pendingWorkforce = (workforceOnboarding.data ?? []).filter((worker) => String(worker.accountStatus || '').toUpperCase() !== 'ACTIVE').length;
  const disabledUsers = (users.data ?? []).filter((user) => !user.active || String(user.accountStatus || '').toUpperCase() !== 'ACTIVE').length;

  return (
    <AccountProfileScreen
      title="Profile"
      subtitle="Admin identity, organization oversight, secure account settings, and diagnostics for mobile operations."
      refreshing={overview.isRefetching || reports.isRefetching || users.isRefetching || workforceOnboarding.isRefetching || notifications.isRefetching}
      onRefresh={() => Promise.all([
        overview.refetch(),
        reports.refetch(),
        users.refetch(),
        workforceOnboarding.refetch(),
        notifications.refetch(),
      ])}
      roleSummary={(
        <SurfaceCard title="Admin oversight" subtitle="Mobile admin controls expose operational visibility while role, organization, and permission authority remain backend-managed.">
          <View style={styles.metricsGrid}>
            <MetricCard label="Users" value={users.data?.length ?? 0} tone="info" />
            <MetricCard label="Pending workforce" value={pendingWorkforce} tone={pendingWorkforce ? 'warning' : 'default'} />
            <MetricCard label="Disabled users" value={disabledUsers} tone={disabledUsers ? 'danger' : 'default'} />
            <MetricCard label="Unread alerts" value={notifications.data?.unreadCount ?? 0} tone={(notifications.data?.unreadCount ?? 0) ? 'warning' : 'default'} />
          </View>
          <DetailRow label="Mobile admin scope" value="Approvals, visitor operations, alerts, register, workforce, and employee access controls" />
          <DetailRow label="Operational area" value={overview.data?.area || 'Organization administration'} />
          <DetailRow label="Audit reports" value={`${reports.data?.length ?? 0} available`} />
        </SurfaceCard>
      )}
    />
  );
}

export function AdminOperationalScreen({ section }: SectionProps) {
  const navigation = useNavigation<any>();
  const { session, logout, isBusy } = useAuth();
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const { localNotifications, markLocalNotificationRead } = useOperationalRuntime();

  const [search, setSearch] = useState('');
  const [visitorStatus, setVisitorStatus] = useState<'ALL' | VisitorStatus>('ALL');
  const [page, setPage] = useState(0);
  const [actionState, setActionState] = useState<AdminAction | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const deferredSearch = useDebouncedValue(search.trim(), 220);
  const overview = useAdminOverview();
  const analytics = useAdminAnalytics();
  const reports = useAdminReports();
  const workforceOnboarding = useAdminWorkforceOnboarding();
  const users = useAdminUsers();
  const attendance = useAdminWorkforceAttendance();
  const visitors = useAdminVisitors(
    section === 'workforce' || section === 'employees' ? '' : deferredSearch,
    visitorStatus === 'ALL' ? undefined : visitorStatus,
    page,
    section === 'register' ? 30 : 18,
  );
  const pendingVisitors = useAdminVisitors('', 'PENDING', 0, 12);
  const approvedVisitors = useAdminVisitors('', 'APPROVED', 0, 12);
  const insideVisitors = useAdminVisitors('', 'CHECKED_IN', 0, 12);
  const deniedVisitors = useAdminVisitors('', 'REJECTED', 0, 12);
  const suspendedVisitors = useAdminVisitors('', 'SUSPENDED', 0, 12);
  const notifications = useNotificationsQuery(24);

  const approveWorkforceMutation = useApproveAdminWorkforceMutation();
  const rejectWorkforceMutation = useRejectAdminWorkforceMutation();
  const approveVisitorMutation = useApproveAdminVisitorMutation();
  const rejectVisitorMutation = useRejectAdminVisitorMutation();
  const checkInVisitorMutation = useCheckInAdminVisitorMutation();
  const checkOutVisitorMutation = useCheckOutAdminVisitorMutation();
  const denyVisitorMutation = useDenyAdminVisitorMutation();
  const suspendVisitorMutation = useSuspendAdminVisitorMutation();
  const reactivateVisitorMutation = useReactivateAdminVisitorMutation();
  const escalateVisitorMutation = useEscalateAdminVisitorMutation();
  const disableUserMutation = useDisableAdminUserMutation();
  const enableUserMutation = useEnableAdminUserMutation();
  const markReadMutation = useMutation({ mutationFn: markNotificationRead });
  const markAllReadMutation = useMutation({ mutationFn: markAllNotificationsRead });

  const employees = useMemo(
    () => (users.data ?? []).filter((user) => (user.roles ?? []).includes('EMPLOYEE')),
    [users.data],
  );
  const filteredEmployees = useMemo(() => {
    const query = deferredSearch.toLowerCase();
    if (!query) {
      return employees;
    }
    return employees.filter((user) => [
      user.fullName,
      user.email,
      user.employeeId,
      user.department,
      user.designation,
      user.employeeType,
      user.accountStatus,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [deferredSearch, employees]);
  const securityNotifications = useMemo(
    () => (notifications.data?.items ?? []).filter((item) => ['SECURITY', 'SYSTEM', 'WORKFORCE', 'VISITOR'].includes(String(item.category || '').toUpperCase())),
    [notifications.data?.items],
  );
  const localSecurityNotifications = useMemo(
    () => localNotifications.filter((item) => ['SECURITY', 'SYSTEM', 'WORKFORCE', 'VISITOR'].includes(String(item.category || '').toUpperCase())),
    [localNotifications],
  );

  const pendingWorkforceCount = workforceOnboarding.data?.length ?? 0;
  const pendingVisitorCount = pendingVisitors.data?.totalItems ?? pendingVisitors.data?.items.length ?? Number(overview.data?.metrics?.pending ?? 0);
  const criticalAlertCount = securityNotifications.filter((item) => item.priority === 'CRITICAL' && !item.read).length;
  const activeVisitorCount = insideVisitors.data?.totalItems ?? Number(overview.data?.metrics?.checkedIn ?? 0);
  const isRefreshing = overview.isRefetching
    || analytics.isRefetching
    || reports.isRefetching
    || workforceOnboarding.isRefetching
    || visitors.isRefetching
    || pendingVisitors.isRefetching
    || approvedVisitors.isRefetching
    || insideVisitors.isRefetching
    || deniedVisitors.isRefetching
    || suspendedVisitors.isRefetching
    || users.isRefetching
    || attendance.isRefetching
    || notifications.isRefetching;

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  };

  const approveWorkforce = async (worker: WorkforceOnboardingRecord) => {
    const updated = await approveWorkforceMutation.mutateAsync({
      id: worker.id,
      payload: {
        department: worker.department ?? null,
        designation: worker.designation ?? null,
        employeeType: worker.employeeType ?? null,
        employeePhotoUrl: worker.employeePhotoUrl ?? null,
        shiftName: worker.shiftName ?? null,
        shiftStartTime: worker.shiftStartTime ?? null,
        shiftEndTime: worker.shiftEndTime ?? null,
        note: 'Approved from AccessFlow Android admin workspace.',
      },
    });
    setActionMessage(`${updated.fullName} approved and access activated.`);
    await refreshWorkspace();
  };

  const approveVisitor = async (visitor: VisitorRecord) => {
    const updated = await approveVisitorMutation.mutateAsync({ id: visitor.id, note: 'Approved from AccessFlow Android admin workspace.' });
    setActionMessage(`${updated.fullName} approved for access.`);
    await refreshWorkspace();
  };

  const checkInVisitor = async (visitor: VisitorRecord) => {
    const updated = await checkInVisitorMutation.mutateAsync(visitor.id);
    setActionMessage(`${updated.fullName} checked in.`);
    await refreshWorkspace();
  };

  const checkOutVisitor = async (visitor: VisitorRecord) => {
    const updated = await checkOutVisitorMutation.mutateAsync(visitor.id);
    setActionMessage(`${updated.fullName} checked out.`);
    await refreshWorkspace();
  };

  const reactivateVisitor = async (visitor: VisitorRecord) => {
    const updated = await reactivateVisitorMutation.mutateAsync(visitor.id);
    setActionMessage(`${updated.fullName} recurring access reactivated.`);
    await refreshWorkspace();
  };

  const reactivateUser = async (user: WorkforceOnboardingRecord) => {
    const updated = await enableUserMutation.mutateAsync(user.id);
    setActionMessage(`${updated.fullName} access reactivated.`);
    await refreshWorkspace();
  };

  const suspendUser = async (user: WorkforceOnboardingRecord) => {
    const updated = await disableUserMutation.mutateAsync(user.id);
    setActionMessage(`${updated.fullName} employee access suspended.`);
    await refreshWorkspace();
  };

  const markRead = async (notification: NotificationRecord) => {
    if (notification.read) {
      return;
    }
    await markReadMutation.mutateAsync(notification.id);
    await refreshWorkspace();
  };

  const exportOperationalSnapshot = async (snapshot: AnalyticsSnapshot, payload?: AdminOperationalAnalytics) => {
    try {
      const format = String(snapshot.format || 'CSV').toUpperCase();
      const reportType = reportTypeForSnapshot(snapshot);
      if ((format === 'PDF' || format === 'CSV') && session?.user.activeRole) {
        const prepared = await shareOperationalReport({
          role: session.user.activeRole,
          reportType,
          format,
        });
        setActionMessage(`${prepared.title} ${format} export generated.`);
        await refreshWorkspace();
        return;
      }
      const filename = `${slugify(snapshot.label)}-${new Date().toISOString().slice(0, 10)}`;
      if (format === 'PDF') {
        const Print = await import('expo-print');
        const Sharing = await import('expo-sharing');
        const result = await Print.printToFileAsync({ html: operationalReportHtml(snapshot, payload) });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: snapshot.label });
        }
        setActionMessage(`${snapshot.label} PDF snapshot generated.`);
        return;
      }

      const FileSystem = await import('expo-file-system/legacy');
      const Sharing = await import('expo-sharing');
      const uri = `${FileSystem.documentDirectory ?? ''}${filename}.csv`;
      await FileSystem.writeAsStringAsync(uri, operationalReportCsv(snapshot, payload), {
        encoding: 'utf8',
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: snapshot.label });
      }
      setActionMessage(`${snapshot.label} CSV snapshot generated.`);
    } catch {
      setActionMessage('Report export could not be generated on this device.');
    }
  };

  const executeReasonAction = async (reason: string) => {
    if (!actionState) {
      return;
    }
    switch (actionState.type) {
      case 'reject-workforce': {
        const updated = await rejectWorkforceMutation.mutateAsync({ id: actionState.worker.id, reason });
        setActionMessage(`${updated.fullName} workforce onboarding rejected.`);
        break;
      }
      case 'changes-workforce': {
        const updated = await rejectWorkforceMutation.mutateAsync({ id: actionState.worker.id, reason: `Changes requested: ${reason}` });
        setActionMessage(`${updated.fullName} sent back for onboarding changes.`);
        break;
      }
      case 'reject-visitor': {
        const updated = await rejectVisitorMutation.mutateAsync({ id: actionState.visitor.id, note: reason });
        setActionMessage(`${updated.fullName} visitor request rejected.`);
        break;
      }
      case 'deny-visitor': {
        const updated = await denyVisitorMutation.mutateAsync({ id: actionState.visitor.id, reason });
        setActionMessage(`${updated.fullName} denied at entry.`);
        break;
      }
      case 'suspend-visitor': {
        const updated = await suspendVisitorMutation.mutateAsync({ id: actionState.visitor.id, reason });
        setActionMessage(`${updated.fullName} visitor access suspended.`);
        break;
      }
      case 'escalate-visitor': {
        const updated = await escalateVisitorMutation.mutateAsync({ id: actionState.visitor.id, reason });
        setActionMessage(`${updated.fullName} escalation recorded.`);
        break;
      }
      case 'disable-user': {
        const updated = await disableUserMutation.mutateAsync(actionState.user.id);
        setActionMessage(`${updated.fullName} employee access suspended.`);
        break;
      }
    }
    setActionState(null);
    await refreshWorkspace();
  };

  const screenCopy = {
    dashboard: ['Admin Command', 'Live control for approvals, visitors, alerts, workforce, and access operations.'],
    approvals: ['Approval Queue', 'Photo-backed workforce and visitor approvals with auditable decisions.'],
    visitors: ['Visitor Control', 'Inspect pending, active, denied, recurring, and high-priority visitor access.'],
    workforce: ['Workforce Control', 'Approve onboarding, verify worker details, and monitor employee presence.'],
    alerts: ['Alert Center', 'Acknowledge, escalate, and resolve operational events from mobile.'],
    register: ['Register', 'Searchable visitor, workforce, denied-entry, approval, and incident history.'],
    employees: ['Employee Access', 'Search employees, verify badge status, and suspend or reactivate access.'],
    settings: ['Admin Settings', 'Mobile role scope, session controls, and operational readiness.'],
  }[section];

  return (
    <>
      <AppScreen
        title={screenCopy[0]}
        subtitle={screenCopy[1]}
        sensitive={section === 'dashboard' || section === 'visitors' || section === 'alerts'}
        sensitiveReason={`admin-${section}`}
        contentMaxWidth={layout.isLargeTablet ? 1220 : undefined}
        refreshing={isRefreshing}
        onRefresh={refreshWorkspace}
      >
        {section === 'dashboard' ? (
          <>
            <View style={styles.metricsGrid}>
              <MetricCard label="Workforce approvals" value={pendingWorkforceCount} tone={pendingWorkforceCount ? 'warning' : 'success'} />
              <MetricCard label="Visitor approvals" value={pendingVisitorCount} tone={pendingVisitorCount ? 'warning' : 'default'} />
              <MetricCard label="Active visitors" value={activeVisitorCount} tone={activeVisitorCount ? 'success' : 'default'} />
              <MetricCard label="Critical alerts" value={criticalAlertCount} tone={criticalAlertCount ? 'danger' : 'default'} />
            </View>
            <EnterpriseAnalytics data={analytics.data} onExport={(snapshot) => exportOperationalSnapshot(snapshot, analytics.data)} />
            <SurfaceCard title="Quick actions" subtitle="Fast mobile entry points for common admin decisions.">
              <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
                <PrimaryButton label="Approve workforce" onPress={() => navigation.navigate('Approvals')} />
                <PrimaryButton label="Scan QR" onPress={() => setActionMessage('QR scanning remains assigned to Security Mobile. Admin can review scan outcomes here.')} tone="secondary" />
                <PrimaryButton label="Create visitor pass" onPress={() => navigation.navigate('Visitors')} tone="secondary" />
                <PrimaryButton label="Emergency lockdown" onPress={() => setActionMessage('Lockdown command is staged as a protected control pending backend policy enablement.')} tone="danger" />
                <PrimaryButton label="Active visitors" onPress={() => navigation.navigate('Visitors')} tone="secondary" />
                <PrimaryButton label="Search employee" onPress={() => navigation.navigate('Employees')} tone="secondary" />
                <PrimaryButton label="Open register" onPress={() => navigation.navigate('Register')} tone="secondary" />
              </View>
            </SurfaceCard>
            <SplitPane>
              <SurfaceCard title="Workforce needing approval">
                <WorkforceList
                  workers={(workforceOnboarding.data ?? []).slice(0, 4)}
                  onApprove={approveWorkforce}
                  onReject={(worker) => setActionState({ type: 'reject-workforce', worker })}
                  onChanges={(worker) => setActionState({ type: 'changes-workforce', worker })}
                  loading={approveWorkforceMutation.isPending}
                />
              </SurfaceCard>
              <SurfaceCard title="Visitor exceptions">
                <VisitorList
                  visitors={[...(deniedVisitors.data?.items ?? []), ...(suspendedVisitors.data?.items ?? [])].slice(0, 4)}
                  onApprove={approveVisitor}
                  onReject={(visitor) => setActionState({ type: 'reject-visitor', visitor })}
                  onDeny={(visitor) => setActionState({ type: 'deny-visitor', visitor })}
                  onSuspend={(visitor) => setActionState({ type: 'suspend-visitor', visitor })}
                  onEscalate={(visitor) => setActionState({ type: 'escalate-visitor', visitor })}
                  onReactivate={reactivateVisitor}
                  onCheckIn={checkInVisitor}
                  onCheckOut={checkOutVisitor}
                />
              </SurfaceCard>
            </SplitPane>
          </>
        ) : null}

        {section === 'approvals' ? (
          <SplitPane>
            <SurfaceCard title="Workforce approvals" subtitle="Verify the live photo, department, shift, and security submitter before activation.">
              <WorkforceList
                workers={workforceOnboarding.data ?? []}
                onApprove={approveWorkforce}
                onReject={(worker) => setActionState({ type: 'reject-workforce', worker })}
                onChanges={(worker) => setActionState({ type: 'changes-workforce', worker })}
                loading={approveWorkforceMutation.isPending}
              />
            </SurfaceCard>
            <SurfaceCard title="Visitor approvals" subtitle="Approve or reject pending visitor access after host and history review.">
              <VisitorList
                visitors={pendingVisitors.data?.items ?? []}
                onApprove={approveVisitor}
                onReject={(visitor) => setActionState({ type: 'reject-visitor', visitor })}
                onDeny={(visitor) => setActionState({ type: 'deny-visitor', visitor })}
                onSuspend={(visitor) => setActionState({ type: 'suspend-visitor', visitor })}
                onEscalate={(visitor) => setActionState({ type: 'escalate-visitor', visitor })}
                onReactivate={reactivateVisitor}
                onCheckIn={checkInVisitor}
                onCheckOut={checkOutVisitor}
              />
            </SurfaceCard>
          </SplitPane>
        ) : null}

        {section === 'visitors' ? (
          <>
            <SurfaceCard title="Visitor search" subtitle="Operational queue search across visitor name, host, phone, organization, badge, and status.">
              <AppTextField label="Search visitors" value={search} onChangeText={(value) => { setSearch(value); setPage(0); }} placeholder="Name, host, company, phone, badge" />
              <SegmentRow options={REGISTER_STATUSES} value={visitorStatus} onChange={(value) => { setVisitorStatus(value); setPage(0); }} />
            </SurfaceCard>
            <SplitPane>
              <SurfaceCard title="Pending and priority requests">
                <VisitorList
                  visitors={visitorStatus === 'ALL' && !deferredSearch ? (pendingVisitors.data?.items ?? []) : (visitors.data?.items ?? [])}
                  onApprove={approveVisitor}
                  onReject={(visitor) => setActionState({ type: 'reject-visitor', visitor })}
                  onDeny={(visitor) => setActionState({ type: 'deny-visitor', visitor })}
                  onSuspend={(visitor) => setActionState({ type: 'suspend-visitor', visitor })}
                  onEscalate={(visitor) => setActionState({ type: 'escalate-visitor', visitor })}
                  onReactivate={reactivateVisitor}
                  onCheckIn={checkInVisitor}
                  onCheckOut={checkOutVisitor}
                />
              </SurfaceCard>
              <SurfaceCard title="Active and recurring oversight">
                <VisitorList
                  visitors={[...(approvedVisitors.data?.items ?? []), ...(insideVisitors.data?.items ?? []), ...(suspendedVisitors.data?.items ?? [])].slice(0, 10)}
                  onApprove={approveVisitor}
                  onReject={(visitor) => setActionState({ type: 'reject-visitor', visitor })}
                  onDeny={(visitor) => setActionState({ type: 'deny-visitor', visitor })}
                  onSuspend={(visitor) => setActionState({ type: 'suspend-visitor', visitor })}
                  onEscalate={(visitor) => setActionState({ type: 'escalate-visitor', visitor })}
                  onReactivate={reactivateVisitor}
                  onCheckIn={checkInVisitor}
                  onCheckOut={checkOutVisitor}
                />
              </SurfaceCard>
            </SplitPane>
          </>
        ) : null}

        {section === 'workforce' ? (
          <>
            <SurfaceCard title="Onboarding approvals" subtitle="Temporary and assisted workforce approvals activate employee access only after admin review.">
              <WorkforceList
                workers={workforceOnboarding.data ?? []}
                onApprove={approveWorkforce}
                onReject={(worker) => setActionState({ type: 'reject-workforce', worker })}
                onChanges={(worker) => setActionState({ type: 'changes-workforce', worker })}
                loading={approveWorkforceMutation.isPending}
              />
            </SurfaceCard>
            <SurfaceCard title="Presence feed" subtitle="Recent workforce check-ins and guard-assisted attendance events.">
              <AttendanceList records={(attendance.data ?? []).slice(0, 16)} />
            </SurfaceCard>
          </>
        ) : null}

        {section === 'alerts' ? (
          <>
            <View style={styles.metricsGrid}>
              <MetricCard label="Denied entries" value={deniedVisitors.data?.totalItems ?? 0} tone={(deniedVisitors.data?.totalItems ?? 0) ? 'danger' : 'default'} />
              <MetricCard label="Suspended passes" value={suspendedVisitors.data?.totalItems ?? 0} tone={(suspendedVisitors.data?.totalItems ?? 0) ? 'warning' : 'default'} />
              <MetricCard label="Unread alerts" value={notifications.data?.unreadCount ?? 0} tone={(notifications.data?.unreadCount ?? 0) ? 'warning' : 'default'} />
            </View>
            <SurfaceCard title="Actionable events" subtitle="Operational exceptions that can be acknowledged, escalated, or resolved from mobile.">
              <VisitorList
                visitors={[...(deniedVisitors.data?.items ?? []), ...(suspendedVisitors.data?.items ?? [])].slice(0, 8)}
                onApprove={approveVisitor}
                onReject={(visitor) => setActionState({ type: 'reject-visitor', visitor })}
                onDeny={(visitor) => setActionState({ type: 'deny-visitor', visitor })}
                onSuspend={(visitor) => setActionState({ type: 'suspend-visitor', visitor })}
                onEscalate={(visitor) => setActionState({ type: 'escalate-visitor', visitor })}
                onReactivate={reactivateVisitor}
                onCheckIn={checkInVisitor}
                onCheckOut={checkOutVisitor}
              />
            </SurfaceCard>
            <NotificationCenter
              title="Live alert inbox"
              subtitle="Acknowledge by marking read. Visitor-linked escalations remain available from the event cards above."
              inbox={{ unreadCount: securityNotifications.filter((item) => !item.read).length, items: securityNotifications }}
              localNotifications={localSecurityNotifications}
              onMarkRead={markRead}
              onMarkAllRead={async () => {
                await markAllReadMutation.mutateAsync();
                await refreshWorkspace();
              }}
              onMarkLocalRead={markLocalNotificationRead}
              loading={markAllReadMutation.isPending}
            />
          </>
        ) : null}

        {section === 'register' ? (
          <>
            <SurfaceCard title="Register filters" subtitle="Paged and searchable to avoid heavy mobile renders on operational tablets.">
              <AppTextField label="Search history" value={search} onChangeText={(value) => { setSearch(value); setPage(0); }} placeholder="Name, host, phone, badge, employee ID, incident" />
              <SegmentRow options={REGISTER_STATUSES} value={visitorStatus} onChange={(value) => { setVisitorStatus(value); setPage(0); }} />
              <View style={styles.paginationRow}>
                <PrimaryButton label="Newer" onPress={() => setPage((current) => Math.max(0, current - 1))} tone="secondary" disabled={page === 0} />
                <Text style={styles.pageText}>Page {page + 1} of {Math.max(visitors.data?.totalPages ?? 1, 1)}</Text>
                <PrimaryButton label="Older" onPress={() => setPage((current) => current + 1)} tone="secondary" disabled={Boolean(visitors.data?.last)} />
              </View>
            </SurfaceCard>
            <SplitPane>
              <SurfaceCard title="Visitor history">
                <VisitorList
                  visitors={visitors.data?.items ?? []}
                  onApprove={approveVisitor}
                  onReject={(visitor) => setActionState({ type: 'reject-visitor', visitor })}
                  onDeny={(visitor) => setActionState({ type: 'deny-visitor', visitor })}
                  onSuspend={(visitor) => setActionState({ type: 'suspend-visitor', visitor })}
                  onEscalate={(visitor) => setActionState({ type: 'escalate-visitor', visitor })}
                  onReactivate={reactivateVisitor}
                  onCheckIn={checkInVisitor}
                  onCheckOut={checkOutVisitor}
                />
              </SurfaceCard>
              <SurfaceCard title="Workforce logs">
                <AttendanceList records={(attendance.data ?? []).filter((entry) => matchesAttendance(entry, deferredSearch)).slice(0, 20)} />
              </SurfaceCard>
            </SplitPane>
          </>
        ) : null}

        {section === 'employees' ? (
          <>
            <SurfaceCard title="Employee lookup" subtitle="Limited to access, badge state, presence, and operational verification.">
              <AppTextField label="Search employees" value={search} onChangeText={setSearch} placeholder="Name, employee ID, department, badge status" />
            </SurfaceCard>
            <EmployeeList
              users={filteredEmployees.slice(0, 40)}
              attendance={attendance.data ?? []}
              onDisable={suspendUser}
              onEnable={reactivateUser}
              disableLoading={disableUserMutation.isPending}
              enableLoading={enableUserMutation.isPending}
            />
          </>
        ) : null}

        {section === 'settings' ? (
          <SurfaceCard title="Mobile admin scope" subtitle="Organization-scoped controls are enabled on mobile. Super Admin remains web-only.">
            <RecordCard
              title={session?.user.fullName || 'Admin operator'}
              subtitle={[session?.user.organizationCode || 'Organization scope', session?.user.email].filter(Boolean).join(' - ')}
              meta="Mobile access: approvals, visitor operations, alerts, register, workforce, and employee access controls."
              status={session?.user.activeRole || 'ADMIN'}
              tone="info"
            />
            <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
              <PrimaryButton label="Log out" onPress={() => void logout()} tone="danger" disabled={isBusy} />
            </View>
          </SurfaceCard>
        ) : null}

        {reports.data?.length && section === 'dashboard' ? (
          <SurfaceCard title="Audit oversight">
            {reports.data.slice(0, 4).map((report, index) => (
              <RecordCard key={`${report.title}-${index}`} title={report.title} subtitle={report.status} status="Oversight" tone="default" />
            ))}
          </SurfaceCard>
        ) : null}

        {actionMessage ? (
          <SurfaceCard title="Operational update">
            <StatusPill label="Recorded" tone="success" />
            <Text style={styles.bodyText}>{actionMessage}</Text>
          </SurfaceCard>
        ) : null}
      </AppScreen>

      <ReasonCaptureModal
        visible={Boolean(actionState)}
        title={reasonTitle(actionState)}
        helperText={reasonHelper(actionState)}
        confirmLabel={reasonConfirm(actionState)}
        minLength={actionState?.type === 'disable-user' ? 4 : 8}
        loading={rejectWorkforceMutation.isPending
          || rejectVisitorMutation.isPending
          || denyVisitorMutation.isPending
          || suspendVisitorMutation.isPending
          || escalateVisitorMutation.isPending
          || disableUserMutation.isPending}
        onCancel={() => setActionState(null)}
        onConfirm={executeReasonAction}
      />
    </>
  );
}

function SplitPane({ children }: { children: ReactNode }) {
  const layout = useResponsiveLayout();
  return (
    <View style={[styles.splitPane, layout.isTwoColumn ? styles.splitPaneWide : null]}>
      {Children.map(children, (child) => (
        <View style={layout.isTwoColumn ? styles.splitPaneColumn : null}>{child}</View>
      ))}
    </View>
  );
}

function EnterpriseAnalytics({ data, onExport }: { data?: AdminOperationalAnalytics; onExport: (snapshot: AnalyticsSnapshot) => void | Promise<void> }) {
  const layout = useResponsiveLayout();
  const widgets = data?.widgets ?? [];
  const liveOperations = data?.liveOperations ?? [];
  const insights = data?.operationalInsights ?? [];
  const heatmap = data?.trafficHeatmap ?? [];
  const checkInHours = data?.checkInHours ?? data?.peakHours ?? [];
  const checkOutHours = data?.checkOutHours ?? [];
  const workforceRush = data?.workforceRushHours ?? [];
  const repeatVisitors = data?.repeatVisitors ?? [];
  const repeatOrganizations = data?.repeatOrganizations ?? [];
  const repeatDenied = data?.repeatDeniedVisitors ?? [];
  const denialReasons = data?.denialReasons ?? [];
  const denialTrends = data?.denialTrends ?? [];
  const incidents = data?.securityIncidents ?? [];
  const incidentTrends = data?.incidentTrends ?? [];
  const anomalies = data?.workforceAnomalies ?? [];
  const checkpoints = data?.checkpointActivity ?? [];
  const snapshots = data?.exportSnapshots ?? [];
  const organizationBreakdown = data?.organizationBreakdown ?? [];
  const departmentBreakdown = data?.departmentBreakdown ?? [];
  const categoryBreakdown = data?.visitorCategoryBreakdown ?? [];

  return (
    <>
      {widgets.length ? (
        <SurfaceCard title="Operational intelligence" subtitle={`Live organization analytics${data?.timezone ? ` in ${data.timezone}` : ''}.`}>
          <View style={styles.metricsGrid}>
            {widgets.slice(0, 6).map((item) => (
              <MetricCard key={item.label} label={item.label} value={formatMetricValue(item.value)} tone={metricTone(item)} />
            ))}
          </View>
        </SurfaceCard>
      ) : null}

      <SplitPane>
        <SurfaceCard title="Live access state" subtitle="Current visitor, workforce, checkpoint, and expiration posture.">
          <AnalyticsTileGrid items={liveOperations} />
        </SurfaceCard>
        <SurfaceCard title="Actionable insights" subtitle="Generated from traffic, denial, incident, and workforce anomaly signals.">
          <InsightList items={insights} />
        </SurfaceCard>
      </SplitPane>

      <SurfaceCard title="Busiest entry hours" subtitle="Hourly traffic heatmap for guard staffing and entry planning.">
        <HourlyHeatmap rows={heatmap} />
      </SurfaceCard>

      <View style={[styles.analyticsGrid, layout.isTwoColumn ? styles.analyticsGridWide : null]}>
        <SurfaceCard title="Visitor traffic trends" subtitle="Check-in, check-out, and workforce rush windows.">
          <TrendBars title="Check-ins" items={checkInHours} />
          <TrendBars title="Check-outs" items={checkOutHours} />
          <TrendBars title="Workforce rush" items={workforceRush} />
        </SurfaceCard>
        <SurfaceCard title="Denied entry intelligence" subtitle="Security-focused denial reasons, retry patterns, and trend spikes.">
          <TrendBars title="Denied trend" items={denialTrends} compact />
          <AnalyticsList items={denialReasons} emptyTitle="No denial reasons" emptyBody="Denied-entry reasons will appear as security decisions are recorded." />
          <AnalyticsList items={repeatDenied} emptyTitle="No repeat denials" emptyBody="Repeat denied visitors will appear when patterns emerge." />
        </SurfaceCard>
      </View>

      <SplitPane>
        <SurfaceCard title="Repeat visitor intelligence" subtitle="Frequent visitors, recurring vendors, and organization traffic patterns.">
          <AnalyticsList items={repeatVisitors} emptyTitle="No repeat visitors" emptyBody="Repeat visitor movement will appear after multiple visits are recorded." />
          <AnalyticsList items={repeatOrganizations} emptyTitle="No repeat organizations" emptyBody="Vendor and organization repeat traffic will appear here." />
        </SurfaceCard>
        <SurfaceCard title="Security incident analytics" subtitle="Escalations, suspicious activity, manual overrides, and anomaly signals.">
          <TrendBars title="Incident spikes" items={incidentTrends} compact />
          <IncidentList items={incidents} />
        </SurfaceCard>
      </SplitPane>

      <SplitPane>
        <SurfaceCard title="Workforce access anomalies" subtitle="Access/security anomaly detection without payroll or HR scoring.">
          <AnalyticsList items={anomalies} emptyTitle="No workforce anomalies" emptyBody="Late, missing check-out, and manual override signals will appear here." />
        </SurfaceCard>
        <SurfaceCard title="Site and checkpoint activity" subtitle="Operational scope by checkpoint, organization, department, and visitor category.">
          <AnalyticsList items={checkpoints} emptyTitle="No checkpoint activity" emptyBody="Checkpoint activity appears after guard-assisted access events." />
          <AnalyticsList items={[...organizationBreakdown, ...departmentBreakdown, ...categoryBreakdown].slice(0, 8)} emptyTitle="No scope breakdown" emptyBody="Organization, department, and category analytics will appear after activity." />
        </SurfaceCard>
      </SplitPane>

      <SurfaceCard title="Historical reporting" subtitle="Operational snapshots prepared for CSV/PDF report generation.">
        <SnapshotList items={snapshots} onExport={onExport} />
      </SurfaceCard>
    </>
  );
}

function AnalyticsTileGrid({ items }: { items: AnalyticsPoint[] }) {
  if (!items.length) {
    return <EmptyState title="No live state" body="Current operational state will appear when analytics are available." />;
  }
  return (
    <View style={styles.analyticsTileGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.analyticsTile}>
          <Text style={styles.analyticsTileLabel}>{item.label}</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.analyticsTileValue}>{formatMetricValue(item.value)}</Text>
          {item.note ? <Text style={styles.analyticsTileNote}>{String(item.note)}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function InsightList({ items }: { items: OperationalInsight[] }) {
  if (!items.length) {
    return <EmptyState title="No insights yet" body="Actionable operational insights will appear after traffic and security patterns accumulate." />;
  }
  return (
    <View style={styles.listStack}>
      {items.slice(0, 6).map((item) => (
        <View key={`${item.label}-${item.detail}`} style={styles.insightRow}>
          <StatusPill label={String(item.severity || 'Signal')} tone={severityTone(item.severity)} />
          <View style={styles.insightBody}>
            <Text style={styles.insightTitle}>{item.label}</Text>
            <Text style={styles.analyticsTileNote}>{item.detail || 'Operational pattern detected.'}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function HourlyHeatmap({ rows }: { rows: AnalyticsHeatmapRow[] }) {
  const max = Math.max(1, ...rows.flatMap((row) => row.hours ?? []).map((item) => Number(item.value) || 0));
  if (!rows.length || max <= 1) {
    return <EmptyState title="No heatmap activity" body="Hourly traffic heatmaps will appear after check-ins are recorded." />;
  }
  return (
    <View style={styles.heatmap}>
      {rows.map((row) => (
        <View key={row.date || row.label} style={styles.heatmapRow}>
          <Text style={styles.heatmapLabel}>{row.label}</Text>
          <View style={styles.heatmapCells}>
            {(row.hours ?? []).map((hour) => (
              <View
                key={`${row.date}-${hour.hour}`}
                style={[styles.heatmapCell, { opacity: 0.2 + Math.min(0.8, (Number(hour.value) || 0) / max) }]}
              />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.heatmapAxis}>
        <Text style={styles.heatmapLabel}>00</Text>
        <Text style={styles.heatmapLabel}>06</Text>
        <Text style={styles.heatmapLabel}>12</Text>
        <Text style={styles.heatmapLabel}>18</Text>
        <Text style={styles.heatmapLabel}>23</Text>
      </View>
    </View>
  );
}

function TrendBars({ title, items, compact }: { title: string; items: AnalyticsPoint[]; compact?: boolean }) {
  const values = items.filter((_, index) => compact ? true : index % 2 === 0);
  const max = Math.max(1, ...values.map((item) => Number(item.value) || 0));
  if (!values.length || values.every((item) => Number(item.value) <= 0)) {
    return (
      <View style={styles.trendBlock}>
        <Text style={styles.trendTitle}>{title}</Text>
        <Text style={styles.analyticsTileNote}>No activity recorded.</Text>
      </View>
    );
  }
  return (
    <View style={styles.trendBlock}>
      <Text style={styles.trendTitle}>{title}</Text>
      {values.slice(0, compact ? 8 : 12).map((item) => (
        <View key={`${title}-${item.label}`} style={styles.trendRow}>
          <Text style={styles.trendLabel}>{item.label}</Text>
          <View style={styles.trendTrack}>
            <View style={[styles.trendFill, { width: `${Math.max(4, Math.round(((Number(item.value) || 0) / max) * 100))}%` }]} />
          </View>
          <Text style={styles.trendValue}>{formatMetricValue(item.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function AnalyticsList({ items, emptyTitle, emptyBody }: { items: AnalyticsPoint[]; emptyTitle: string; emptyBody: string }) {
  if (!items.length) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }
  return (
    <View style={styles.analyticsList}>
      {items.slice(0, 8).map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.analyticsListRow}>
          <Text numberOfLines={2} style={styles.analyticsListTitle}>{item.label}</Text>
          <Text style={styles.analyticsListValue}>{formatMetricValue(item.value)}</Text>
          {item.note || item.reason || item.detail ? <Text numberOfLines={2} style={styles.analyticsTileNote}>{String(item.note || item.reason || item.detail)}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function IncidentList({ items }: { items: AnalyticsPoint[] }) {
  if (!items.length) {
    return <EmptyState title="No incident signals" body="Escalations and suspicious activity will appear as security teams record events." />;
  }
  return (
    <View style={styles.listStack}>
      {items.slice(0, 6).map((item, index) => (
        <RecordCard
          key={`${item.label}-${index}`}
          title={String(item.label || 'Security incident')}
          subtitle={String(item.target || item.value || 'Recorded')}
          meta={String(item.detail || item.createdAt || 'Latest security signal')}
          status="Incident"
          tone="warning"
        />
      ))}
    </View>
  );
}

function SnapshotList({ items, onExport }: { items: AnalyticsSnapshot[]; onExport: (snapshot: AnalyticsSnapshot) => void | Promise<void> }) {
  if (!items.length) {
    return <EmptyState title="No report snapshots" body="Exportable visitor, denial, incident, workforce, and operational snapshots will appear here." />;
  }
  return (
    <View style={styles.analyticsTileGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.snapshotTile}>
          <View style={styles.snapshotHeader}>
            <Text style={styles.analyticsTileLabel}>{item.label}</Text>
            <StatusPill label={String(item.format || 'CSV')} tone={item.format === 'PDF' ? 'info' : 'default'} />
          </View>
          <Text style={styles.analyticsTileValue}>{formatMetricValue(item.records ?? 0)}</Text>
          <Text style={styles.analyticsTileNote}>{item.note || 'Operational report snapshot'}</Text>
          <PrimaryButton label={`Export ${item.format || 'CSV'}`} onPress={() => void onExport(item)} tone="secondary" />
        </View>
      ))}
    </View>
  );
}

function metricTone(item: AnalyticsPoint): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const label = String(item.label || '').toLowerCase();
  const value = Number(item.value) || 0;
  if (label.includes('denied') || label.includes('incident') || label.includes('overdue')) {
    return value > 0 ? 'danger' : 'default';
  }
  if (label.includes('pending') || label.includes('expir')) {
    return value > 0 ? 'warning' : 'default';
  }
  if (label.includes('inside') || label.includes('active')) {
    return value > 0 ? 'success' : 'default';
  }
  return 'info';
}

function severityTone(severity?: string | null): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const value = String(severity || '').toLowerCase();
  if (value === 'high') {
    return 'danger';
  }
  if (value === 'medium') {
    return 'warning';
  }
  if (value === 'low') {
    return 'info';
  }
  return 'default';
}

function formatMetricValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  return String(value ?? 0);
}

function operationalReportCsv(snapshot: AnalyticsSnapshot, payload?: AdminOperationalAnalytics) {
  const rows = [
    ['Report', 'Section', 'Label', 'Value', 'Detail'],
    ...snapshotRows(snapshot, payload),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function operationalReportHtml(snapshot: AnalyticsSnapshot, payload?: AdminOperationalAnalytics) {
  const live = (payload?.liveOperations ?? []).map((item) => (
    `<article><span>${escapeReport(item.label)}</span><strong>${escapeReport(item.value)}</strong><small>${escapeReport(item.note || '')}</small></article>`
  )).join('');
  const insights = (payload?.operationalInsights ?? []).map((item) => (
    `<li><strong>${escapeReport(item.label)}</strong> ${escapeReport(item.detail || '')}</li>`
  )).join('');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:28px;color:#111827}h1{margin:0 0 8px}p{color:#4b5563}section{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:22px 0}article{border:1px solid #d1d5db;border-radius:10px;padding:12px}span,small{display:block;color:#6b7280;font-size:11px;text-transform:uppercase}strong{display:block;font-size:24px;margin:8px 0}</style></head><body><h1>${escapeReport(snapshot.label)}</h1><p>${escapeReport(snapshot.note || 'AccessFlow operational snapshot')}</p><section>${live}</section><h2>Actionable insights</h2><ul>${insights}</ul></body></html>`;
}

function snapshotRows(snapshot: AnalyticsSnapshot, payload?: AdminOperationalAnalytics) {
  const sections: [string, (AnalyticsPoint | OperationalInsight)[] | undefined][] = [
    ['Live operations', payload?.liveOperations],
    ['Repeat visitors', payload?.repeatVisitors],
    ['Denied reasons', payload?.denialReasons],
    ['Security incidents', payload?.securityIncidents],
    ['Workforce anomalies', payload?.workforceAnomalies],
    ['Checkpoint activity', payload?.checkpointActivity],
    ['Insights', payload?.operationalInsights],
  ];
  return sections.flatMap(([section, items]) => (items ?? []).map((item) => [
    snapshot.label,
    section,
    String((item as AnalyticsPoint).label || (item as OperationalInsight).label || ''),
    String((item as AnalyticsPoint).value ?? (item as OperationalInsight).severity ?? ''),
    String((item as AnalyticsPoint).note || (item as AnalyticsPoint).detail || (item as OperationalInsight).detail || ''),
  ]));
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function escapeReport(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugify(value?: string | null) {
  const slug = String(value || 'operational-snapshot').toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');
  return slug || 'operational-snapshot';
}

function reportTypeForSnapshot(snapshot: AnalyticsSnapshot) {
  const label = String(snapshot.label || '').toLowerCase();
  if (label.includes('incident')) {
    return 'incident-report';
  }
  if (label.includes('denied') || label.includes('reject')) {
    return 'denied-entry-report';
  }
  if (label.includes('workforce') || label.includes('attendance')) {
    return 'workforce-activity';
  }
  if (label.includes('audit')) {
    return 'operational-audit-log';
  }
  if (label.includes('checkpoint')) {
    return 'checkpoint-activity';
  }
  return 'visitor-register';
}

function WorkforceList({
  workers,
  onApprove,
  onReject,
  onChanges,
  loading,
}: {
  workers: WorkforceOnboardingRecord[];
  onApprove: (worker: WorkforceOnboardingRecord) => void | Promise<void>;
  onReject: (worker: WorkforceOnboardingRecord) => void;
  onChanges: (worker: WorkforceOnboardingRecord) => void;
  loading?: boolean;
}) {
  const layout = useResponsiveLayout();
  if (!workers.length) {
    return <EmptyState title="No workforce approvals" body="Security-assisted onboarding requests will appear here as live backend records." />;
  }
  return (
    <View style={styles.listStack}>
      {workers.map((worker) => (
        <View key={worker.id} style={styles.operationalCard}>
          <IdentityPhoto uri={worker.employeePhotoUrl} fallback="No photo" />
          <View style={styles.cardBody}>
            <RecordCard
              title={worker.fullName}
              subtitle={[worker.employeeType || 'Workforce', worker.department, worker.designation].filter(Boolean).join(' - ')}
              meta={[
                worker.shiftName ? `Shift: ${worker.shiftName}` : null,
                worker.shiftStartTime || worker.shiftEndTime ? `${worker.shiftStartTime || '--:--'}-${worker.shiftEndTime || '--:--'}` : null,
                worker.workforceOnboardingCreatedByName ? `Submitted by ${worker.workforceOnboardingCreatedByName}` : null,
                worker.workforceOnboardingCreatedAt ? formatDateTime(worker.workforceOnboardingCreatedAt) : null,
              ].filter(Boolean).join(' - ')}
              status={String(worker.accountStatus || 'Pending').replaceAll('_', ' ')}
              tone={statusTone(worker.accountStatus)}
            />
            <FieldGrid
              items={[
                ['Photo', worker.employeePhotoUrl ? 'Submitted' : 'Missing'],
                ['Department', worker.department || 'Unassigned'],
                ['Shift', [worker.shiftName, worker.shiftStartTime, worker.shiftEndTime].filter(Boolean).join(' ') || 'Not assigned'],
                ['Temporary', worker.employeeType?.includes('TEMP') ? 'Yes' : 'Review category'],
              ]}
            />
            <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
              <PrimaryButton label="Approve" onPress={() => void onApprove(worker)} loading={loading} />
              <PrimaryButton label="Reject" onPress={() => onReject(worker)} tone="danger" />
              <PrimaryButton label="Request changes" onPress={() => onChanges(worker)} tone="secondary" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function VisitorList({
  visitors,
  onApprove,
  onReject,
  onDeny,
  onSuspend,
  onEscalate,
  onReactivate,
  onCheckIn,
  onCheckOut,
}: {
  visitors: VisitorRecord[];
  onApprove: (visitor: VisitorRecord) => void | Promise<void>;
  onReject: (visitor: VisitorRecord) => void;
  onDeny: (visitor: VisitorRecord) => void;
  onSuspend: (visitor: VisitorRecord) => void;
  onEscalate: (visitor: VisitorRecord) => void;
  onReactivate: (visitor: VisitorRecord) => void | Promise<void>;
  onCheckIn: (visitor: VisitorRecord) => void | Promise<void>;
  onCheckOut: (visitor: VisitorRecord) => void | Promise<void>;
}) {
  const layout = useResponsiveLayout();
  if (!visitors.length) {
    return <EmptyState title="No visitor records" body="Live visitor requests, active passes, denied entries, and recurring access will appear here." />;
  }
  return (
    <View style={styles.listStack}>
      {visitors.map((visitor) => (
        <View key={visitor.id} style={styles.operationalCard}>
          <IdentityPhoto uri={visitor.photoUrl} fallback="No photo" />
          <View style={styles.cardBody}>
            <RecordCard
              title={visitor.fullName}
              subtitle={[visitorTypeLabel(visitor.visitorType), visitor.companyName || visitor.organizationName, visitor.hostEmployee ? `Host: ${visitor.hostEmployee}` : null].filter(Boolean).join(' - ')}
              meta={[
                visitor.badgeId ? `Badge ${visitor.badgeId}` : 'Badge pending',
                visitor.scheduledStartTime || visitor.accessWindowStartTime ? formatVisitorWindow(visitor) : null,
                visitor.createdAt ? `Submitted ${formatDateTime(visitor.createdAt)}` : null,
              ].filter(Boolean).join(' - ')}
              status={visitorStatusLabel(visitor.status)}
              tone={statusTone(visitor.status)}
            />
            <FieldGrid
              items={[
                ['Photo', visitor.photoUrl ? 'Verified asset' : 'Missing'],
                ['Host', visitor.hostEmployee || 'Unassigned'],
                ['History', `${visitor.statusHistory?.length ?? 0} events`],
                ['Purpose', visitor.purposeOfVisit || 'Not recorded'],
              ]}
            />
            <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
              {visitor.status === 'PENDING' ? <PrimaryButton label="Approve" onPress={() => void onApprove(visitor)} /> : null}
              {visitor.status === 'PENDING' ? <PrimaryButton label="Reject" onPress={() => onReject(visitor)} tone="danger" /> : null}
              {visitor.status === 'APPROVED' ? <PrimaryButton label="Check in" onPress={() => void onCheckIn(visitor)} /> : null}
              {visitor.status === 'CHECKED_IN' ? <PrimaryButton label="Check out" onPress={() => void onCheckOut(visitor)} /> : null}
              {visitor.status === 'SUSPENDED' ? <PrimaryButton label="Reactivate" onPress={() => void onReactivate(visitor)} tone="secondary" /> : null}
              {visitor.status !== 'REJECTED' ? <PrimaryButton label="Deny" onPress={() => onDeny(visitor)} tone="danger" /> : null}
              {['RECURRING', 'CONTRACTOR_VENDOR'].includes(String(visitor.visitorType || '')) && visitor.status !== 'SUSPENDED' ? (
                <PrimaryButton label="Suspend" onPress={() => onSuspend(visitor)} tone="secondary" />
              ) : null}
              <PrimaryButton label="Escalate" onPress={() => onEscalate(visitor)} tone="secondary" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function AttendanceList({ records }: { records: EmployeeAttendanceRecord[] }) {
  if (!records.length) {
    return <EmptyState title="No workforce logs" body="Employee presence and guard-assisted workforce events will appear here." />;
  }
  return (
    <View style={styles.listStack}>
      {records.map((record) => (
        <RecordCard
          key={record.id}
          title={record.employeeName}
          subtitle={[record.department, record.designation, record.organizationName].filter(Boolean).join(' - ')}
          meta={[
            record.employeeId ? `ID ${record.employeeId}` : null,
            record.checkInTime ? `In ${formatDateTime(record.checkInTime)}` : null,
            record.checkOutTime ? `Out ${formatDateTime(record.checkOutTime)}` : null,
            record.securityGuardName ? `Guard ${record.securityGuardName}` : null,
          ].filter(Boolean).join(' - ')}
          status={employeePresenceLabel(record)}
          tone={statusTone(record.status)}
        />
      ))}
    </View>
  );
}

function EmployeeList({
  users,
  attendance,
  onDisable,
  onEnable,
  disableLoading,
  enableLoading,
}: {
  users: WorkforceOnboardingRecord[];
  attendance: EmployeeAttendanceRecord[];
  onDisable: (user: WorkforceOnboardingRecord) => void;
  onEnable: (user: WorkforceOnboardingRecord) => void | Promise<void>;
  disableLoading?: boolean;
  enableLoading?: boolean;
}) {
  const layout = useResponsiveLayout();
  if (!users.length) {
    return <EmptyState title="No employees found" body="Try another name, employee ID, department, or badge status." />;
  }
  return (
    <View style={[styles.employeeGrid, layout.isTwoColumn ? styles.employeeGridWide : null]}>
      {users.map((user) => {
        const latest = attendance.find((entry) => entry.employeeUserId === user.id);
        return (
          <View key={user.id} style={styles.employeeCard}>
            <IdentityPhoto uri={user.employeePhotoUrl} fallback="No photo" compact />
            <View style={styles.cardBody}>
              <RecordCard
                title={user.fullName}
                subtitle={[user.employeeId ? `ID ${user.employeeId}` : null, user.department, user.designation].filter(Boolean).join(' - ')}
                meta={[
                  user.email,
                  latest?.checkInTime ? `Last in ${formatDateTime(latest.checkInTime)}` : 'No presence today',
                  user.active ? 'Badge active' : 'Badge inactive',
                ].filter(Boolean).join(' - ')}
                status={String(user.accountStatus || (user.active ? 'ACTIVE' : 'DISABLED')).replaceAll('_', ' ')}
                tone={user.active ? 'success' : 'danger'}
              />
              <FieldGrid
                items={[
                  ['Access', user.active ? 'Active' : 'Suspended'],
                  ['Presence', latest ? employeePresenceLabel(latest) : 'Unknown'],
                  ['Shift', [user.shiftName, user.shiftStartTime, user.shiftEndTime].filter(Boolean).join(' ') || 'Not assigned'],
                  ['Badge', user.accountStatus || 'Not recorded'],
                ]}
              />
              <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
                {user.active ? (
                  <PrimaryButton label="Suspend access" onPress={() => onDisable(user)} tone="danger" loading={disableLoading} />
                ) : (
                  <PrimaryButton label="Reactivate access" onPress={() => void onEnable(user)} loading={enableLoading} />
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SegmentRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmentRow}>
      {options.map((option) => (
        <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.segment, value === option.value ? styles.segmentActive : null]}>
          <Text style={[styles.segmentLabel, value === option.value ? styles.segmentLabelActive : null]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function IdentityPhoto({ uri, fallback, compact }: { uri?: string | null; fallback: string; compact?: boolean }) {
  if (uri) {
    return <Image source={{ uri }} style={[styles.identityPhoto, compact ? styles.identityPhotoCompact : null]} />;
  }
  return (
    <View style={[styles.identityFallback, compact ? styles.identityPhotoCompact : null]}>
      <Text style={styles.identityFallbackText}>{fallback}</Text>
    </View>
  );
}

function FieldGrid({ items }: { items: [string, string][] }) {
  return (
    <View style={styles.fieldGrid}>
      {items.map(([label, value]) => (
        <View key={label} style={styles.fieldCell}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text style={styles.fieldValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function matchesAttendance(entry: EmployeeAttendanceRecord, query: string) {
  if (!query) {
    return true;
  }
  return [
    entry.employeeName,
    entry.employeeId,
    entry.department,
    entry.designation,
    entry.employeeType,
    entry.organizationName,
    entry.securityGuardName,
    entry.state,
    entry.status,
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query.toLowerCase()));
}

function reasonTitle(action: AdminAction | null) {
  switch (action?.type) {
    case 'reject-workforce':
      return 'Reject workforce';
    case 'changes-workforce':
      return 'Request workforce changes';
    case 'reject-visitor':
      return 'Reject visitor';
    case 'deny-visitor':
      return 'Deny visitor entry';
    case 'suspend-visitor':
      return 'Suspend visitor access';
    case 'escalate-visitor':
      return 'Escalate visitor issue';
    case 'disable-user':
      return 'Suspend employee access';
    default:
      return 'Record reason';
  }
}

function reasonHelper(action: AdminAction | null) {
  switch (action?.type) {
    case 'changes-workforce':
      return 'Describe the missing or incorrect worker details so security can resubmit cleanly.';
    case 'disable-user':
      return 'Record why this employee access should be suspended. The backend audit trail will capture the action.';
    default:
      return 'Record the operational reason. This note is sent to the backend workflow and audit history where supported.';
  }
}

function reasonConfirm(action: AdminAction | null) {
  switch (action?.type) {
    case 'changes-workforce':
      return 'Request changes';
    case 'disable-user':
      return 'Suspend access';
    case 'escalate-visitor':
      return 'Escalate';
    case 'suspend-visitor':
      return 'Suspend';
    case 'deny-visitor':
      return 'Deny entry';
    default:
      return 'Submit';
  }
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  analyticsGrid: {
    gap: theme.spacing.md,
  },
  analyticsGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  analyticsTileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  analyticsTile: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 118,
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.md,
  },
  analyticsTileLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  analyticsTileValue: {
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: theme.typography.metric.fontWeight,
  },
  analyticsTileNote: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    lineHeight: 18,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  insightBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  insightTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  heatmap: {
    gap: theme.spacing.xs,
  },
  heatmapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  heatmapLabel: {
    width: 34,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
  },
  heatmapCells: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
  },
  heatmapCell: {
    flex: 1,
    aspectRatio: 1,
    minHeight: 8,
    borderRadius: 3,
    backgroundColor: theme.colors.info,
  },
  heatmapAxis: {
    marginLeft: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trendBlock: {
    gap: theme.spacing.xs,
  },
  trendTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 26,
  },
  trendLabel: {
    width: 58,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
  },
  trendTrack: {
    flex: 1,
    height: 9,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  trendFill: {
    height: '100%',
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
  },
  trendValue: {
    width: 42,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
    textAlign: 'right',
  },
  analyticsList: {
    gap: theme.spacing.sm,
  },
  analyticsListRow: {
    gap: 4,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.sm,
  },
  analyticsListTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  analyticsListValue: {
    color: theme.colors.info,
    fontSize: 20,
    fontWeight: theme.typography.metric.fontWeight,
  },
  snapshotTile: {
    flexGrow: 1,
    flexBasis: 190,
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.md,
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  splitPane: {
    gap: theme.spacing.md,
  },
  splitPaneWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  splitPaneColumn: {
    flex: 1,
    minWidth: 0,
  },
  listStack: {
    gap: theme.spacing.md,
  },
  operationalCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  cardBody: {
    flex: 1,
    gap: theme.spacing.md,
  },
  identityPhoto: {
    width: 82,
    height: 82,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceRaised,
  },
  identityPhotoCompact: {
    width: 62,
    height: 62,
    borderRadius: theme.radii.md,
  },
  identityFallback: {
    width: 82,
    height: 82,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm,
  },
  identityFallbackText: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  fieldCell: {
    flexGrow: 1,
    flexBasis: 130,
    gap: 3,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.sm,
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
  },
  fieldValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  actionGrid: {
    gap: theme.spacing.sm,
  },
  actionGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  segment: {
    minHeight: 42,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  segmentLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  segmentLabelActive: {
    color: theme.colors.textPrimary,
  },
  employeeGrid: {
    gap: theme.spacing.md,
  },
  employeeGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  employeeCard: {
    flexGrow: 1,
    flexBasis: 360,
    flexDirection: 'row',
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  pageText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
    textAlign: 'center',
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
