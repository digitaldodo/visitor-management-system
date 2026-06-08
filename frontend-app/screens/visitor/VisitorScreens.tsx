import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Image, Linking, StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { DetailRow } from '../../components/employee/DetailRow';
import { EmptyState } from '../../components/feedback/EmptyState';
import { useOperationalSnackbar } from '../../components/feedback/OperationalSnackbar';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { ArrivalTimeSelector, nearestArrivalTime } from '../../components/form/ArrivalTimeSelector';
import { EmployeeHostSelector } from '../../components/form/EmployeeHostSelector';
import { InternationalPhoneInput } from '../../components/form/InternationalPhoneInput';
import { OrganizationSelector } from '../../components/form/OrganizationSelector';
import { AppScreen } from '../../components/layout/AppScreen';
import { NotificationCenter } from '../../components/notifications/NotificationCenter';
import { PhotoCaptureModal } from '../../components/security/PhotoCaptureModal';
import { AccountProfileScreen } from '../common/AccountProfileScreen';
import { useOperationalAutocomplete } from '../../hooks/useOperationalAutocomplete';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import {
  useRequestVisitorVisitMutation,
  useUploadVisitorVisitPhotoMutation,
  useVisitorHistory,
  useVisitorInvites,
  useVisitorNotifications,
  useVisitorOverview,
  useVisitorPass,
  useVisitorVisits,
} from '../../hooks/useVisitorWorkspace';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { markAllNotificationsRead, markNotificationRead } from '../../services/notificationService';
import { isTransientVisitorRequestFailure } from '../../services/visitorRequestQueueService';
import { enqueueVisitorRequest } from '../../storage/visitorRequestQueue';
import { getVisitorHosts, type VisitorPass, type VisitorVisitPayload } from '../../services/visitorService';
import { theme } from '../../theme';
import type { HostDirectoryEntry, NotificationRecord, VisitorInviteRecord, VisitorRecord } from '../../types/domain';
import { canonicalVisitorInviteStage, visitorInviteStatusLabel } from '../../types/workflow';
import { formatDateTime } from '../../utils/employeeFormatting';
import { formatVisitorWindow, statusTone, visitorStatusLabel } from '../../utils/securityFormatting';

export function VisitorHomeScreen() {
  const overview = useVisitorOverview();
  const visits = useVisitorVisits();
  const invites = useVisitorInvites();
  const activeVisit = useMemo(() => selectActiveVisit(visits.data ?? []), [visits.data]);
  const pendingInvites = useMemo(() => (invites.data ?? []).filter(isActionableInvite).slice(0, 5), [invites.data]);

  return (
    <AppScreen
      title="Visitor Home"
      subtitle="Request access, track approval status, and keep your active pass ready for the checkpoint."
      refreshing={overview.isRefetching || visits.isRefetching || invites.isRefetching}
      onRefresh={() => Promise.all([overview.refetch(), visits.refetch(), invites.refetch()])}
    >
      <View style={styles.metricsGrid}>
        <MetricCard label="Pending" value={overview.data?.pending ?? 0} tone={(overview.data?.pending ?? 0) ? 'warning' : 'default'} />
        <MetricCard label="Active passes" value={overview.data?.activePasses ?? 0} tone={(overview.data?.activePasses ?? 0) ? 'success' : 'default'} />
        <MetricCard label="Requests" value={overview.data?.totalRequests ?? 0} tone="default" />
      </View>

      <SurfaceCard title="Active access" subtitle="Show this status before entering the facility. QR details are available on the Pass tab.">
        {activeVisit ? (
          <>
            <RecordCard
              title={activeVisit.fullName}
              subtitle={[activeVisit.organizationName, activeVisit.hostEmployee].filter(Boolean).join(' · ')}
              meta={formatVisitorWindow(activeVisit)}
              status={visitorStatusLabel(activeVisit.status)}
              tone={statusTone(activeVisit.status)}
            />
            <DetailRow label="Purpose" value={activeVisit.purposeOfVisit || 'Visit request'} />
            <DetailRow label="Badge" value={activeVisit.badgeId || 'Issued after approval'} muted={!activeVisit.badgeId} />
          </>
        ) : (
          <EmptyState title="No active pass" body="Approved visit passes will appear here when your host or workplace team approves a request." />
        )}
      </SurfaceCard>

      <SurfaceCard title="Invite inbox" subtitle="Pre-registration invites sent to your visitor account. QR access appears only after approval.">
        {pendingInvites.length ? (
          pendingInvites.map((invite) => (
            <View key={invite.id} style={styles.inviteInboxCard}>
              <RecordCard
                title={`${invite.hostEmployeeName || 'Your host'} invited you to ${invite.organizationName || 'AccessFlow'}`}
                subtitle={invite.purposeOfVisit || 'Visitor pre-registration'}
                meta={invite.scheduledStartTime ? formatDateTime(invite.scheduledStartTime, invite.timezone || invite.organizationTimezone) : 'Schedule pending'}
                status={invite.lifecycleLabel || visitorInviteStatusLabel(invite.status)}
                tone={inviteTone(invite)}
              />
              <Text style={styles.helperText}>{invite.nextAction || 'Complete your visitor registration.'}</Text>
              {invite.mobileInviteUrl || invite.inviteUrl ? (
                <PrimaryButton
                  label="Complete pre-registration"
                  onPress={() => void Linking.openURL(String(invite.mobileInviteUrl || invite.inviteUrl))}
                  tone="secondary"
                />
              ) : null}
            </View>
          ))
        ) : (
          <EmptyState title="No pending invites" body="When an employee invites this account, the invite will appear here and in Notifications." />
        )}
      </SurfaceCard>

      <SurfaceCard title="Upcoming and recent visits" subtitle="A focused list of visitor-owned requests only.">
        {(visits.data ?? []).slice(0, 5).map((visit) => (
          <RecordCard
            key={visit.id}
            title={visit.purposeOfVisit || 'Visit request'}
            subtitle={[visit.organizationName, visit.hostEmployee].filter(Boolean).join(' · ') || 'Host pending'}
            meta={formatVisitorWindow(visit)}
            status={visitorStatusLabel(visit.status)}
            tone={statusTone(visit.status)}
          />
        ))}
        {visits.data?.length ? null : <EmptyState title="No requests yet" body="Create your first access request from the Request tab." />}
      </SurfaceCard>
    </AppScreen>
  );
}

export function VisitorRequestScreen() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const { showSnackbar } = useOperationalSnackbar();
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [companyCode, setCompanyCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyTimezone, setCompanyTimezone] = useState(localTimezone);
  const [purposeOfVisit, setPurposeOfVisit] = useState('');
  const [hostSearch, setHostSearch] = useState('');
  const [selectedHost, setSelectedHost] = useState<HostDirectoryEntry | null>(null);
  const [phoneCountryCode, setPhoneCountryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [scheduledStart, setScheduledStart] = useState<Date>(() => nearestArrivalTime());
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [photoAsset, setPhotoAsset] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [calendarEventUrl, setCalendarEventUrl] = useState<string | null>(null);
  const [submissionPending, setSubmissionPending] = useState(false);
  const isSubmittingRef = useRef(false);

  const normalizedHostSearch = hostSearch.trim();
  const searchHosts = useCallback(
    (nextQuery: string, signal: AbortSignal) => getVisitorHosts(nextQuery, companyCode.trim(), signal),
    [companyCode],
  );
  const hostSearchState = useOperationalAutocomplete({
    query: normalizedHostSearch,
    enabled: !selectedHost && Boolean(companyCode.trim()),
    minQueryLength: 2,
    debounceMs: 220,
    search: searchHosts,
  });
  const requestVisitMutation = useRequestVisitorVisitMutation();
  const uploadPhotoMutation = useUploadVisitorVisitPhotoMutation();

  useEffect(() => {
    if (hostSearchState.isError && hostSearchState.error) {
      showSnackbar({ message: 'Unable to load employees', tone: 'danger' });
    }
  }, [hostSearchState.error, hostSearchState.isError, showSnackbar]);

  const submitRequest = async () => {
    if (isSubmittingRef.current) {
      return;
    }

    if (!purposeOfVisit.trim()) {
      setFormError('Enter the purpose of your visit.');
      return;
    }
    if (!phone.trim()) {
      setFormError('Enter a reachable phone number.');
      return;
    }
    if (!companyCode.trim()) {
      setFormError('Select the host organization.');
      return;
    }
    if (!photoAsset) {
      setFormError('Capture or upload a visitor photo before submitting the access request.');
      return;
    }

    setFormError(null);
    setSuccessMessage(null);
    setCalendarEventUrl(null);
    setSubmissionPending(true);
    isSubmittingRef.current = true;
    const clientRequestId = `visitor-request-${Crypto.randomUUID()}`;
    let preparedPayload: VisitorVisitPayload | null = null;

    try {
      const uploadedPhoto = await uploadPhotoMutation.mutateAsync(photoAsset);

      const duration = Number(durationMinutes) || 60;
      const startAt = scheduledStart;
      const endAt = new Date(startAt.getTime() + duration * 60_000);
      const scheduledStartTime = startAt.toISOString();
      const scheduledEndTime = endAt.toISOString();

      const payload: VisitorVisitPayload = {
        clientRequestId,
        phoneCountryCode: phoneCountryCode.trim() || null,
        phone: phone.trim(),
        companyCode: companyCode.trim() || null,
        companyName: companyName.trim() || null,
        purposeOfVisit: purposeOfVisit.trim(),
        hostEmployee: selectedHost?.fullName || hostSearch.trim() || null,
        hostEmployeeId: selectedHost?.id || null,
        scheduledStartTime,
        scheduledEndTime,
        expectedDurationMinutes: duration,
        timezone: companyTimezone || localTimezone,
        photoUrl: uploadedPhoto.url,
        photoPublicId: uploadedPhoto.publicId,
      };
      preparedPayload = payload;

      const visit = await requestVisitMutation.mutateAsync(payload);

      setSuccessMessage(`${visit.purposeOfVisit || 'Visit request'} submitted. Track approval status from Home or Pass.`);
      setCalendarEventUrl(buildGoogleCalendarUrl({
        visitorName: session?.user.fullName || visit.fullName || 'Visitor',
        organizationName: companyName.trim() || visit.organizationName || visit.organizationCode || 'Host organization',
        hostEmployee: selectedHost?.fullName || hostSearch.trim() || visit.hostEmployee || 'Host pending',
        purposeOfVisit: purposeOfVisit.trim(),
        startAt,
        endAt,
        timezone: companyTimezone || localTimezone,
        location: companyName.trim() || visit.organizationName || 'Host facility',
        notes: 'Visitor access request submitted in AccessFlow.',
      }));
      setPurposeOfVisit('');
      setHostSearch('');
      setSelectedHost(null);
      setCompanyCode('');
      setCompanyName('');
      setCompanyTimezone(localTimezone);
      setScheduledStart(nearestArrivalTime());
      setDurationMinutes('60');
      setPhotoAsset(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visitor', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['visitor', 'visits'] }),
        queryClient.invalidateQueries({ queryKey: ['visitor', 'history'] }),
      ]);
    } catch (error) {
      if (isTransientVisitorRequestFailure(error)) {
        const duration = Number(durationMinutes) || 60;
        const startAt = scheduledStart;
        const endAt = new Date(startAt.getTime() + duration * 60_000);
        let queuedPayload = preparedPayload;
        if (!queuedPayload) {
          const queuedPhoto = await uploadPhotoMutation.mutateAsync(photoAsset).catch(() => null);
          queuedPayload = queuedPhoto ? {
            clientRequestId,
            phoneCountryCode: phoneCountryCode.trim() || null,
            phone: phone.trim(),
            companyCode: companyCode.trim() || null,
            companyName: companyName.trim() || null,
            purposeOfVisit: purposeOfVisit.trim(),
            hostEmployee: selectedHost?.fullName || hostSearch.trim() || null,
            hostEmployeeId: selectedHost?.id || null,
            scheduledStartTime: startAt.toISOString(),
            scheduledEndTime: endAt.toISOString(),
            expectedDurationMinutes: duration,
            timezone: companyTimezone || localTimezone,
            photoUrl: queuedPhoto.url,
            photoPublicId: queuedPhoto.publicId,
          } : null;
        }
        if (queuedPayload) {
          await enqueueVisitorRequest(queuedPayload, clientRequestId);
          setSuccessMessage('Request queued for sync. We will retry automatically.');
          showSnackbar({
            message: 'Request queued for sync',
            tone: 'warning',
            dedupeKey: 'visitor-request-queued',
            minIntervalMs: 20_000,
          });
          setPurposeOfVisit('');
          setHostSearch('');
          setSelectedHost(null);
          setCompanyCode('');
          setCompanyName('');
          setCompanyTimezone(localTimezone);
          setScheduledStart(nearestArrivalTime());
          setDurationMinutes('60');
          setPhotoAsset(null);
          return;
        }
      }

      setFormError('Unable to submit request right now. Please try again shortly.');
      showSnackbar({
        message: 'Unable to submit request right now',
        tone: 'danger',
        dedupeKey: 'visitor-request-submit-failed',
        minIntervalMs: 20_000,
      });
    } finally {
      isSubmittingRef.current = false;
      setSubmissionPending(false);
    }
  };

  return (
    <>
      <AppScreen title="Request Visit" subtitle="Choose the place, host, and arrival time. AccessFlow handles the operational details in the background.">
        <SurfaceCard title="Plan your visit" subtitle="Start with the organization name, then choose the host you are meeting.">
          <OrganizationSelector
            selectedCode={companyCode}
            selectedName={companyName}
            helperText="Search the organization or facility name."
            onSelect={(organization) => {
              setCompanyCode(organization.companyCode);
              setCompanyName(organization.companyName);
              setCompanyTimezone(organization.timezone || localTimezone);
              setSelectedHost(null);
              setHostSearch('');
            }}
            onClear={() => {
              setCompanyCode('');
              setCompanyName('');
              setCompanyTimezone(localTimezone);
              setSelectedHost(null);
              setHostSearch('');
            }}
          />
          <AppTextField label="Purpose" value={purposeOfVisit} onChangeText={setPurposeOfVisit} placeholder="Interview, meeting, service visit" returnKeyType="next" />
          <InternationalPhoneInput
            countryCode={phoneCountryCode}
            phone={phone}
            onCountryCodeChange={setPhoneCountryCode}
            onPhoneChange={setPhone}
          />
          <EmployeeHostSelector
            value={hostSearch}
            onChangeText={setHostSearch}
            selectedHost={selectedHost}
            onSelectHost={(host) => {
              setSelectedHost(host);
            }}
            onClearHost={() => {
              setSelectedHost(null);
              setHostSearch('');
            }}
            hosts={hostSearchState.results}
            loading={hostSearchState.isLoading}
            errorText={hostSearchState.isError ? getErrorMessage(hostSearchState.error, 'Unable to load results') : null}
            onRetry={hostSearchState.retry}
            helperText={companyCode ? 'Type at least two letters to find your host.' : 'Select an organization first, then search the host.'}
          />
          <ArrivalTimeSelector
            value={scheduledStart}
            durationMinutes={durationMinutes}
            timezone={companyTimezone || localTimezone}
            onChange={setScheduledStart}
            onDurationChange={setDurationMinutes}
          />
          <View style={[styles.photoRow, layout.fieldStacked ? styles.photoRowStacked : null]}>
            {photoAsset ? <Image source={{ uri: photoAsset.uri }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Text style={styles.photoPlaceholderText}>Photo required</Text></View>}
            <View style={styles.photoMeta}>
              <Text style={styles.panelTitle}>Identity photo</Text>
              <Text style={styles.helperText}>Capture a current face photo so security can visually validate the visitor at check-in.</Text>
              <PrimaryButton label={photoAsset ? 'Retake photo' : 'Capture photo'} onPress={() => setPhotoModalVisible(true)} tone="secondary" />
            </View>
          </View>
          {formError ? (
            <View style={styles.messageStack}>
              <StatusPill label="Check details" tone="danger" />
              <Text style={styles.bodyText}>{formError}</Text>
            </View>
          ) : null}
          {successMessage ? (
            <View style={styles.messageStack}>
              <StatusPill label="Submitted" tone="success" />
              <Text style={styles.bodyText}>{successMessage}</Text>
              {calendarEventUrl ? (
                <PrimaryButton label="Add to Google Calendar" tone="secondary" onPress={() => void Linking.openURL(calendarEventUrl)} />
              ) : null}
            </View>
          ) : null}
          <PrimaryButton
            label="Submit access request"
            onPress={() => void submitRequest()}
            loading={submissionPending || requestVisitMutation.isPending || uploadPhotoMutation.isPending}
            disabled={!photoAsset || submissionPending}
          />
        </SurfaceCard>
      </AppScreen>

      <PhotoCaptureModal
        visible={photoModalVisible}
        title="Capture visitor photo"
        onCancel={() => setPhotoModalVisible(false)}
        onCapture={(asset) => {
          setPhotoAsset(asset);
          setPhotoModalVisible(false);
        }}
      />
    </>
  );
}

export function VisitorPassScreen() {
  const visits = useVisitorVisits();
  const selectedVisit = useMemo(() => selectActiveVisit(visits.data ?? []) ?? (visits.data ?? [])[0] ?? null, [visits.data]);
  const approvedVisit = selectedVisit && ['APPROVED', 'CHECKED_IN'].includes(String(selectedVisit.status)) && selectedVisit.qrIssuedAt ? selectedVisit : null;
  const pass = useVisitorPass(approvedVisit?.id);
  const passCaptureRef = useRef<ViewShot | null>(null);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSharingBadge, setIsSharingBadge] = useState(false);

  const exportPng = async (mode: 'download' | 'share') => {
    if (!passCaptureRef.current) {
      return;
    }
    const setBusy = mode === 'share' ? setIsSharingBadge : setIsExportingPng;
    setBusy(true);
    try {
      const uri = await passCaptureRef.current.capture?.();
      if (!uri) {
        throw new Error('The visitor badge preview could not be rendered.');
      }
      await shareFile(uri, mode === 'share' ? 'Share badge image' : 'Download badge PNG', 'image/png');
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'The visitor badge image could not be exported.');
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async () => {
    if (!pass.data) {
      return;
    }
    setIsExportingPdf(true);
    try {
      const pdf = await Print.printToFileAsync({ html: buildVisitorBadgeHtml(pass.data) });
      await shareFile(pdf.uri, 'Download badge PDF', 'application/pdf');
    } catch (error) {
      Alert.alert('PDF export failed', error instanceof Error ? error.message : 'The visitor badge PDF could not be generated.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <AppScreen
      title="Pass"
      subtitle="Your approved badge and QR stay isolated to the visitor workspace."
      sensitive
      sensitiveReason="visitor-pass"
      refreshing={visits.isRefetching || pass.isRefetching}
      onRefresh={() => Promise.all([visits.refetch(), approvedVisit ? pass.refetch() : Promise.resolve()])}
    >
      <SurfaceCard title="Current badge" subtitle="Security can scan this QR after approval. Pending or denied requests do not expose valid entry access.">
        {pass.data?.qrImageDataUri ? (
          <View style={styles.passExportStack}>
            <ViewShot ref={passCaptureRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }} style={styles.captureShell}>
              <View style={styles.walletBadge}>
                <View style={styles.walletHeader}>
                  <View>
                    <Text style={styles.walletEyebrow}>Approved access badge</Text>
                    <Text style={styles.walletTitle}>{pass.data.organizationName || pass.data.organizationCode || 'AccessFlow'}</Text>
                  </View>
                  <StatusPill label={pass.data.valid ? 'Valid' : pass.data.statusLabel || 'Not valid'} tone={pass.data.valid ? 'success' : 'warning'} />
                </View>
                <Image source={{ uri: pass.data.qrImageDataUri }} style={styles.qrImage} resizeMode="contain" />
                <Text style={styles.helperText}>Expires {pass.data.expiresAt ? formatDateTime(pass.data.expiresAt, pass.data.organizationTimezone) : 'after the approved access window'}</Text>
              </View>
            </ViewShot>
            <View style={styles.passActionGrid}>
              <PrimaryButton label="Download PNG" onPress={() => void exportPng('download')} tone="secondary" loading={isExportingPng} />
              <PrimaryButton label="Secure PDF" onPress={() => void exportPdf()} tone="secondary" loading={isExportingPdf} />
              <PrimaryButton label="Share badge image" onPress={() => void exportPng('share')} tone="secondary" loading={isSharingBadge} />
            </View>
          </View>
        ) : selectedVisit ? (
          <EmptyState
            title={String(selectedVisit.status) === 'PENDING' ? 'Pending approval' : 'QR pending'}
            body={String(selectedVisit.status) === 'PENDING'
              ? 'Your pre-registration is with the host or workplace team. The badge will appear here after approval.'
              : 'The QR badge is generated only after the visit is approved.'}
          />
        ) : (
          <EmptyState title="No pass available" body="Submit an access request first, then approved QR details will appear here." />
        )}
        {pass.data ? (
          <>
            {pass.data.photoUrl ? (
              <View style={styles.passIdentityRow}>
                <Image source={{ uri: pass.data.photoUrl }} style={styles.passPhoto} />
                <View style={styles.passIdentityCopy}>
                  <Text style={styles.panelTitle}>{pass.data.fullName || 'Visitor'}</Text>
                  <Text style={styles.helperText}>Security must match this photo before check-in.</Text>
                </View>
              </View>
            ) : null}
            <DetailRow label="Visitor" value={pass.data.fullName || 'Visitor'} />
            <DetailRow label="Badge" value={pass.data.badgeId || 'Pending'} muted={!pass.data.badgeId} />
            <DetailRow label="Organization" value={pass.data.organizationName || pass.data.organizationCode || 'Pending'} muted={!pass.data.organizationName && !pass.data.organizationCode} />
            <DetailRow label="Host" value={pass.data.hostEmployee || 'Pending'} muted={!pass.data.hostEmployee} />
            <DetailRow label="Access window" value={formatPassWindow(pass.data)} />
            <DetailRow label="Expires" value={pass.data.expiresAt ? formatDateTime(pass.data.expiresAt, pass.data.organizationTimezone) : 'Pending'} muted={!pass.data.expiresAt} />
            <DetailRow label="Guidance" value="Present this badge at reception. Security will verify the live approval record before check-in." />
          </>
        ) : null}
      </SurfaceCard>

      <SurfaceCard title="Approval status">
        {(visits.data ?? []).slice(0, 8).map((visit) => (
          <RecordCard
            key={visit.id}
            title={visit.purposeOfVisit || 'Visit request'}
            subtitle={[visit.organizationName, visit.hostEmployee].filter(Boolean).join(' · ') || 'Approval routing'}
            meta={formatVisitorWindow(visit)}
            status={visitorStatusLabel(visit.status)}
            tone={statusTone(visit.status)}
          />
        ))}
        {visits.data?.length ? null : <EmptyState title="No visit status" body="Visit approvals and badge state will appear here." />}
      </SurfaceCard>
    </AppScreen>
  );
}

async function shareFile(uri: string, dialogTitle: string, mimeType: string) {
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    throw new Error('Native sharing is unavailable on this device.');
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle });
}

function buildVisitorBadgeHtml(pass: VisitorPass) {
  return `
    <html>
      <body style="margin:0;padding:32px;background:#071120;font-family:Arial,sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#0A1628;border:1px solid rgba(79,140,255,0.28);border-radius:24px;padding:28px;color:#F8FAFC;">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
            ${pass.photoUrl ? `<img src="${escapeReportHtml(pass.photoUrl)}" alt="Visitor photo" style="width:72px;height:72px;border-radius:20px;object-fit:cover;" />` : ''}
            <div>
              <div style="font-size:28px;font-weight:800;">${escapeReportHtml(pass.fullName || 'Visitor')}</div>
              <div style="font-size:16px;color:#94A3B8;">${escapeReportHtml(pass.purposeOfVisit || pass.companyName || 'Visitor access')}</div>
              <div style="font-size:12px;letter-spacing:1.1px;text-transform:uppercase;color:#4F8CFF;">${escapeReportHtml(pass.organizationName || pass.organizationCode || 'AccessFlow')}</div>
            </div>
          </div>
          <div style="background:#ffffff;border-radius:20px;padding:20px;text-align:center;margin-bottom:24px;">
            ${pass.qrImageDataUri ? `<img src="${pass.qrImageDataUri}" alt="Visitor QR" style="width:100%;max-width:300px;" />` : ''}
            <div style="margin-top:12px;color:#5a6b7e;font-size:12px;letter-spacing:0.8px;text-transform:uppercase;">Approved visitor badge QR</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;row-gap:14px;column-gap:20px;font-size:14px;">
            <div><strong>Badge ID</strong><br />${escapeReportHtml(pass.badgeId || 'Pending')}</div>
            <div><strong>Status</strong><br />${escapeReportHtml(pass.statusLabel || (pass.valid ? 'Valid' : 'Not valid'))}</div>
            <div><strong>Host</strong><br />${escapeReportHtml(pass.hostEmployee || 'Pending')}</div>
            <div><strong>Pass code</strong><br />${escapeReportHtml(pass.passCode || 'Issued')}</div>
            <div><strong>Issued</strong><br />${escapeReportHtml(pass.issuedAt || 'Recorded')}</div>
            <div><strong>Expires</strong><br />${escapeReportHtml(pass.expiresAt || 'Access window')}</div>
          </div>
          <div style="margin-top:20px;padding:14px;border-radius:14px;background:rgba(59,130,246,0.16);color:#F8FAFC;font-size:13px;line-height:1.45;">
            This export is a timestamped copy. Security should still verify the live AccessFlow approval record at checkpoint scan time.
          </div>
        </div>
      </body>
    </html>
  `;
}

function escapeReportHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function VisitorNotificationsScreen() {
  const queryClient = useQueryClient();
  const { localNotifications, markLocalNotificationRead } = useOperationalRuntime();
  const notifications = useVisitorNotifications(30);
  const markReadMutation = useMutation({ mutationFn: markNotificationRead });
  const markAllReadMutation = useMutation({ mutationFn: markAllNotificationsRead });

  const visitorLocalNotifications = useMemo(
    () => localNotifications.filter((item) =>
      ['VISITOR', 'SYSTEM'].includes(String(item.category || '').toUpperCase()),
    ),
    [localNotifications],
  );

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['visitor', 'notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['visitor', 'overview'] }),
      queryClient.invalidateQueries({ queryKey: ['visitor', 'visits'] }),
      queryClient.invalidateQueries({ queryKey: ['visitor', 'invites'] }),
    ]);
  };

  const markRead = async (notification: NotificationRecord) => {
    if (notification.read) {
      return;
    }
    await markReadMutation.mutateAsync(notification.id);
    await refreshWorkspace();
  };

  return (
    <AppScreen
      title="Notifications"
      subtitle="Visitor approvals, pass changes, schedule updates, and account notices."
      refreshing={notifications.isRefetching}
      onRefresh={() => notifications.refetch()}
    >
      <NotificationCenter
        title="Visitor inbox"
        subtitle="Only visitor-relevant updates are shown here."
        inbox={notifications.data}
        localNotifications={visitorLocalNotifications}
        onMarkRead={markRead}
        onMarkAllRead={async () => {
          await markAllReadMutation.mutateAsync();
          await refreshWorkspace();
        }}
        onMarkLocalRead={markLocalNotificationRead}
        loading={markAllReadMutation.isPending}
      />
    </AppScreen>
  );
}

export function VisitorProfileScreen() {
  const history = useVisitorHistory();
  const visits = useVisitorVisits();
  const visitorSummary = useMemo(() => buildVisitorProfileSummary(visits.data ?? []), [visits.data]);

  return (
    <AccountProfileScreen
      title="Profile"
      subtitle="Visitor identity, personal account settings, pass readiness, and visit history."
      refreshing={history.isRefetching || visits.isRefetching}
      onRefresh={() => Promise.all([history.refetch(), visits.refetch()])}
      visitorSummary={visitorSummary}
      roleSummary={(
        <SurfaceCard title="Visit history" subtitle="Visitor profile data stays scoped to your own requests and active passes.">
          <View style={styles.metricsGrid}>
            <MetricCard label="Total" value={history.data?.totalVisits ?? 0} tone="default" />
            <MetricCard label="Approved" value={history.data?.approvedVisits ?? 0} tone="success" />
            <MetricCard label="Denied" value={history.data?.rejectedVisits ?? 0} tone={(history.data?.rejectedVisits ?? 0) ? 'danger' : 'default'} />
          </View>
          {(history.data?.records ?? []).slice(0, 6).map((visit) => (
            <RecordCard
              key={visit.id}
              title={visit.purposeOfVisit || 'Visit'}
              subtitle={[visit.organizationName, visit.hostEmployee].filter(Boolean).join(' · ')}
              meta={formatVisitorWindow(visit)}
              status={visitorStatusLabel(visit.status)}
              tone={statusTone(visit.status)}
            />
          ))}
          {history.data?.records?.length ? null : <EmptyState title="No visits yet" body="Your completed and requested visits will appear here." />}
        </SurfaceCard>
      )}
    />
  );
}

function selectActiveVisit(visits: VisitorRecord[]) {
  return visits.find((visit) => ['APPROVED', 'CHECKED_IN'].includes(String(visit.status)))
    ?? visits.find((visit) => String(visit.status) === 'PENDING')
    ?? null;
}

function buildVisitorProfileSummary(visits: VisitorRecord[]) {
  const statusVisit = selectActiveVisit(visits)
    ?? visits.find((visit) => !['CHECKED_OUT', 'REJECTED', 'EXPIRED', 'SUSPENDED'].includes(String(visit.status)))
    ?? null;
  const nextVisit = selectNextVisitorVisit(visits);
  const timezone = nextVisit?.organizationTimezone
    || nextVisit?.scheduledTimezone
    || statusVisit?.organizationTimezone
    || statusVisit?.scheduledTimezone
    || Intl.DateTimeFormat().resolvedOptions().timeZone;

  return {
    passStatus: statusVisit ? visitorProfileStatusLabel(statusVisit.status) : 'No active pass',
    nextVisit: nextVisit ? formatDateTime(nextVisit.scheduledStartTime || nextVisit.accessWindowStartTime, timezone) : null,
    timezone,
  };
}

function selectNextVisitorVisit(visits: VisitorRecord[]) {
  const now = Date.now();
  return visits
    .filter((visit) => !['CHECKED_OUT', 'REJECTED', 'EXPIRED', 'SUSPENDED'].includes(String(visit.status)))
    .map((visit) => ({
      visit,
      time: new Date(visit.scheduledStartTime || visit.accessWindowStartTime || visit.createdAt || 0).getTime(),
    }))
    .filter((entry) => Number.isFinite(entry.time) && entry.time >= now)
    .sort((left, right) => left.time - right.time)[0]?.visit ?? null;
}

function visitorProfileStatusLabel(status?: VisitorRecord['status']) {
  return String(status) === 'CHECKED_IN' ? 'Checked-in' : visitorStatusLabel(status);
}

function isActionableInvite(invite: VisitorInviteRecord) {
  const stage = canonicalVisitorInviteStage(invite.lifecycleStage || invite.status, invite.qrIssuedAt, invite.arrivedAt);
  return ['INVITED', 'PRE_REGISTRATION_PENDING'].includes(String(stage));
}

function inviteTone(invite: VisitorInviteRecord): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const stage = canonicalVisitorInviteStage(invite.lifecycleStage || invite.status, invite.qrIssuedAt, invite.arrivedAt);
  if (['BADGE_ISSUED', 'CHECKED_IN', 'CHECKED_OUT'].includes(String(stage))) {
    return 'success';
  }
  if (['EXPIRED', 'REVOKED', 'REJECTED'].includes(String(stage))) {
    return 'danger';
  }
  if (['PENDING_APPROVAL', 'PRE_REGISTERED'].includes(String(stage))) {
    return 'warning';
  }
  return 'info';
}

function formatPassWindow(pass: { accessWindowStartTime?: string | null; scheduledStartTime?: string | null; accessWindowEndTime?: string | null; scheduledEndTime?: string | null; organizationTimezone?: string | null }) {
  const start = pass.accessWindowStartTime || pass.scheduledStartTime;
  const end = pass.accessWindowEndTime || pass.scheduledEndTime;
  if (!start && !end) {
    return 'Pending';
  }
  return [start ? formatDateTime(start, pass.organizationTimezone) : null, end ? formatDateTime(end, pass.organizationTimezone) : null]
    .filter(Boolean)
    .join(' to ');
}

function buildGoogleCalendarUrl({
  visitorName,
  organizationName,
  hostEmployee,
  purposeOfVisit,
  startAt,
  endAt,
  timezone,
  location,
  notes,
}: {
  visitorName: string;
  organizationName: string;
  hostEmployee: string;
  purposeOfVisit: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  location: string;
  notes: string;
}) {
  const title = `AccessFlow visit: ${purposeOfVisit || organizationName}`;
  const details = [
    `Visitor: ${visitorName}`,
    `Organization: ${organizationName}`,
    `Host: ${hostEmployee}`,
    `Meeting time: ${formatDateTime(startAt.toISOString(), timezone)}`,
    `Access window: ${formatDateTime(startAt.toISOString(), timezone)} to ${formatDateTime(endAt.toISOString(), timezone)}`,
    notes,
  ].join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toGoogleCalendarDate(startAt)}/${toGoogleCalendarDate(endAt)}`,
    details,
    location,
    ctz: timezone,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toGoogleCalendarDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  inlineFields: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  inlineFieldsStacked: {
    flexDirection: 'column',
  },
  inlineField: {
    width: 112,
  },
  inlineFieldStacked: {
    width: '100%',
  },
  inlineFieldWide: {
    flex: 1,
  },
  selectedPanel: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    padding: theme.spacing.md,
  },
  resultStack: {
    gap: theme.spacing.sm,
  },
  resultRow: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.md,
  },
  panelTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  photoRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  photoRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  photoPreview: {
    width: 104,
    height: 104,
    borderRadius: 20,
  },
  photoPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  photoPlaceholderText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  photoMeta: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  messageStack: {
    gap: theme.spacing.sm,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  qrPanel: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  inviteInboxCard: {
    gap: theme.spacing.sm,
  },
  walletBadge: {
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    padding: theme.spacing.md,
  },
  captureShell: {
    borderRadius: theme.radii.md,
  },
  passExportStack: {
    gap: theme.spacing.sm,
  },
  passActionGrid: {
    gap: theme.spacing.sm,
  },
  walletHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  walletEyebrow: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  walletTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
    lineHeight: 28,
  },
  qrImage: {
    width: 220,
    height: 220,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.textInverse,
  },
  passIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  passPhoto: {
    width: 82,
    height: 82,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceRaised,
  },
  passIdentityCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
});
