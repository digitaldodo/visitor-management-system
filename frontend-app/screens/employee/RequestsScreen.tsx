import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmployeeRescheduleModal } from '../../components/employee/EmployeeRescheduleModal';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { AppScreen } from '../../components/layout/AppScreen';
import { OperationalFieldList } from '../../components/security/OperationalFieldList';
import { ReasonCaptureModal } from '../../components/security/ReasonCaptureModal';
import {
  useApproveEmployeeVisitorMutation,
  useCreateEmployeeVisitorInviteMutation,
  useEmployeeApprovals,
  useEmployeeOverview,
  useEmployeePreApprovals,
  useEmployeeVisitorInvites,
  useRejectEmployeeVisitorMutation,
  useRevokeEmployeeVisitorInviteMutation,
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
  const visitorInvites = useEmployeeVisitorInvites();

  const approveMutation = useApproveEmployeeVisitorMutation();
  const rejectMutation = useRejectEmployeeVisitorMutation();
  const rescheduleMutation = useRescheduleEmployeeVisitorMutation();
  const createInviteMutation = useCreateEmployeeVisitorInviteMutation();
  const revokeInviteMutation = useRevokeEmployeeVisitorInviteMutation();
  const [inviteForm, setInviteForm] = useState({
    visitorName: '',
    visitorEmail: '',
    visitorPhone: '',
    purposeOfVisit: '',
    scheduledStartTime: '',
    expectedDurationMinutes: '60',
    approvalRequired: false,
    note: '',
  });
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [revokeInviteId, setRevokeInviteId] = useState<string | null>(null);

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
      queryClient.invalidateQueries({ queryKey: ['employee', 'visitor-invites'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'notifications'] }),
    ]);
  };

  const createInvite = async () => {
    if (!inviteForm.visitorName.trim() || !inviteForm.purposeOfVisit.trim() || !inviteForm.scheduledStartTime.trim()) {
      setInviteError('Visitor name, purpose, and arrival time are required.');
      return;
    }

    try {
      setInviteError(null);
      const scheduledStartTime = new Date(inviteForm.scheduledStartTime).toISOString();
      const invite = await createInviteMutation.mutateAsync({
        visitorName: inviteForm.visitorName.trim(),
        visitorEmail: inviteForm.visitorEmail.trim() || null,
        visitorPhone: inviteForm.visitorPhone.trim() || null,
        purposeOfVisit: inviteForm.purposeOfVisit.trim(),
        scheduledStartTime,
        expectedDurationMinutes: Number(inviteForm.expectedDurationMinutes) || 60,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        approvalRequired: inviteForm.approvalRequired,
        expiresInHours: 72,
        note: inviteForm.note.trim() || null,
      });
      setActionMessage(`Invite created for ${invite.visitorName}. ${invite.emailStatus === 'SENT' ? 'Email delivery is confirmed.' : invite.visitorEmail ? 'Email delivery is queued.' : 'Secure link is ready to share.'}`);
      setInviteForm({
        visitorName: '',
        visitorEmail: '',
        visitorPhone: '',
        purposeOfVisit: '',
        scheduledStartTime: '',
        expectedDurationMinutes: '60',
        approvalRequired: false,
        note: '',
      });
      await refreshWorkspace();
      if (invite.inviteUrl && !invite.visitorEmail) {
        await Share.share({ message: `AccessFlow visitor pre-registration: ${invite.inviteUrl}` }).catch(() => undefined);
      }
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Unable to create invite.');
    }
  };

  const revokeInvite = async (reason: string) => {
    if (!revokeInviteId) {
      return;
    }
    const invite = await revokeInviteMutation.mutateAsync({ inviteId: revokeInviteId, reason });
    setActionMessage(`${invite.visitorName}'s QR invite was revoked.`);
    setRevokeInviteId(null);
    await refreshWorkspace();
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
        sensitive
        sensitiveReason="employee-visitor-invites"
        refreshing={overview.isRefetching || approvals.isRefetching || preApprovals.isRefetching}
        onRefresh={() => Promise.all([
          overview.refetch(),
          approvals.refetch(),
          preApprovals.refetch(),
          visitorInvites.refetch(),
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
          title="Pre-registration invites"
          subtitle="Send a secure invite link so visitors complete details and receive their temporary QR before arrival."
        >
          <AppTextField label="Visitor name" value={inviteForm.visitorName} onChangeText={(visitorName) => setInviteForm((current) => ({ ...current, visitorName }))} placeholder="Full name" />
          <AppTextField label="Visitor email" value={inviteForm.visitorEmail} onChangeText={(visitorEmail) => setInviteForm((current) => ({ ...current, visitorEmail }))} placeholder="visitor@company.com" keyboardType="email-address" autoCapitalize="none" />
          <AppTextField label="Phone" value={inviteForm.visitorPhone} onChangeText={(visitorPhone) => setInviteForm((current) => ({ ...current, visitorPhone }))} placeholder="Optional phone" keyboardType="phone-pad" />
          <AppTextField label="Purpose" value={inviteForm.purposeOfVisit} onChangeText={(purposeOfVisit) => setInviteForm((current) => ({ ...current, purposeOfVisit }))} placeholder="Meeting, contractor visit, interview" />
          <AppTextField label="Arrival time" value={inviteForm.scheduledStartTime} onChangeText={(scheduledStartTime) => setInviteForm((current) => ({ ...current, scheduledStartTime }))} placeholder="2026-05-20T14:30" />
          <AppTextField
            label="Additional Note for Visitor"
            value={inviteForm.note}
            onChangeText={(note) => setInviteForm((current) => ({ ...current, note }))}
            placeholder="Parking, gate, reception, room, or personal instructions"
            multiline
            maxLength={500}
          />
          <View style={styles.segmentRow}>
            {['30', '60', '120', '240'].map((duration) => (
              <Pressable
                key={duration}
                onPress={() => setInviteForm((current) => ({ ...current, expectedDurationMinutes: duration }))}
                style={[styles.segment, inviteForm.expectedDurationMinutes === duration ? styles.segmentActive : null]}
              >
                <Text style={[styles.segmentLabel, inviteForm.expectedDurationMinutes === duration ? styles.segmentLabelActive : null]}>
                  {duration === '60' ? '1 hour' : duration === '120' ? '2 hours' : duration === '240' ? '4 hours' : '30 min'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: inviteForm.approvalRequired }}
            onPress={() => setInviteForm((current) => ({ ...current, approvalRequired: !current.approvalRequired }))}
            style={styles.toggleRow}
          >
            <View style={[styles.checkbox, inviteForm.approvalRequired ? styles.checkboxActive : null]}>
              {inviteForm.approvalRequired ? <Text style={styles.checkboxMark}>OK</Text> : null}
            </View>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Require approval after registration</Text>
              <Text style={styles.toggleBody}>Leave off for automatic pre-approval and QR issuance after the visitor completes the invite.</Text>
            </View>
          </Pressable>
          {inviteError ? <Text style={styles.errorText}>{inviteError}</Text> : null}
          <PrimaryButton
            label="Create secure invite"
            onPress={() => void createInvite()}
            loading={createInviteMutation.isPending}
          />
        </SurfaceCard>

        <SurfaceCard title="Invite lifecycle" subtitle="Track sent, viewed, completed, QR issued, expired, and revoked invite states.">
          {visitorInvites.data?.length ? (
            visitorInvites.data.slice(0, 10).map((invite) => (
              <View key={invite.id} style={styles.queueCard}>
                <RecordCard
                  title={invite.visitorName}
                  subtitle={[invite.companyName, invite.purposeOfVisit].filter(Boolean).join(' · ')}
                  meta={invite.scheduledStartTime ? formatDateTime(invite.scheduledStartTime, invite.timezone || invite.organizationTimezone) : 'Arrival time pending'}
                  status={invite.status.replaceAll('_', ' ')}
                  tone={invite.status === 'REVOKED' || invite.status === 'EXPIRED' ? 'danger' : invite.status === 'QR_ISSUED' ? 'success' : 'info'}
                />
                <OperationalFieldList
                  items={[
                    { label: 'Invite link', value: invite.inviteUrl || 'Link unavailable' },
                    { label: 'Expires', value: invite.expiresAt ? formatDateTime(invite.expiresAt, invite.timezone || invite.organizationTimezone) : 'No expiry recorded' },
                    { label: 'Viewed', value: invite.viewedAt ? formatDateTime(invite.viewedAt, invite.timezone || invite.organizationTimezone) : 'Not viewed yet' },
                    { label: 'QR status', value: invite.qrIssuedAt ? `Issued ${formatDateTime(invite.qrIssuedAt, invite.timezone || invite.organizationTimezone)}` : invite.approvalRequired ? 'Approval required' : 'Pending registration' },
                    { label: 'Email', value: invite.visitorEmail ? `${invite.emailStatus?.replaceAll('_', ' ') || 'Queued'}${invite.emailSentAt ? ` ${formatDateTime(invite.emailSentAt, invite.timezone || invite.organizationTimezone)}` : ''}` : 'No visitor email provided' },
                    { label: 'Visitor note', value: invite.note || 'No additional note' },
                  ]}
                />
                <View style={styles.actionRow}>
                  {invite.inviteUrl ? (
                    <PrimaryButton
                      label="Share link"
                      onPress={() => void Share.share({ message: `AccessFlow visitor pre-registration: ${invite.inviteUrl}` })}
                      tone="secondary"
                    />
                  ) : null}
                  {!['REVOKED', 'EXPIRED', 'ARRIVED'].includes(invite.status) ? (
                    <PrimaryButton
                      label="Revoke"
                      onPress={() => setRevokeInviteId(invite.id)}
                      tone="danger"
                    />
                  ) : null}
                </View>
              </View>
            ))
          ) : (
            <EmptyState title="No invites yet" body="Created pre-registration invites will appear here with lifecycle status and QR readiness." />
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

      <ReasonCaptureModal
        visible={Boolean(revokeInviteId)}
        title="Revoke visitor invite"
        helperText="Revoking an invite prevents the visitor from completing pre-registration or using an issued invite workflow."
        confirmLabel="Revoke invite"
        minLength={4}
        loading={revokeInviteMutation.isPending}
        onCancel={() => setRevokeInviteId(null)}
        onConfirm={revokeInvite}
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
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  segment: {
    minHeight: 44,
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primary,
  },
  checkboxMark: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '900',
  },
  toggleCopy: {
    flex: 1,
    gap: 3,
  },
  toggleTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  toggleBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    lineHeight: 18,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
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
