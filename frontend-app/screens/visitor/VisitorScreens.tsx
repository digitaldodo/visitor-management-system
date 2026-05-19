import { useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
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
import { EmployeeHostSelector } from '../../components/form/EmployeeHostSelector';
import { InternationalPhoneInput } from '../../components/form/InternationalPhoneInput';
import { OrganizationSelector } from '../../components/form/OrganizationSelector';
import { AppScreen } from '../../components/layout/AppScreen';
import { NotificationCenter } from '../../components/notifications/NotificationCenter';
import { PhotoCaptureModal } from '../../components/security/PhotoCaptureModal';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import {
  useRequestVisitorVisitMutation,
  useUploadVisitorVisitPhotoMutation,
  useVisitorHistory,
  useVisitorHosts,
  useVisitorNotifications,
  useVisitorOverview,
  useVisitorPass,
  useVisitorVisits,
} from '../../hooks/useVisitorWorkspace';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { markAllNotificationsRead, markNotificationRead } from '../../services/notificationService';
import { theme } from '../../theme';
import type { HostDirectoryEntry, NotificationRecord, VisitorRecord } from '../../types/domain';
import { formatDateTime } from '../../utils/employeeFormatting';
import { formatVisitorWindow, statusTone, visitorStatusLabel } from '../../utils/securityFormatting';

export function VisitorHomeScreen() {
  const overview = useVisitorOverview();
  const visits = useVisitorVisits();
  const activeVisit = useMemo(() => selectActiveVisit(visits.data ?? []), [visits.data]);

  return (
    <AppScreen
      title="Visitor Home"
      subtitle="Request access, track approval status, and keep your active pass ready for the checkpoint."
      refreshing={overview.isRefetching || visits.isRefetching}
      onRefresh={() => {
        void overview.refetch();
        void visits.refetch();
      }}
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
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const [companyCode, setCompanyCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [purposeOfVisit, setPurposeOfVisit] = useState('');
  const [hostSearch, setHostSearch] = useState('');
  const [selectedHost, setSelectedHost] = useState<HostDirectoryEntry | null>(null);
  const [phoneCountryCode, setPhoneCountryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [photoAsset, setPhotoAsset] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const deferredHostSearch = useDebouncedValue(hostSearch.trim(), 220);
  const hosts = useVisitorHosts(deferredHostSearch, companyCode.trim());
  const requestVisitMutation = useRequestVisitorVisitMutation();
  const uploadPhotoMutation = useUploadVisitorVisitPhotoMutation();

  const submitRequest = async () => {
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

    setFormError(null);
    setSuccessMessage(null);

    try {
      let photoUrl: string | null = null;
      let photoPublicId: string | null = null;
      if (photoAsset) {
        const uploadedPhoto = await uploadPhotoMutation.mutateAsync(photoAsset);
        photoUrl = uploadedPhoto.url;
        photoPublicId = uploadedPhoto.publicId;
      }

      const duration = Number(durationMinutes) || 60;
      const startAt = scheduledStart.trim() ? new Date(scheduledStart.trim()) : null;
      const scheduledStartTime = startAt && !Number.isNaN(startAt.getTime()) ? startAt.toISOString() : null;
      const scheduledEndTime = scheduledStartTime ? new Date(new Date(scheduledStartTime).getTime() + duration * 60_000).toISOString() : null;

      const visit = await requestVisitMutation.mutateAsync({
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
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        photoUrl,
        photoPublicId,
      });

      setSuccessMessage(`${visit.purposeOfVisit || 'Visit request'} submitted. Track approval status from Home or Pass.`);
      setPurposeOfVisit('');
      setHostSearch('');
      setSelectedHost(null);
      setCompanyCode('');
      setCompanyName('');
      setScheduledStart('');
      setDurationMinutes('60');
      setPhotoAsset(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visitor', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['visitor', 'visits'] }),
        queryClient.invalidateQueries({ queryKey: ['visitor', 'history'] }),
      ]);
    } catch (error) {
      Alert.alert('Request failed', error instanceof Error ? error.message : 'Your visit request could not be submitted.');
    }
  };

  return (
    <>
      <AppScreen title="Request Access" subtitle="Submit visitor-owned access requests without entering employee or security workflows.">
        <SurfaceCard title="Visit details" subtitle="Select the host organization only for this access request. Visitor sign-in stays organization-free.">
          <OrganizationSelector
            selectedCode={companyCode}
            selectedName={companyName}
            helperText="Search the organization that owns the host or facility."
            onSelect={(organization) => {
              setCompanyCode(organization.companyCode);
              setCompanyName(organization.companyName);
              setSelectedHost(null);
              setHostSearch('');
            }}
            onClear={() => {
              setCompanyCode('');
              setCompanyName('');
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
              setHostSearch(host.fullName);
            }}
            onClearHost={() => setSelectedHost(null)}
            hosts={hosts.data ?? []}
            loading={hosts.isFetching}
            errorText={hosts.isError ? getErrorMessage(hosts.error, 'Host search failed.') : null}
            onRetry={() => void hosts.refetch()}
            helperText={companyCode ? 'Search employees in the selected organization.' : 'Select an organization first, then search the host.'}
          />
          <View style={[styles.inlineFields, layout.fieldStacked ? styles.inlineFieldsStacked : null]}>
            <View style={styles.inlineFieldWide}>
              <AppTextField label="Arrival time" value={scheduledStart} onChangeText={setScheduledStart} placeholder="2026-05-19T14:30" />
            </View>
            <View style={[styles.inlineField, layout.fieldStacked ? styles.inlineFieldStacked : null]}>
              <AppTextField label="Minutes" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" placeholder="60" />
            </View>
          </View>
          <View style={[styles.photoRow, layout.fieldStacked ? styles.photoRowStacked : null]}>
            {photoAsset ? <Image source={{ uri: photoAsset.uri }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Text style={styles.photoPlaceholderText}>Photo optional</Text></View>}
            <View style={styles.photoMeta}>
              <Text style={styles.panelTitle}>Identity photo</Text>
              <Text style={styles.helperText}>Attach a current photo when the facility requires faster visual verification.</Text>
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
            </View>
          ) : null}
          <PrimaryButton label="Submit access request" onPress={() => void submitRequest()} loading={requestVisitMutation.isPending || uploadPhotoMutation.isPending} />
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
  const pass = useVisitorPass(selectedVisit?.id);

  return (
    <AppScreen
      title="Pass"
      subtitle="Your approved badge and QR stay isolated to the visitor workspace."
      refreshing={visits.isRefetching || pass.isRefetching}
      onRefresh={() => {
        void visits.refetch();
        void pass.refetch();
      }}
    >
      <SurfaceCard title="Current badge" subtitle="Security can scan this QR after approval. Pending or denied requests do not expose valid entry access.">
        {pass.data?.qrImageDataUri ? (
          <View style={styles.qrPanel}>
            <Image source={{ uri: pass.data.qrImageDataUri }} style={styles.qrImage} resizeMode="contain" />
            <StatusPill label={pass.data.valid ? 'Valid pass' : pass.data.statusLabel || 'Not valid'} tone={pass.data.valid ? 'success' : 'warning'} />
          </View>
        ) : selectedVisit ? (
          <EmptyState title="QR pending" body="The QR badge is generated after the visit is approved." />
        ) : (
          <EmptyState title="No pass available" body="Submit an access request first, then approved QR details will appear here." />
        )}
        {pass.data ? (
          <>
            <DetailRow label="Visitor" value={pass.data.fullName || 'Visitor'} />
            <DetailRow label="Badge" value={pass.data.badgeId || 'Pending'} muted={!pass.data.badgeId} />
            <DetailRow label="Organization" value={pass.data.organizationName || pass.data.organizationCode || 'Pending'} muted={!pass.data.organizationName && !pass.data.organizationCode} />
            <DetailRow label="Host" value={pass.data.hostEmployee || 'Pending'} muted={!pass.data.hostEmployee} />
            <DetailRow label="Access window" value={formatPassWindow(pass.data)} />
            <DetailRow label="Expires" value={pass.data.expiresAt ? formatDateTime(pass.data.expiresAt, pass.data.organizationTimezone) : 'Pending'} muted={!pass.data.expiresAt} />
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

export function VisitorNotificationsScreen() {
  const queryClient = useQueryClient();
  const { localNotifications, markLocalNotificationRead } = useOperationalRuntime();
  const notifications = useVisitorNotifications(30);
  const markReadMutation = useMutation({ mutationFn: markNotificationRead });
  const markAllReadMutation = useMutation({ mutationFn: markAllNotificationsRead });

  const visitorLocalNotifications = localNotifications.filter((item) =>
    ['VISITOR', 'SYSTEM'].includes(String(item.category || '').toUpperCase()),
  );

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['visitor', 'notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['visitor', 'overview'] }),
      queryClient.invalidateQueries({ queryKey: ['visitor', 'visits'] }),
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
      subtitle="Visitor approvals, QR state, schedule changes, and runtime notices."
      refreshing={notifications.isRefetching}
      onRefresh={() => {
        void notifications.refetch();
      }}
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
  const { session, logout, isBusy, refreshSession } = useAuth();
  const history = useVisitorHistory();

  return (
    <AppScreen
      title="Profile"
      subtitle="Visitor identity, organization context, notification readiness, and visit history."
      refreshing={history.isRefetching}
      onRefresh={() => {
        void history.refetch();
      }}
    >
      <SurfaceCard title={session?.user.fullName || 'Visitor profile'} subtitle="Identity comes from your verified visitor account.">
        <DetailRow label="Name" value={session?.user.fullName || history.data?.fullName || 'Visitor'} />
        <DetailRow label="Email" value={session?.user.email || 'Verified email pending'} />
        <DetailRow label="Organization" value={session?.user.organizationName || session?.user.organizationCode || history.data?.organizationName || 'Request scoped'} muted={!session?.user.organizationName && !session?.user.organizationCode && !history.data?.organizationName} />
        <DetailRow label="Account role" value="VISITOR" />
        <DetailRow label="Last sync" value={session?.lastSyncedAt ? formatDateTime(session.lastSyncedAt) : 'Unknown'} muted={!session?.lastSyncedAt} />
      </SurfaceCard>

      <SurfaceCard title="Visit history">
        <View style={styles.metricsGrid}>
          <MetricCard label="Total" value={history.data?.totalVisits ?? 0} tone="default" />
          <MetricCard label="Approved" value={history.data?.approvedVisits ?? 0} tone="success" />
          <MetricCard label="Rejected" value={history.data?.rejectedVisits ?? 0} tone={(history.data?.rejectedVisits ?? 0) ? 'danger' : 'default'} />
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
      </SurfaceCard>

      <View style={styles.messageStack}>
        <PrimaryButton label="Refresh session" onPress={() => void refreshSession()} loading={isBusy} />
        <PrimaryButton label="Log out" onPress={() => void logout()} tone="secondary" disabled={isBusy} />
      </View>
    </AppScreen>
  );
}

function selectActiveVisit(visits: VisitorRecord[]) {
  return visits.find((visit) => ['APPROVED', 'CHECKED_IN'].includes(String(visit.status)))
    ?? visits.find((visit) => String(visit.status) === 'PENDING')
    ?? null;
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
  qrImage: {
    width: 220,
    height: 220,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.textInverse,
  },
});
