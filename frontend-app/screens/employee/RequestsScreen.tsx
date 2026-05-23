import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
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
  useApproveEmployeeVisitorRescheduleMutation,
  useCreateEmployeePreApprovalMutation,
  useCreateEmployeeVisitorInviteMutation,
  useEmployeeApprovals,
  useEmployeeOverview,
  useEmployeePreApprovals,
  useEmployeeVisitorHistory,
  useEmployeeVisitorInvites,
  useRejectEmployeeVisitorMutation,
  useRejectEmployeeVisitorRescheduleMutation,
  useRevokeEmployeeVisitorInviteMutation,
  useResendEmployeeVisitorInviteMutation,
  useRescheduleEmployeeVisitorMutation,
} from '../../hooks/useEmployeeWorkspace';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { VisitorReschedulePayload } from '../../services/employeeService';
import type { VisitorRecord } from '../../types/domain';
import { canResendVisitorInvite, canonicalVisitorInviteStage, enterpriseStatusLabel, visitorInviteStatusLabel } from '../../types/workflow';
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
  | { type: 'reschedule'; visitor: VisitorRecord }
  | { type: 'reject-reschedule'; visitor: VisitorRecord };

const EMPLOYEE_HISTORY_STATUSES = [
  { label: 'All', value: 'ALL' },
  { label: 'Upcoming', value: 'UPCOMING' },
  { label: 'Repeat', value: 'REPEAT' },
  { label: 'Denied', value: 'REJECTED' },
  { label: 'Inside', value: 'CHECKED_IN' },
  { label: 'Completed', value: 'CHECKED_OUT' },
] as const;

export function RequestsScreen() {
  const queryClient = useQueryClient();
  const [queueAction, setQueueAction] = useState<QueueAction | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState<(typeof EMPLOYEE_HISTORY_STATUSES)[number]['value']>('ALL');
  const [historyPage, setHistoryPage] = useState(0);
  const deferredHistorySearch = useDebouncedValue(historySearch.trim(), 220);

  const overview = useEmployeeOverview();
  const approvals = useEmployeeApprovals();
  const preApprovals = useEmployeePreApprovals();
  const visitorInvites = useEmployeeVisitorInvites();
  const history = useEmployeeVisitorHistory(
    deferredHistorySearch,
    ['ALL', 'UPCOMING', 'REPEAT'].includes(historyStatus) ? undefined : historyStatus,
    historyPage,
    30,
  );

  const approveMutation = useApproveEmployeeVisitorMutation();
  const rejectMutation = useRejectEmployeeVisitorMutation();
  const rescheduleMutation = useRescheduleEmployeeVisitorMutation();
  const approveRescheduleMutation = useApproveEmployeeVisitorRescheduleMutation();
  const rejectRescheduleMutation = useRejectEmployeeVisitorRescheduleMutation();
  const createPreApprovalMutation = useCreateEmployeePreApprovalMutation();
  const createInviteMutation = useCreateEmployeeVisitorInviteMutation();
  const revokeInviteMutation = useRevokeEmployeeVisitorInviteMutation();
  const resendInviteMutation = useResendEmployeeVisitorInviteMutation();
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
  const [preApprovalForm, setPreApprovalForm] = useState({
    fullName: '',
    phoneCountryCode: '+1',
    phone: '',
    email: '',
    companyName: '',
    purposeOfVisit: '',
    scheduledStartAt: nearestArrivalTime(),
    expectedDurationMinutes: '60',
    note: '',
  });
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [preApprovalError, setPreApprovalError] = useState<string | null>(null);
  const [revokeInviteId, setRevokeInviteId] = useState<string | null>(null);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const resendingInvitesRef = useRef(new Set<string>());

  const pendingVisitors = approvals.data?.items ?? [];
  const upcomingVisitors = preApprovals.data ?? [];
  const historyVisitors = history.data?.items ?? [];
  const repeatVisitorKeys = useMemo(() => {
    const visitsByKey = new Map<string, number>();
    [...historyVisitors, ...upcomingVisitors].forEach((visitor) => {
      const key = visitor.email?.toLowerCase() || visitor.phone || `${visitor.fullName.toLowerCase()}|${visitor.companyName || ''}`;
      visitsByKey.set(key, (visitsByKey.get(key) ?? 0) + 1);
    });
    return visitsByKey;
  }, [historyVisitors, upcomingVisitors]);
  const displayedHistoryVisitors = useMemo(() => {
    if (historyStatus === 'UPCOMING') {
      return upcomingVisitors;
    }
    if (historyStatus === 'REPEAT') {
      return historyVisitors.filter((visitor) => {
        const key = visitor.email?.toLowerCase() || visitor.phone || `${visitor.fullName.toLowerCase()}|${visitor.companyName || ''}`;
        return (repeatVisitorKeys.get(key) ?? 0) > 1 || Boolean(visitor.recurringSchedule);
      });
    }
    return historyVisitors;
  }, [historyStatus, historyVisitors, repeatVisitorKeys, upcomingVisitors]);
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
      queryClient.invalidateQueries({ queryKey: ['employee', 'history'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'notifications'] }),
    ]);
  };

  const createPreApproval = async () => {
    if (!preApprovalForm.fullName.trim() || !preApprovalForm.phone.trim() || !preApprovalForm.purposeOfVisit.trim()) {
      setPreApprovalError('Visitor name, phone, and purpose are required.');
      return;
    }

    const phoneError = validateInternationalPhone(preApprovalForm.phoneCountryCode, preApprovalForm.phone, true);
    if (phoneError) {
      setPreApprovalError(phoneError);
      return;
    }

    if (Number.isNaN(preApprovalForm.scheduledStartAt.getTime()) || preApprovalForm.scheduledStartAt.getTime() <= Date.now()) {
      setPreApprovalError('Choose a future arrival date and time.');
      return;
    }

    try {
      setPreApprovalError(null);
      const duration = Number(preApprovalForm.expectedDurationMinutes) || 60;
      const scheduledEndAt = new Date(preApprovalForm.scheduledStartAt.getTime() + duration * 60_000);
      const visitor = await createPreApprovalMutation.mutateAsync({
        fullName: preApprovalForm.fullName.trim(),
        phoneCountryCode: preApprovalForm.phoneCountryCode.trim() || null,
        phone: preApprovalForm.phone.trim(),
        email: preApprovalForm.email.trim() || null,
        companyName: preApprovalForm.companyName.trim() || null,
        purposeOfVisit: preApprovalForm.purposeOfVisit.trim(),
        scheduledStartTime: preApprovalForm.scheduledStartAt.toISOString(),
        scheduledEndTime: scheduledEndAt.toISOString(),
        timezone: localTimezone,
        note: preApprovalForm.note.trim() || null,
      });
      setActionMessage(`${visitor.fullName} pre-approved. Security will see the badge-ready access window.`);
      setPreApprovalForm({
        fullName: '',
        phoneCountryCode: '+1',
        phone: '',
        email: '',
        companyName: '',
        purposeOfVisit: '',
        scheduledStartAt: nearestArrivalTime(),
        expectedDurationMinutes: '60',
        note: '',
      });
      await refreshWorkspace();
    } catch (error) {
      setPreApprovalError(error instanceof Error ? error.message : 'Unable to create pre-approval.');
    }
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

  const resendInvite = async (invite: NonNullable<typeof visitorInvites.data>[number]) => {
    if (!canResendVisitorInvite(invite.lifecycleStage || invite.status, invite.visitorEmail, invite.qrIssuedAt, invite.arrivedAt)) {
      setActionMessage(invite.visitorEmail ? 'This invite is already closed and cannot be resent.' : 'This invite has no visitor email. Share the invite link instead.');
      return;
    }
    if (resendingInvitesRef.current.size > 0) {
      return;
    }

    try {
      resendingInvitesRef.current.add(invite.id);
      setResendingInviteId(invite.id);
      const updated = await resendInviteMutation.mutateAsync(invite.id);
      setActionMessage(`${updated.visitorName}'s invite was resent. Email delivery is queued and duplicate taps were ignored.`);
      await refreshWorkspace();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Unable to resend invite.');
    } finally {
      resendingInvitesRef.current.delete(invite.id);
      setResendingInviteId(null);
    }
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
    setActionMessage(`${updatedVisitor.fullName} denied. The backend audit trail and notification flow remain intact.`);
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

  const approveReschedule = async (visitor: VisitorRecord) => {
    const updatedVisitor = await approveRescheduleMutation.mutateAsync({ visitorId: visitor.id, note: 'Approved from AccessFlow mobile employee workspace.' });
    setActionMessage(`${updatedVisitor.fullName} timing change approved. QR validity was refreshed from the backend.`);
    await refreshWorkspace();
  };

  const rejectReschedule = async (reason: string) => {
    if (!queueAction || queueAction.type !== 'reject-reschedule') {
      return;
    }
    const updatedVisitor = await rejectRescheduleMutation.mutateAsync({
      visitorId: queueAction.visitor.id,
      note: reason,
    });
    setActionMessage(`${updatedVisitor.fullName} timing change denied. Original access window remains active.`);
    setQueueAction(null);
    await refreshWorkspace();
  };

  return (
    <>
      <AppScreen
        title="Requests"
        subtitle="Approve, deny, or reschedule visitors without leaving the employee access workspace."
        sensitive
        sensitiveReason="employee-visitor-invites"
        refreshing={overview.isRefetching || approvals.isRefetching || preApprovals.isRefetching || history.isRefetching}
        onRefresh={() => Promise.all([
          overview.refetch(),
          approvals.refetch(),
          preApprovals.refetch(),
          visitorInvites.refetch(),
          history.refetch(),
        ])}
      >
        <View style={styles.metricsGrid}>
          {metricEntries.map((entry) => (
            <MetricCard key={entry.label} label={entry.label} value={entry.value} tone={entry.tone} />
          ))}
        </View>

        <SurfaceCard
          title="Visitor history"
          subtitle="Searchable host-owned visitor reference for past, upcoming, repeat, denied, checked-in, and completed visits."
        >
          <AppTextField
            label="Search history"
            value={historySearch}
            onChangeText={(value) => {
              setHistorySearch(value);
              setHistoryPage(0);
            }}
            placeholder="Visitor, company, phone, purpose, badge"
          />
          <HistorySegmentRow
            value={historyStatus}
            onChange={(value) => {
              setHistoryStatus(value);
              setHistoryPage(0);
            }}
          />
          <RepeatVisitorInsights records={[...historyVisitors, ...upcomingVisitors]} />
          <EmployeeVisitorHistoryList
            records={displayedHistoryVisitors}
            repeatVisitorKeys={repeatVisitorKeys}
            onReschedule={(visitor) => setQueueAction({ type: 'reschedule', visitor })}
          />
          {historyStatus !== 'UPCOMING' ? (
            <View style={styles.paginationRow}>
              <PrimaryButton label="Newer" onPress={() => setHistoryPage((current) => Math.max(0, current - 1))} tone="secondary" disabled={historyPage === 0} />
              <Text style={styles.pageText}>Page {historyPage + 1} of {Math.max(history.data?.totalPages ?? 1, 1)}</Text>
              <PrimaryButton label="Older" onPress={() => setHistoryPage((current) => current + 1)} tone="secondary" disabled={Boolean(history.data?.last)} />
            </View>
          ) : null}
        </SurfaceCard>

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
                  {visitor.rescheduleStatus === 'PENDING' && visitor.pendingScheduledStartTime ? (
                    <>
                      <PrimaryButton
                        label="Approve timing"
                        onPress={() => void approveReschedule(visitor)}
                        loading={approveRescheduleMutation.isPending}
                        tone="secondary"
                      />
                      <PrimaryButton
                        label="Deny timing"
                        onPress={() => setQueueAction({ type: 'reject-reschedule', visitor })}
                        tone="danger"
                      />
                    </>
                  ) : null}
                  <PrimaryButton
                    label="Deny"
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
          title="Pre-approved visitor"
          subtitle="Create an approved access window directly from mobile for known guests. Security still verifies the badge and organization scope."
        >
          <AppTextField label="Visitor name" value={preApprovalForm.fullName} onChangeText={(fullName) => setPreApprovalForm((current) => ({ ...current, fullName }))} placeholder="Full name" />
          <InternationalPhoneInput
            countryCode={preApprovalForm.phoneCountryCode}
            phone={preApprovalForm.phone}
            phoneLabel="Visitor phone"
            helperText="Required for badge and audit traceability."
            errorText={validateInternationalPhone(preApprovalForm.phoneCountryCode, preApprovalForm.phone, false)}
            onCountryCodeChange={(phoneCountryCode) => setPreApprovalForm((current) => ({ ...current, phoneCountryCode }))}
            onPhoneChange={(phone) => setPreApprovalForm((current) => ({ ...current, phone }))}
          />
          <AppTextField label="Visitor email" value={preApprovalForm.email} onChangeText={(email) => setPreApprovalForm((current) => ({ ...current, email }))} placeholder="visitor@company.com" keyboardType="email-address" autoCapitalize="none" />
          <AppTextField label="Company" value={preApprovalForm.companyName} onChangeText={(companyName) => setPreApprovalForm((current) => ({ ...current, companyName }))} placeholder="Company or organization" />
          <AppTextField label="Purpose" value={preApprovalForm.purposeOfVisit} onChangeText={(purposeOfVisit) => setPreApprovalForm((current) => ({ ...current, purposeOfVisit }))} placeholder="Meeting, interview, vendor visit" />
          <ArrivalTimeSelector
            value={preApprovalForm.scheduledStartAt}
            durationMinutes={preApprovalForm.expectedDurationMinutes}
            timezone={localTimezone}
            durationOptions={['30', '60', '120', '240', '480']}
            onChange={(scheduledStartAt) => setPreApprovalForm((current) => ({ ...current, scheduledStartAt }))}
            onDurationChange={(expectedDurationMinutes) => setPreApprovalForm((current) => ({ ...current, expectedDurationMinutes }))}
          />
          <AppTextField label="Approval note" value={preApprovalForm.note} onChangeText={(note) => setPreApprovalForm((current) => ({ ...current, note }))} placeholder="Reception notes, room, or gate details" multiline />
          {preApprovalError ? <Text style={styles.errorText}>{preApprovalError}</Text> : null}
          <PrimaryButton
            label="Create pre-approval"
            onPress={() => void createPreApproval()}
            loading={createPreApprovalMutation.isPending}
          />
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
                  status={invite.lifecycleLabel || visitorInviteStatusLabel(invite.status)}
                  tone={inviteStatusTone(invite)}
                />
                <OperationalFieldList
                  items={[
                    { label: 'Invite link', value: invite.inviteUrl || 'Link unavailable' },
                    { label: 'Expires', value: invite.expiresAt ? formatDateTime(invite.expiresAt, invite.timezone || invite.organizationTimezone) : 'No expiry recorded' },
                    { label: 'Viewed', value: invite.viewedAt ? formatDateTime(invite.viewedAt, invite.timezone || invite.organizationTimezone) : 'Not viewed yet' },
                    { label: 'QR status', value: invite.qrIssuedAt ? `Issued ${formatDateTime(invite.qrIssuedAt, invite.timezone || invite.organizationTimezone)}` : 'Not issued before approval' },
                    { label: 'Next step', value: invite.nextAction || 'Monitor invite lifecycle' },
                    { label: 'Email', value: invite.visitorEmail ? `${enterpriseStatusLabel(invite.emailStatus || 'Queued')}${invite.emailSentAt ? ` ${formatDateTime(invite.emailSentAt, invite.timezone || invite.organizationTimezone)}` : ''}` : 'No visitor email provided' },
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
                  {canResendVisitorInvite(invite.lifecycleStage || invite.status, invite.visitorEmail, invite.qrIssuedAt, invite.arrivedAt) ? (
                    <PrimaryButton
                      label="Resend invite"
                      onPress={() => void resendInvite(invite)}
                      loading={resendingInviteId === invite.id}
                      disabled={Boolean(resendingInviteId && resendingInviteId !== invite.id)}
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
                  {visitor.rescheduleStatus === 'PENDING' && visitor.pendingScheduledStartTime ? (
                    <View style={styles.scheduleSummary}>
                      <Text style={styles.scheduleSummaryLabel}>Requested timing</Text>
                      <Text style={styles.scheduleSummaryValue}>{formatDateTime(visitor.pendingScheduledStartTime, visitor.pendingScheduledTimezone || visitor.organizationTimezone || visitor.scheduledTimezone)}</Text>
                    </View>
                  ) : null}
                  {visitor.rescheduleStatus === 'PENDING' && visitor.pendingScheduledStartTime ? (
                    <View style={styles.actionRow}>
                      <PrimaryButton
                        label="Approve timing"
                        onPress={() => void approveReschedule(visitor)}
                        loading={approveRescheduleMutation.isPending}
                        tone="secondary"
                      />
                      <PrimaryButton
                        label="Deny timing"
                        onPress={() => setQueueAction({ type: 'reject-reschedule', visitor })}
                        tone="danger"
                      />
                    </View>
                  ) : null}
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
        title="Deny visitor request"
        helperText="Record why the visit should not proceed so the requester and security teams have the right context."
        confirmLabel="Deny request"
        minLength={4}
        loading={rejectMutation.isPending}
        onCancel={() => setQueueAction(null)}
        onConfirm={rejectVisitor}
      />

      <ReasonCaptureModal
        visible={queueAction?.type === 'reject-reschedule'}
        title="Deny timing change"
        helperText="Record why the requested meeting time cannot be accepted. The original approval remains active."
        confirmLabel="Deny timing"
        minLength={4}
        loading={rejectRescheduleMutation.isPending}
        onCancel={() => setQueueAction(null)}
        onConfirm={rejectReschedule}
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

function HistorySegmentRow({
  value,
  onChange,
}: {
  value: (typeof EMPLOYEE_HISTORY_STATUSES)[number]['value'];
  onChange: (value: (typeof EMPLOYEE_HISTORY_STATUSES)[number]['value']) => void;
}) {
  return (
    <View style={styles.segmentRow}>
      {EMPLOYEE_HISTORY_STATUSES.map((option) => (
        <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.segment, value === option.value ? styles.segmentActive : null]}>
          <Text style={[styles.segmentLabel, value === option.value ? styles.segmentLabelActive : null]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function RepeatVisitorInsights({ records }: { records: VisitorRecord[] }) {
  const repeatCount = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((visitor) => {
      const key = visitor.email?.toLowerCase() || visitor.phone || `${visitor.fullName.toLowerCase()}|${visitor.companyName || ''}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.values()].filter((count) => count > 1).length + records.filter((visitor) => visitor.recurringSchedule).length;
  }, [records]);
  const deniedCount = records.filter((visitor) => ['REJECTED', 'SUSPENDED'].includes(String(visitor.status || '').toUpperCase())).length;
  const activeCount = records.filter((visitor) => String(visitor.status || '').toUpperCase() === 'CHECKED_IN').length;

  return (
    <View style={styles.historyInsightRow}>
      <MetricCard label="Repeat visitors" value={repeatCount} tone={repeatCount ? 'info' : 'default'} />
      <MetricCard label="Denied/Suspended" value={deniedCount} tone={deniedCount ? 'danger' : 'default'} />
      <MetricCard label="Checked in" value={activeCount} tone={activeCount ? 'success' : 'default'} />
    </View>
  );
}

function EmployeeVisitorHistoryList({
  records,
  repeatVisitorKeys,
  onReschedule,
}: {
  records: VisitorRecord[];
  repeatVisitorKeys: Map<string, number>;
  onReschedule: (visitor: VisitorRecord) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (!records.length) {
    return <EmptyState title="No visitor history" body="Past, upcoming, repeat, denied, checked-in, and completed host-owned visitor records will appear here." />;
  }
  return (
    <View style={styles.historyList}>
      {records.map((visitor) => {
        const expanded = expandedId === visitor.id;
        const repeatKey = visitor.email?.toLowerCase() || visitor.phone || `${visitor.fullName.toLowerCase()}|${visitor.companyName || ''}`;
        const repeatCount = repeatVisitorKeys.get(repeatKey) ?? 0;
        return (
          <View key={visitor.id} style={styles.historyRow}>
            <Pressable
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => setExpandedId((current) => current === visitor.id ? null : visitor.id)}
              style={({ pressed }) => [styles.historyRowButton, pressed ? styles.rowPressed : null]}
            >
              {visitor.photoUrl ? (
                <Image source={{ uri: visitor.photoUrl }} style={styles.visitorPhoto} />
              ) : (
                <View style={styles.visitorPhotoFallback}>
                  <Text style={styles.visitorPhotoFallbackText}>ID</Text>
                </View>
              )}
              <View style={styles.historyRowCopy}>
                <View style={styles.historyRowTop}>
                  <Text numberOfLines={1} style={styles.historyName}>{visitor.fullName}</Text>
                  <StatusPill label={formatStatusLabel(visitor.status)} tone={visitorTone(visitor.status)} />
                </View>
                <Text numberOfLines={1} style={styles.historyMeta}>
                  {[visitor.companyName || visitor.organizationName || 'Organization pending', visitor.purposeOfVisit || 'Purpose pending'].join(' - ')}
                </Text>
                <Text numberOfLines={1} style={styles.historyMeta}>
                  {[visitScheduleLabel(visitor), visitor.badgeId ? `Badge ${visitor.badgeId}` : 'Badge pending', repeatCount > 1 || visitor.recurringSchedule ? 'Repeat visitor' : null].filter(Boolean).join(' - ')}
                </Text>
              </View>
            </Pressable>
            {expanded ? (
              <View style={styles.historyDetail}>
                <OperationalFieldList
                  items={[
                    { label: 'Approval status', value: formatStatusLabel(visitor.status) },
                    { label: 'Badge status', value: visitor.badgePrintedAt ? `Printed ${formatDateTime(visitor.badgePrintedAt, visitor.organizationTimezone || visitor.scheduledTimezone)}` : visitor.badgeId || 'Pending issue' },
                    { label: 'Check-in/out', value: visitorTimelineLabel(visitor) },
                    { label: 'Organization', value: visitor.companyName || visitor.organizationName || 'Not recorded' },
                    { label: 'Purpose', value: visitor.purposeOfVisit || 'Not recorded' },
                    { label: 'Repeat insight', value: repeatCount > 1 ? `${repeatCount} host-owned visits found` : visitor.recurringSchedule || 'No repeat pattern yet' },
                    { label: 'Reference note', value: visitor.notes || visitor.rejectionReason || visitor.suspensionReason || visitor.revocationReason || 'No notes recorded' },
                  ]}
                />
                <View style={styles.actionRow}>
                  {['APPROVED', 'PENDING', 'CHECKED_IN'].includes(String(visitor.status || '').toUpperCase()) ? (
                    <PrimaryButton label="Adjust timing" onPress={() => onReschedule(visitor)} tone="secondary" />
                  ) : null}
                  <PrimaryButton label="Close reference" onPress={() => setExpandedId(null)} tone="secondary" />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function visitorTimelineLabel(visitor: VisitorRecord) {
  const parts = [
    visitor.checkInTime ? `In ${formatDateTime(visitor.checkInTime, visitor.organizationTimezone || visitor.scheduledTimezone)}` : null,
    visitor.checkOutTime ? `Out ${formatDateTime(visitor.checkOutTime, visitor.organizationTimezone || visitor.scheduledTimezone)}` : null,
  ].filter(Boolean);
  if (parts.length) {
    return parts.join(' - ');
  }
  const latest = [...(visitor.statusHistory ?? [])].reverse().find((entry) => entry.timestamp || entry.action || entry.status);
  if (latest) {
    return [
      latest.action || formatStatusLabel(latest.status),
      latest.timestamp ? formatDateTime(latest.timestamp, visitor.organizationTimezone || visitor.scheduledTimezone) : null,
    ].filter(Boolean).join(' - ');
  }
  return visitor.createdAt ? `Created ${formatDateTime(visitor.createdAt, visitor.organizationTimezone || visitor.scheduledTimezone)}` : 'Timeline not recorded';
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
  historyInsightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  historyList: {
    gap: theme.spacing.sm,
  },
  historyRow: {
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    overflow: 'hidden',
  },
  historyRowButton: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  rowPressed: {
    opacity: 0.82,
  },
  visitorPhoto: {
    width: 52,
    height: 52,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  visitorPhotoFallback: {
    width: 52,
    height: 52,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitorPhotoFallbackText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
  },
  historyRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  historyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  historyName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  historyMeta: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    lineHeight: 17,
  },
  historyDetail: {
    gap: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  segment: {
    minHeight: 38,
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
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '800',
  },
  segmentLabelActive: {
    color: theme.colors.textPrimary,
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
