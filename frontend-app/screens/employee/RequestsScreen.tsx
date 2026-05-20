import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmployeeRescheduleModal } from '../../components/employee/EmployeeRescheduleModal';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppScreen } from '../../components/layout/AppScreen';
import { OperationalFieldList } from '../../components/security/OperationalFieldList';
import { ReasonCaptureModal } from '../../components/security/ReasonCaptureModal';
import {
  useApproveEmployeeVisitorMutation,
  useEmployeeApprovals,
  useEmployeeOverview,
  useEmployeePreApprovals,
  useRejectEmployeeVisitorMutation,
  useRescheduleEmployeeVisitorMutation,
} from '../../hooks/useEmployeeWorkspace';
import type { VisitorReschedulePayload } from '../../services/employeeService';
import type { VisitorRecord } from '../../types/domain';
import { theme } from '../../theme';
import {
  accessWindowLabel,
  formatDateTime,
  formatStatusLabel,
  formatVisitorType,
  visitScheduleLabel,
  visitorTone,
} from '../../utils/employeeFormatting';

type QueueAction =
  | { type: 'reject'; visitor: VisitorRecord }
  | { type: 'reschedule'; visitor: VisitorRecord };

export function RequestsScreen() {
  const queryClient = useQueryClient();
  const [queueAction, setQueueAction] = useState<QueueAction | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const overview = useEmployeeOverview();
  const approvals = useEmployeeApprovals();
  const preApprovals = useEmployeePreApprovals();

  const approveMutation = useApproveEmployeeVisitorMutation();
  const rejectMutation = useRejectEmployeeVisitorMutation();
  const rescheduleMutation = useRescheduleEmployeeVisitorMutation();

  const pendingVisitors = approvals.data?.items ?? [];
  const upcomingVisitors = preApprovals.data ?? [];
  const metricEntries = [
    {
      label: 'Pending approvals',
      value: pendingVisitors.length,
      tone: pendingVisitors.length ? 'warning' : 'success',
    },
    {
      label: 'Upcoming visitors',
      value: upcomingVisitors.length,
      tone: upcomingVisitors.length ? 'default' : 'success',
    },
    {
      label: 'Approved access',
      value: Number(overview.data?.metrics?.approved ?? 0),
      tone: 'success',
    },
    {
      label: 'Visitor alerts',
      value: Number(overview.data?.metrics?.rejected ?? 0) + Number(overview.data?.metrics?.suspended ?? 0),
      tone: Number(overview.data?.metrics?.rejected ?? 0) + Number(overview.data?.metrics?.suspended ?? 0) > 0 ? 'danger' : 'default',
    },
  ] as const;

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee', 'overview'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'pre-approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'notifications'] }),
    ]);
  };

  const approveVisitor = async (visitor: VisitorRecord) => {
    const updatedVisitor = await approveMutation.mutateAsync({ visitorId: visitor.id });
    setActionMessage(`${updatedVisitor.fullName} approved. Their access window is now reflected in the employee queue.`);
    await refreshWorkspace();
  };

  const rejectVisitor = async (reason: string) => {
    if (!queueAction || queueAction.type !== 'reject') {
      return;
    }

    const updatedVisitor = await rejectMutation.mutateAsync({
      visitorId: queueAction.visitor.id,
      note: reason,
    });
    setActionMessage(`${updatedVisitor.fullName} rejected. The backend audit trail and notification flow remain intact.`);
    setQueueAction(null);
    await refreshWorkspace();
  };

  const rescheduleVisitor = async (payload: VisitorReschedulePayload) => {
    if (!queueAction || queueAction.type !== 'reschedule') {
      return;
    }

    const updatedVisitor = await rescheduleMutation.mutateAsync({
      visitorId: queueAction.visitor.id,
      payload,
    });
    setActionMessage(`${updatedVisitor.fullName} rescheduled. The access window and QR validity were refreshed from the backend.`);
    setQueueAction(null);
    await refreshWorkspace();
  };

  return (
    <>
      <AppScreen
        title="Requests"
        subtitle="Approve, reject, or reschedule visitors without leaving the employee access workspace."
        refreshing={overview.isRefetching || approvals.isRefetching || preApprovals.isRefetching}
        onRefresh={() => Promise.all([
          overview.refetch(),
          approvals.refetch(),
          preApprovals.refetch(),
        ])}
      >
        <View style={styles.metricsGrid}>
          {metricEntries.map((entry) => (
            <MetricCard key={entry.label} label={entry.label} value={entry.value} tone={entry.tone} />
          ))}
        </View>

        <SurfaceCard
          title="Approval queue"
          subtitle="Fast host decisions for one-time, recurring, and pre-approved visitors. Backend validation still governs every sensitive transition."
        >
          {pendingVisitors.length ? (
            pendingVisitors.map((visitor) => (
              <View key={visitor.id} style={styles.queueCard}>
                <RecordCard
                  title={visitor.fullName}
                  subtitle={[visitor.companyName, visitor.purposeOfVisit].filter(Boolean).join(' · ')}
                  meta={visitScheduleLabel(visitor)}
                  status={formatStatusLabel(visitor.status)}
                  tone={visitorTone(visitor.status)}
                />
                <OperationalFieldList
                  items={[
                    { label: 'Visit type', value: formatVisitorType(visitor.visitorType) },
                    { label: 'Valid entry window', value: accessWindowLabel(visitor) },
                    { label: 'QR validity', value: visitor.qrExpiresAt ? `Until ${formatDateTime(visitor.qrExpiresAt, visitor.organizationTimezone || visitor.scheduledTimezone)}` : 'Generated after approval' },
                    { label: 'Timezone', value: visitor.organizationTimezone || visitor.scheduledTimezone || 'Device local time' },
                    { label: 'Host', value: visitor.hostEmployee || 'Assigned host pending' },
                    { label: 'Access notes', value: visitor.notes || visitor.rejectionReason || 'No additional notes' },
                  ]}
                />
                <View style={styles.actionRow}>
                  <PrimaryButton
                    label="Approve"
                    onPress={() => void approveVisitor(visitor)}
                    loading={approveMutation.isPending}
                  />
                  <PrimaryButton
                    label="Reschedule"
                    onPress={() => setQueueAction({ type: 'reschedule', visitor })}
                    tone="secondary"
                  />
                  <PrimaryButton
                    label="Reject"
                    onPress={() => setQueueAction({ type: 'reject', visitor })}
                    tone="danger"
                  />
                </View>
              </View>
            ))
          ) : (
            <EmptyState
              title="No pending approvals"
              body="New visitor requests will appear here when security or visitor workflows send them to you for host action."
            />
          )}
        </SurfaceCard>

        <SurfaceCard
          title="Upcoming access"
          subtitle="Keep an eye on approved and recurring visits, access windows, and organization-local timing without opening a bulky dashboard."
        >
          {upcomingVisitors.length ? (
            upcomingVisitors.map((visitor) => (
              <View key={visitor.id} style={styles.queueCard}>
                <RecordCard
                  title={visitor.fullName}
                  subtitle={[visitor.companyName, visitor.hostEmployee].filter(Boolean).join(' · ')}
                  meta={visitScheduleLabel(visitor)}
                  status={visitor.preApproved ? 'Pre-approved' : formatStatusLabel(visitor.status)}
                  tone={visitor.preApproved ? 'info' : visitorTone(visitor.status)}
                />
                <OperationalFieldList
                  items={[
                    { label: 'Valid entry window', value: accessWindowLabel(visitor) },
                    { label: 'QR validity', value: visitor.qrExpiresAt ? formatDateTime(visitor.qrExpiresAt, visitor.organizationTimezone || visitor.scheduledTimezone) : 'QR not issued yet' },
                    { label: 'Timezone', value: visitor.organizationTimezone || visitor.scheduledTimezone || 'Device local time' },
                    { label: 'Recurring rule', value: visitor.recurringSchedule || 'Single visit' },
                  ]}
                />
                <View style={styles.upcomingFooter}>
                  <StatusPill
                    label={visitor.preApproved ? 'Access ready' : formatStatusLabel(visitor.status)}
                    tone={visitor.preApproved ? 'success' : visitorTone(visitor.status)}
                  />
                  <PrimaryButton
                    label="Adjust timing"
                    onPress={() => setQueueAction({ type: 'reschedule', visitor })}
                    tone="secondary"
                  />
                </View>
              </View>
            ))
          ) : (
            <EmptyState
              title="No upcoming visitors"
              body="Once future visits are approved or pre-approved, their access windows will be visible here in the organization timezone."
            />
          )}
        </SurfaceCard>

        {actionMessage ? (
          <SurfaceCard title="Operational update">
            <StatusPill label="Synced" tone="success" />
            <Text style={styles.bodyText}>{actionMessage}</Text>
          </SurfaceCard>
        ) : null}
      </AppScreen>

      <ReasonCaptureModal
        visible={queueAction?.type === 'reject'}
        title="Reject visitor request"
        helperText="Record why the visit should not proceed so the requester and security teams have the right context."
        confirmLabel="Reject request"
        minLength={4}
        loading={rejectMutation.isPending}
        onCancel={() => setQueueAction(null)}
        onConfirm={rejectVisitor}
      />

      <EmployeeRescheduleModal
        visible={queueAction?.type === 'reschedule'}
        visitor={queueAction?.type === 'reschedule' ? queueAction.visitor : null}
        loading={rescheduleMutation.isPending}
        onCancel={() => setQueueAction(null)}
        onConfirm={rescheduleVisitor}
      />
    </>
  );
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  queueCard: {
    gap: theme.spacing.md,
  },
  actionRow: {
    gap: theme.spacing.sm,
  },
  upcomingFooter: {
    gap: theme.spacing.sm,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
