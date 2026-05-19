import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { EmployeeHostSelector } from '../../components/form/EmployeeHostSelector';
import { InternationalPhoneInput } from '../../components/form/InternationalPhoneInput';
import { AppScreen } from '../../components/layout/AppScreen';
import { OperationalFieldList } from '../../components/security/OperationalFieldList';
import { PhotoCaptureModal } from '../../components/security/PhotoCaptureModal';
import { ReasonCaptureModal } from '../../components/security/ReasonCaptureModal';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import {
  useCheckInVisitorMutation,
  useCheckOutVisitorMutation,
  useCreateVisitorMutation,
  useDenyVisitorMutation,
  useEscalateVisitorMutation,
  useOverrideCheckInMutation,
  useReportVisitorMismatchMutation,
  useSecurityHosts,
  useSecurityMonitoring,
  useSecurityVisitors,
  useUploadVisitorPhotoMutation,
} from '../../hooks/useSecurityWorkspace';
import { theme } from '../../theme';
import type { HostDirectoryEntry, VisitorRecord, VisitorType } from '../../types/domain';
import {
  formatDateTime,
  formatVisitorWindow,
  statusTone,
  visitorStatusLabel,
  visitorTypeLabel,
} from '../../utils/securityFormatting';

type VisitorAction =
  | { type: 'override'; visitor: VisitorRecord }
  | { type: 'deny'; visitor: VisitorRecord }
  | { type: 'escalate'; visitor: VisitorRecord }
  | { type: 'mismatch'; visitor: VisitorRecord };

const QUICK_VISITOR_TYPES: { label: string; value: VisitorType }[] = [
  { label: 'Walk-in', value: 'WALK_IN' },
  { label: 'Scheduled', value: 'ONE_TIME' },
  { label: 'Emergency', value: 'EMERGENCY' },
];

const DURATION_OPTIONS = [
  { label: '30 min', value: '30' },
  { label: '1 hour', value: '60' },
  { label: '2 hours', value: '120' },
  { label: '4 hours', value: '240' },
];

export function VisitorsScreen() {
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'CHECKED_IN' | 'REJECTED'>('ALL');
  const [visitorType, setVisitorType] = useState<VisitorType>('WALK_IN');
  const [fullName, setFullName] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [purposeOfVisit, setPurposeOfVisit] = useState('');
  const [hostSearch, setHostSearch] = useState('');
  const [selectedHost, setSelectedHost] = useState<HostDirectoryEntry | null>(null);
  const [scheduledStart, setScheduledStart] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [photoAsset, setPhotoAsset] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
  const [actionState, setActionState] = useState<VisitorAction | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const deferredSearch = useDebouncedValue(search.trim(), 220);
  const normalizedHostSearch = hostSearch.trim();
  const deferredHostSearch = useDebouncedValue(normalizedHostSearch, 220);
  const hostSearchSettling = normalizedHostSearch.length >= 2 && normalizedHostSearch !== deferredHostSearch;
  const hostSearchReady = !selectedHost && deferredHostSearch.length >= 2;

  const monitoring = useSecurityMonitoring(deferredSearch);
  const visitors = useSecurityVisitors(deferredSearch, statusFilter === 'ALL' ? undefined : statusFilter);
  const hosts = useSecurityHosts(selectedHost ? '' : deferredHostSearch);

  const createVisitorMutation = useCreateVisitorMutation();
  const uploadVisitorPhotoMutation = useUploadVisitorPhotoMutation();
  const checkInMutation = useCheckInVisitorMutation();
  const overrideMutation = useOverrideCheckInMutation();
  const checkOutMutation = useCheckOutVisitorMutation();
  const denyMutation = useDenyVisitorMutation();
  const escalateMutation = useEscalateVisitorMutation();
  const mismatchMutation = useReportVisitorMismatchMutation();

  const queueSections = useMemo(() => [
    {
      title: 'Ready arrivals',
      subtitle: 'Approved visitors waiting for fast checkpoint action.',
      records: monitoring.data?.approvedVisitors ?? [],
    },
    {
      title: 'Currently inside',
      subtitle: 'Visitors already on site and visible to security.',
      records: monitoring.data?.currentlyInside ?? [],
    },
    {
      title: 'Exceptions',
      subtitle: 'Overdue, denied, or suspended visitors that need attention.',
      records: [
        ...(monitoring.data?.overdueVisitors ?? []),
        ...(monitoring.data?.rejectedVisitors ?? []),
        ...(monitoring.data?.suspendedVisitors ?? []),
      ],
    },
  ], [monitoring.data]);

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['security', 'monitoring'] }),
      queryClient.invalidateQueries({ queryKey: ['security', 'visitors'] }),
      queryClient.invalidateQueries({ queryKey: ['security', 'overview'] }),
    ]);
  };

  const resetForm = () => {
    setFullName('');
    setPhoneCountryCode('+1');
    setPhone('');
    setEmail('');
    setCompanyName('');
    setPurposeOfVisit('');
    setHostSearch('');
    setSelectedHost(null);
    setScheduledStart('');
    setDurationMinutes('60');
    setPhotoAsset(null);
    setFormError(null);
    setVisitorType('WALK_IN');
  };

  const submitRegistration = async () => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      setFormError('Enter the visitor full name.');
      return;
    }
    if (!phone.trim()) {
      setFormError('Enter a phone number.');
      return;
    }
    if (!purposeOfVisit.trim()) {
      setFormError('Enter the purpose of visit.');
      return;
    }
    if (!selectedHost) {
      setFormError('Select a host employee.');
      return;
    }
    if (visitorType === 'ONE_TIME' && !scheduledStart.trim()) {
      setFormError('Enter the scheduled arrival time.');
      return;
    }
    if (!photoAsset) {
      setFormError('Capture a visitor photo before registration.');
      return;
    }

    setFormError(null);
    const uploadedPhoto = await uploadVisitorPhotoMutation.mutateAsync(photoAsset);
    const payload = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      phoneCountryCode: phoneCountryCode.trim(),
      email: email.trim() || null,
      companyName: companyName.trim() || null,
      purposeOfVisit: purposeOfVisit.trim(),
      hostEmployee: selectedHost.fullName,
      hostEmployeeId: selectedHost.id,
      photoUrl: uploadedPhoto.url,
      photoPublicId: uploadedPhoto.publicId,
      visitorType,
      scheduledStartTime: visitorType === 'ONE_TIME' ? new Date(scheduledStart).toISOString() : null,
      expectedDurationMinutes: visitorType === 'ONE_TIME' ? Number(durationMinutes) : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const visitor = await createVisitorMutation.mutateAsync(payload);
    setActionMessage(
      visitor.status === 'APPROVED'
        ? `${visitor.fullName} is approved and QR-ready for checkpoint processing.`
        : `${visitor.fullName} registered successfully. Approval remains with the backend workflow.`,
    );
    resetForm();
    await refreshWorkspace();
  };

  const executeAction = async (reason: string) => {
    if (!actionState) {
      return;
    }

    switch (actionState.type) {
      case 'override': {
        const visitor = await overrideMutation.mutateAsync({ visitorId: actionState.visitor.id, reason });
        setActionMessage(`Manual override recorded for ${visitor.fullName}.`);
        break;
      }
      case 'deny': {
        const visitor = await denyMutation.mutateAsync({ visitorId: actionState.visitor.id, reason });
        setActionMessage(`Entry denied for ${visitor.fullName}.`);
        break;
      }
      case 'escalate': {
        const visitor = await escalateMutation.mutateAsync({ visitorId: actionState.visitor.id, reason });
        setActionMessage(`Issue escalated for ${visitor.fullName}.`);
        break;
      }
      case 'mismatch': {
        const visitor = await mismatchMutation.mutateAsync({ visitorId: actionState.visitor.id, reason });
        setActionMessage(`Mismatch recorded for ${visitor.fullName}.`);
        break;
      }
    }

    setActionState(null);
    await refreshWorkspace();
  };

  const actionConfig = actionState
    ? {
        override: {
          title: 'Manual visitor override',
          helperText: 'Use this only after you have manually verified the visitor identity and badge context.',
          confirmLabel: 'Record override',
        },
        deny: {
          title: 'Deny visitor entry',
          helperText: 'This denies the visit at the checkpoint and keeps the backend audit trail intact.',
          confirmLabel: 'Deny entry',
        },
        escalate: {
          title: 'Escalate issue',
          helperText: 'Record what needs follow-up from the host, admin, or lead guard.',
          confirmLabel: 'Escalate',
        },
        mismatch: {
          title: 'Report mismatch',
          helperText: 'Record what did not match between the person, the badge, and the approved visitor profile.',
          confirmLabel: 'Report mismatch',
        },
      }[actionState.type]
    : null;

  return (
    <>
      <AppScreen
        title="Visitor Operations"
        subtitle="Fast registration, photo-backed verification, and checkpoint actions for reception and gate teams."
        refreshing={monitoring.isRefetching || visitors.isRefetching}
        onRefresh={() => {
          void monitoring.refetch();
          void visitors.refetch();
        }}
      >
        <SurfaceCard title="Walk-in registration" subtitle="Optimized for front-desk speed with minimal typing and immediate photo capture.">
          <View style={styles.segmentRow}>
            {QUICK_VISITOR_TYPES.map((type) => (
              <Pressable
                key={type.value}
                onPress={() => setVisitorType(type.value)}
                style={[styles.segment, visitorType === type.value ? styles.segmentActive : null]}
              >
                <Text style={[styles.segmentLabel, visitorType === type.value ? styles.segmentLabelActive : null]}>{type.label}</Text>
              </Pressable>
            ))}
          </View>

          <AppTextField label="Visitor name" value={fullName} onChangeText={setFullName} placeholder="Full name" />
          <InternationalPhoneInput
            countryCode={phoneCountryCode}
            phone={phone}
            onCountryCodeChange={setPhoneCountryCode}
            onPhoneChange={setPhone}
          />
          <AppTextField label="Email" value={email} onChangeText={setEmail} placeholder="visitor@company.com" keyboardType="email-address" autoCapitalize="none" />
          <AppTextField label="Organization" value={companyName} onChangeText={setCompanyName} placeholder="Company name" />
          <AppTextField label="Purpose of visit" value={purposeOfVisit} onChangeText={setPurposeOfVisit} placeholder="Meeting, service, delivery, audit" />

          <View style={styles.hostPanel}>
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
              hosts={hostSearchReady && !hostSearchSettling ? hosts.data ?? [] : []}
              loading={!selectedHost && (hostSearchSettling || (hostSearchReady && hosts.isFetching))}
              errorText={hostSearchReady && !hostSearchSettling && hosts.isError ? getErrorMessage(hosts.error, 'Host search failed.') : null}
              onRetry={() => void hosts.refetch()}
              helperText="Search the employee directory so approvals stay connected to the right host."
            />
          </View>

          {visitorType === 'ONE_TIME' ? (
            <>
              <AppTextField
                label="Scheduled arrival"
                value={scheduledStart}
                onChangeText={setScheduledStart}
                placeholder="2026-05-16T14:30"
                helperText="Use the local device time format. Security only captures the arrival slot; the backend enforces the access window."
              />
              <View style={styles.segmentRow}>
                {DURATION_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => setDurationMinutes(option.value)}
                    style={[styles.segment, durationMinutes === option.value ? styles.segmentActive : null]}
                  >
                    <Text style={[styles.segmentLabel, durationMinutes === option.value ? styles.segmentLabelActive : null]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <View style={[styles.photoRow, layout.fieldStacked ? styles.photoRowStacked : null]}>
            {photoAsset ? <Image source={{ uri: photoAsset.uri }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Text style={styles.photoPlaceholderText}>Photo required</Text></View>}
            <View style={styles.photoMeta}>
              <Text style={styles.photoTitle}>Visitor photo</Text>
              <Text style={styles.helperText}>Capture a live identity photo before the badge is issued or the visitor is admitted.</Text>
              <PrimaryButton label={photoAsset ? 'Retake photo' : 'Capture photo'} onPress={() => setPhotoPreviewVisible(true)} tone="secondary" />
            </View>
          </View>

          {formError ? (
            <View style={styles.formError}>
              <StatusPill label="Check details" tone="danger" />
              <Text style={styles.bodyText}>{formError}</Text>
            </View>
          ) : null}

          <PrimaryButton
            label="Register visitor"
            onPress={() => void submitRegistration()}
            loading={createVisitorMutation.isPending || uploadVisitorPhotoMutation.isPending}
            disabled={!photoAsset}
          />
        </SurfaceCard>

        <SurfaceCard title="Checkpoint queue" subtitle="Search across the live queue without opening a dashboard-heavy workspace.">
          <AppTextField
            label="Search queue"
            value={search}
            onChangeText={setSearch}
            placeholder="Search by visitor, company, host, badge, or phone"
          />
          <View style={styles.segmentRow}>
            {['ALL', 'PENDING', 'APPROVED', 'CHECKED_IN', 'REJECTED'].map((status) => (
              <Pressable
                key={status}
                onPress={() => setStatusFilter(status as typeof statusFilter)}
                style={[styles.segment, statusFilter === status ? styles.segmentActive : null]}
              >
                <Text style={[styles.segmentLabel, statusFilter === status ? styles.segmentLabelActive : null]}>{status.replaceAll('_', ' ')}</Text>
              </Pressable>
            ))}
          </View>
        </SurfaceCard>

        {queueSections.map((section) => (
          <SurfaceCard key={section.title} title={section.title} subtitle={section.subtitle}>
            {section.records.length ? (
              section.records.slice(0, 5).map((visitor) => (
                <View key={`${section.title}-${visitor.id}`} style={styles.queueCard}>
                  <View style={styles.identityStrip}>
                    {visitor.photoUrl ? (
                      <Image source={{ uri: visitor.photoUrl }} style={styles.identityPhoto} />
                    ) : (
                      <View style={styles.identityPhotoMissing}>
                        <Text style={styles.identityPhotoMissingText}>Photo missing</Text>
                      </View>
                    )}
                    <View style={styles.identityCopy}>
                      <Text style={styles.identityTitle}>{visitor.fullName}</Text>
                      <Text style={styles.helperText}>Verify this photo before any checkpoint action.</Text>
                    </View>
                  </View>
                  <RecordCard
                    title={visitor.fullName}
                    subtitle={[visitor.companyName, visitor.hostEmployee].filter(Boolean).join(' · ')}
                    meta={[
                      visitor.badgeId ? `Badge ${visitor.badgeId}` : null,
                      visitor.accessWindowStartTime || visitor.scheduledStartTime ? formatVisitorWindow(visitor) : null,
                    ].filter(Boolean).join(' · ')}
                    status={visitorStatusLabel(visitor.status)}
                    tone={statusTone(visitor.status)}
                  />
                  <OperationalFieldList
                    items={[
                      { label: 'Visit type', value: visitorTypeLabel(visitor.visitorType) },
                      { label: 'Access window', value: formatVisitorWindow(visitor) },
                      { label: 'Host', value: visitor.hostEmployee || 'Unassigned' },
                      { label: 'Status', value: visitorStatusLabel(visitor.status) },
                    ]}
                  />
                  <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
                    {visitor.status === 'APPROVED' ? (
                      <PrimaryButton
                        label="Check in"
                        onPress={async () => {
                          const nextVisitor = await checkInMutation.mutateAsync(visitor.id);
                          setActionMessage(`${nextVisitor.fullName} checked in.`);
                          await refreshWorkspace();
                        }}
                        loading={checkInMutation.isPending}
                      />
                    ) : null}
                    {visitor.status === 'CHECKED_IN' ? (
                      <PrimaryButton
                        label="Check out"
                        onPress={async () => {
                          const nextVisitor = await checkOutMutation.mutateAsync(visitor.id);
                          setActionMessage(`${nextVisitor.fullName} checked out.`);
                          await refreshWorkspace();
                        }}
                        loading={checkOutMutation.isPending}
                        tone="secondary"
                      />
                    ) : null}
                    <PrimaryButton label="Override" onPress={() => setActionState({ type: 'override', visitor })} tone="secondary" />
                    <PrimaryButton label="Deny entry" onPress={() => setActionState({ type: 'deny', visitor })} tone="danger" />
                    <PrimaryButton label="Escalate" onPress={() => setActionState({ type: 'escalate', visitor })} tone="secondary" />
                    <PrimaryButton label="Mismatch" onPress={() => setActionState({ type: 'mismatch', visitor })} tone="secondary" />
                  </View>
                </View>
              ))
            ) : (
              <EmptyState title={`No ${section.title.toLowerCase()}`} body="The queue will populate as scans, approvals, and checkpoint decisions flow in from the backend." />
            )}
          </SurfaceCard>
        ))}

        <SurfaceCard title="Recent records" subtitle="Backend-backed visitor records for quick desk visibility.">
          {visitors.data?.items.length ? (
            visitors.data.items.slice(0, 8).map((visitor) => (
              <View key={visitor.id} style={styles.recentRecordRow}>
                {visitor.photoUrl ? <Image source={{ uri: visitor.photoUrl }} style={styles.recentPhoto} /> : <View style={styles.recentPhotoMissing} />}
                <View style={styles.recentRecord}>
                  <RecordCard
                    title={visitor.fullName}
                    subtitle={[visitor.companyName, visitor.organizationName].filter(Boolean).join(' · ')}
                    meta={[
                      visitor.hostEmployee ? `Host: ${visitor.hostEmployee}` : null,
                      visitor.badgeId ? `Badge: ${visitor.badgeId}` : null,
                      visitor.createdAt ? `Created: ${formatDateTime(visitor.createdAt)}` : null,
                    ].filter(Boolean).join(' · ')}
                    status={visitorStatusLabel(visitor.status)}
                    tone={statusTone(visitor.status)}
                  />
                </View>
              </View>
            ))
          ) : (
            <EmptyState title="No visitor activity yet" body="Registered visitors, approvals, and check-ins will appear here." />
          )}
        </SurfaceCard>

        {actionMessage ? (
          <SurfaceCard title="Operational update">
            <StatusPill label="Recorded" tone="success" />
            <Text style={styles.bodyText}>{actionMessage}</Text>
          </SurfaceCard>
        ) : null}
      </AppScreen>

      <PhotoCaptureModal
        visible={photoPreviewVisible}
        title="Capture visitor photo"
        onCancel={() => setPhotoPreviewVisible(false)}
        onCapture={(asset) => {
          setPhotoAsset(asset);
          setPhotoPreviewVisible(false);
        }}
      />

      {actionConfig ? (
        <ReasonCaptureModal
          visible={Boolean(actionState)}
          title={actionConfig.title}
          helperText={actionConfig.helperText}
          confirmLabel={actionConfig.confirmLabel}
          loading={
            overrideMutation.isPending
            || denyMutation.isPending
            || escalateMutation.isPending
            || mismatchMutation.isPending
          }
          onCancel={() => setActionState(null)}
          onConfirm={executeAction}
        />
      ) : null}
    </>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

const styles = StyleSheet.create({
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
    textTransform: 'capitalize',
  },
  segmentLabelActive: {
    color: theme.colors.textPrimary,
  },
  inlineFields: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  inlineFieldsStacked: {
    flexDirection: 'column',
  },
  inlineField: {
    width: 96,
  },
  inlineFieldStacked: {
    width: '100%',
  },
  inlineFieldWide: {
    flex: 1,
  },
  selectedHost: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    padding: theme.spacing.md,
  },
  hostPanel: {
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  panelTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  selectedHostTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  hostResults: {
    gap: theme.spacing.sm,
  },
  hostResult: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.md,
  },
  hostResultTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
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
  photoTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  formError: {
    gap: theme.spacing.sm,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  queueCard: {
    gap: theme.spacing.md,
  },
  identityStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  identityPhoto: {
    width: 76,
    height: 76,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceRaised,
  },
  identityPhotoMissing: {
    width: 76,
    height: 76,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm,
  },
  identityPhotoMissingText: {
    color: theme.colors.danger,
    textAlign: 'center',
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
  },
  identityCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  identityTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  recentRecordRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'stretch',
  },
  recentPhoto: {
    width: 58,
    height: 58,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceRaised,
  },
  recentPhotoMissing: {
    width: 58,
    height: 58,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.dangerSoft,
    backgroundColor: theme.colors.surfaceMuted,
  },
  recentRecord: {
    flex: 1,
  },
  actionGrid: {
    gap: theme.spacing.sm,
  },
  actionGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
