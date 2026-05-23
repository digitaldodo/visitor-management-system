import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmployeeRescheduleModal } from '../../components/employee/EmployeeRescheduleModal';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { ArrivalTimeSelector, nearestArrivalTime } from '../../components/form/ArrivalTimeSelector';
import { InternationalPhoneInput, validateInternationalPhone } from '../../components/form/InternationalPhoneInput';
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
import { canonicalVisitorInviteStage } from '../../types/workflow';
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
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [inviteForm, setInviteForm] = useState({
    visitorName: '',
    visitorEmail: '',
    visitorPhone: '',
    phoneCountryCode: '+1',
    purposeOfVisit: '',
    scheduledStartAt: nearestArrivalTime(),
    expectedDurationMinutes: '60',
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
    if (!inviteForm.visitorName.trim() || !inviteForm.purposeOfVisit.trim()) {
      setInviteError('Visitor name and purpose are required.');
      return;
    }

    const phoneError = validateInternationalPhone(inviteForm.phoneCountryCode, inviteForm.visitorPhone, false);
    if (phoneError) {
      setInviteError(phoneError);
      return;
    }

    if (Number.isNaN(inviteForm.scheduledStartAt.getTime())) {
      setInviteError('Choose a valid arrival date and time.');
      return;
    }

    if (inviteForm.scheduledStartAt.getTime() <= Date.now()) {
      setInviteError('Choose a future arrival date and time.');
      return;
    }

    try {
      setInviteError(null);
      const duration = Number(inviteForm.expectedDurationMinutes) || 60;
      const scheduledEndAt = new Date(inviteForm.scheduledStartAt.getTime() + duration * 60_000);
      const invite = await createInviteMutation.mutateAsync({
        visitorName: inviteForm.visitorName.trim(),
        visitorEmail: inviteForm.visitorEmail.trim() || null,
        phoneCountryCode: inviteForm.visitorPhone.trim() ? inviteForm.phoneCountryCode.trim() || null : null,
        visitorPhone: inviteForm.visitorPhone.trim() || null,
        purposeOfVisit: inviteForm.purposeOfVisit.trim(),
        scheduledStartTime: inviteForm.scheduledStartAt.toISOString(),
        scheduledEndTime: scheduledEndAt.toISOString(),
        expectedDurationMinutes: duration,
        timezone: localTimezone,
        approvalRequired: true,
        expiresInHours: 72,
        note: inviteForm.note.trim() || null,
      });
      setActionMessage(`Invite created for ${invite.visitorName}. ${invite.emailStatus === 'SENT' ? 'Email delivery is confirmed.' : invite.visitorEmail ? 'Email delivery is queued.' : 'Secure link is ready to share.'}`);
      setInviteForm({
        visitorName: '',
        visitorEmail: '',
        visitorPhone: '',
        phoneCountryCode: '+1',
        purposeOfVisit: '',
        scheduledStartAt: nearestArrivalTime(),
        expectedDurationMinutes: '60',
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

  const invitePhoneError = validateInternationalPhone(inviteForm.phoneCountryCode, inviteForm.visitorPhone, false);

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
          subtitle="Send a secure invite link so visitors complete details before approval. Approved QR badges are issued only after host action."
        >
          <AppTextField label="Visitor name" value={inviteForm.visitorName} onChangeText={(visitorName) => setInviteForm((current) => ({ ...current, visitorName }))} placeholder="Full name" />
          <AppTextField label="Visitor email" value={inviteForm.visitorEmail} onChangeText={(visitorEmail) => setInviteForm((current) => ({ ...current, visitorEmail }))} placeholder="visitor@company.com" keyboardType="email-address" autoCapitalize="none" />
          <InternationalPhoneInput
            countryCode={inviteForm.phoneCountryCode}
            phone={inviteForm.visitorPhone}
            phoneLabel="Visitor phone"
            helperText="Search country, then enter the visitor's local number."
            errorText={invitePhoneError}
            onCountryCodeChange={(phoneCountryCode) => setInviteForm((current) => ({ ...current, phoneCountryCode }))}
            onPhoneChange={(visitorPhone) => setInviteForm((current) => ({ ...current, visitorPhone }))}
          />
          <AppTextField label="Purpose" value={inviteForm.purposeOfVisit} onChangeText={(purposeOfVisit) => setInviteForm((current) => ({ ...current, purposeOfVisit }))} placeholder="Meeting, contractor visit, interview" />
          <ArrivalTimeSelector
            value={inviteForm.scheduledStartAt}
            durationMinutes={inviteForm.expectedDurationMinutes}
            timezone={localTimezone}
            durationOptions={['30', '60', '120', '240']}
            onChange={(scheduledStartAt) => setInviteForm((current) => ({ ...current, scheduledStartAt }))}
            onDurationChange={(expectedDurationMinutes) => setInviteForm((current) => ({ ...current, expectedDurationMinutes }))}
          />
          <View style={styles.scheduleSummary}>
            <Text style={styles.scheduleSummaryLabel}>Invite schedule</Text>
            <Text style={styles.scheduleSummaryValue}>{formatDateTime(inviteForm.scheduledStartAt.toISOString(), localTimezone)}</Text>
          </View>
          <AppTextField
            label="Additional Note for Visitor"
            value={inviteForm.note}
            onChangeText={(note) => setInviteForm((current) => ({ ...current, note }))}
            placeholder="Parking, gate, reception, room, or personal instructions"
            multiline
            maxLength={500}
          />
          <View style={styles.policyPanel}>
            <StatusPill label="Approval required" tone="warning" />
            <Text style={styles.bodyText}>Visitors can pre-register from email or the app, then wait in the approval queue. AccessFlow will not issue the QR badge until you approve.</Text>
          </View>
          {inviteError ? <Text style={styles.errorText}>{inviteError}</Text> : null}
          <PrimaryButton
            label="Create secure invite"
            onPress={() => void createInvite()}
            loading={createInviteMutation.isPending}
          />
        </SurfaceCard>

        <SurfaceCard title="Invite lifecycle" subtitle="Track invited, pre-registration pending, awaiting approval, badge issued, expired, and revoked states.">
          {visitorInvites.data?.length ? (
            visitorInvites.data.slice(0, 10).map((invite) => (
              <View key={invite.id} style={styles.queueCard}>
                <RecordCard
                  title={invite.visitorName}
                  subtitle={[invite.companyName, invite.purposeOfVisit].filter(Boolean).join(' · ')}
                  meta={invite.scheduledStartTime ? formatDateTime(invite.scheduledStartTime, invite.timezone || invite.organizationTimezone) : 'Arrival time pending'}
                  status={invite.lifecycleLabel || invite.status.replaceAll('_', ' ')}
                  tone={inviteStatusTone(invite)}
                />
                <OperationalFieldList
                  items={[
                    { label: 'Invite link', value: invite.inviteUrl || 'Link unavailable' },
                    { label: 'Expires', value: invite.expiresAt ? formatDateTime(invite.expiresAt, invite.timezone || invite.organizationTimezone) : 'No expiry recorded' },
                    { label: 'Viewed', value: invite.viewedAt ? formatDateTime(invite.viewedAt, invite.timezone || invite.organizationTimezone) : 'Not viewed yet' },
                    { label: 'QR status', value: invite.qrIssuedAt ? `Issued ${formatDateTime(invite.qrIssuedAt, invite.timezone || invite.organizationTimezone)}` : 'Not issued before approval' },
                    { label: 'Next step', value: invite.nextAction || 'Monitor invite lifecycle' },
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
                  {!['REVOKED', 'EXPIRED', 'CHECKED_IN', 'CHECKED_OUT'].includes(canonicalVisitorInviteStage(invite.lifecycleStage || invite.status, invite.qrIssuedAt, invite.arrivedAt)) ? (
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

function inviteStatusTone(invite: {
  status?: string | null;
  lifecycleStage?: string | null;
  qrIssuedAt?: string | null;
  arrivedAt?: string | null;
}): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const stage = canonicalVisitorInviteStage(invite.lifecycleStage || invite.status, invite.qrIssuedAt, invite.arrivedAt);
  if (['REVOKED', 'EXPIRED', 'REJECTED'].includes(stage)) {
    return 'danger';
  }
  if (['BADGE_ISSUED', 'CHECKED_IN', 'CHECKED_OUT'].includes(stage)) {
    return 'success';
  }
  if (['PENDING_APPROVAL', 'PRE_REGISTERED'].includes(stage)) {
    return 'warning';
  }
  return 'info';
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
  scheduleSummary: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  scheduleSummaryLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  scheduleSummaryValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
    lineHeight: 22,
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
  policyPanel: {
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    padding: theme.spacing.md,
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
