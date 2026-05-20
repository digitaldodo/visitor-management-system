import { Children, useMemo, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { AppScreen } from '../../components/layout/AppScreen';
import { NotificationCenter } from '../../components/notifications/NotificationCenter';
import { ReasonCaptureModal } from '../../components/security/ReasonCaptureModal';
import {
  useAdminOverview,
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
import { theme } from '../../theme';
import type { EmployeeAttendanceRecord, NotificationRecord, VisitorRecord, VisitorStatus, WorkforceOnboardingRecord } from '../../types/domain';
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
  return <AdminOperationalScreen section="settings" />;
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
        contentMaxWidth={layout.isLargeTablet ? 1220 : undefined}
        refreshing={isRefreshing}
        onRefresh={() => {
          void refreshWorkspace();
        }}
      >
        {section === 'dashboard' ? (
          <>
            <View style={styles.metricsGrid}>
              <MetricCard label="Workforce approvals" value={pendingWorkforceCount} tone={pendingWorkforceCount ? 'warning' : 'success'} />
              <MetricCard label="Visitor approvals" value={pendingVisitorCount} tone={pendingVisitorCount ? 'warning' : 'default'} />
              <MetricCard label="Active visitors" value={activeVisitorCount} tone={activeVisitorCount ? 'success' : 'default'} />
              <MetricCard label="Critical alerts" value={criticalAlertCount} tone={criticalAlertCount ? 'danger' : 'default'} />
            </View>
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
              <PrimaryButton label="Refresh live data" onPress={() => void refreshWorkspace()} tone="secondary" />
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
