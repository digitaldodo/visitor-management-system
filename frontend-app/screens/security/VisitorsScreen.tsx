import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { useOperationalSnackbar } from '../../components/feedback/OperationalSnackbar';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { EmployeeHostSelector } from '../../components/form/EmployeeHostSelector';
import { InternationalPhoneInput } from '../../components/form/InternationalPhoneInput';
import { AppScreen } from '../../components/layout/AppScreen';
import { OperationalFieldList } from '../../components/security/OperationalFieldList';
import { PhotoCaptureModal } from '../../components/security/PhotoCaptureModal';
import { ReasonCaptureModal } from '../../components/security/ReasonCaptureModal';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useOperationalAutocomplete } from '../../hooks/useOperationalAutocomplete';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import {
  useCheckInVisitorMutation,
  useCheckOutVisitorMutation,
  useCreateVisitorMutation,
  useDenyVisitorMutation,
  useEscalateVisitorMutation,
  useOverrideCheckInMutation,
  useReportVisitorMismatchMutation,
  useSecurityMonitoring,
  useSecurityVisitors,
  useUploadVisitorPhotoMutation,
} from '../../hooks/useSecurityWorkspace';
import { getSecurityHosts } from '../../services/securityService';
import { searchCachedVisitors } from '../../storage/offlineOperationalStore';
import { theme } from '../../theme';
import type { HostDirectoryEntry, SecurityMonitoring, VisitorRecord, VisitorType } from '../../types/domain';
import {
  formatDateTime,
  statusTone,
  visitorStatusLabel,
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
  const navigation = useNavigation<{ navigate: (screen: string, params?: unknown) => void }>();
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const { showSnackbar } = useOperationalSnackbar();
  const runtime = useOperationalRuntime();
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
  const [cachedVisitors, setCachedVisitors] = useState<VisitorRecord[]>([]);

  const deferredSearch = useDebouncedValue(search.trim(), 220);
  const normalizedHostSearch = hostSearch.trim();

  const monitoring = useSecurityMonitoring(deferredSearch);
  const visitors = useSecurityVisitors(deferredSearch, statusFilter === 'ALL' ? undefined : statusFilter);
  const searchHosts = useCallback((nextQuery: string, signal: AbortSignal) => getSecurityHosts(nextQuery, signal), []);
  const hostSearchState = useOperationalAutocomplete({
    query: normalizedHostSearch,
    enabled: !selectedHost,
    minQueryLength: 2,
    debounceMs: 220,
    search: searchHosts,
  });

  const createVisitorMutation = useCreateVisitorMutation();
  const uploadVisitorPhotoMutation = useUploadVisitorPhotoMutation();
  const checkInMutation = useCheckInVisitorMutation();
  const overrideMutation = useOverrideCheckInMutation();
  const checkOutMutation = useCheckOutVisitorMutation();
  const denyMutation = useDenyVisitorMutation();
  const escalateMutation = useEscalateVisitorMutation();
  const mismatchMutation = useReportVisitorMismatchMutation();

  useEffect(() => {
    if (hostSearchState.isError && hostSearchState.error) {
      showSnackbar({ message: 'Search failed. Retry shortly', tone: 'danger' });
    }
  }, [hostSearchState.error, hostSearchState.isError, showSnackbar]);

  useEffect(() => {
    if (runtime.offlineOperationalMode === 'online' && visitors.data?.items.length) {
      setCachedVisitors(visitors.data.items);
      return;
    }

    void searchCachedVisitors(deferredSearch, statusFilter)
      .then(setCachedVisitors)
      .catch(() => setCachedVisitors([]));
  }, [deferredSearch, runtime.offlineOperationalMode, statusFilter, visitors.data?.items]);

  const offlineLookupActive = runtime.offlineOperationalMode !== 'online';
  const visitorItems = offlineLookupActive ? cachedVisitors : visitors.data?.items ?? cachedVisitors;

  const operationalHighlights = useMemo(
    () => buildOperationalHighlights(offlineLookupActive ? undefined : monitoring.data, visitorItems),
    [offlineLookupActive, monitoring.data, visitorItems],
  );

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

  const openVisitorRecord = (visitor: VisitorRecord) => {
    navigation.navigate('VisitorDetail', { visitorId: visitor.id, initialVisitor: visitor });
  };

  const submitRegistration = async () => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      setFormError('Enter the visitor full name.');
      showSnackbar({ message: 'Enter the visitor full name', tone: 'warning' });
      return;
    }
    if (!phone.trim()) {
      setFormError('Enter a phone number.');
      showSnackbar({ message: 'Enter a phone number', tone: 'warning' });
      return;
    }
    if (!purposeOfVisit.trim()) {
      setFormError('Enter the purpose of visit.');
      showSnackbar({ message: 'Enter the purpose of visit', tone: 'warning' });
      return;
    }
    if (!selectedHost) {
      setFormError('Select a host employee.');
      showSnackbar({ message: 'Select a host employee', tone: 'warning' });
      return;
    }
    if (visitorType === 'ONE_TIME' && !scheduledStart.trim()) {
      setFormError('Enter the scheduled arrival time.');
      showSnackbar({ message: 'Enter the scheduled arrival time', tone: 'warning' });
      return;
    }
    if (!photoAsset) {
      setFormError('Capture a visitor photo before registration.');
      showSnackbar({ message: 'Capture a visitor photo before registration', tone: 'warning' });
      return;
    }

    try {
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
      showSnackbar({
        message: visitor.status === 'APPROVED' ? 'Visitor registered successfully. Badge ready' : 'Visitor registered successfully',
        tone: 'success',
      });
      resetForm();
      await refreshWorkspace();
    } catch (error) {
      showSnackbar({ message: getErrorMessage(error, 'Unable to register visitor'), tone: 'danger' });
    }
  };

  const executeAction = async (reason: string) => {
    if (!actionState) {
      return;
    }

    try {
      switch (actionState.type) {
        case 'override': {
          const visitor = await overrideMutation.mutateAsync({ visitorId: actionState.visitor.id, reason });
          showSnackbar({ message: `Manual override recorded for ${visitor.fullName}`, tone: 'success' });
          break;
        }
        case 'deny': {
          const visitor = await denyMutation.mutateAsync({ visitorId: actionState.visitor.id, reason });
          showSnackbar({ message: `Entry denied for ${visitor.fullName}`, tone: 'success' });
          break;
        }
        case 'escalate': {
          const visitor = await escalateMutation.mutateAsync({ visitorId: actionState.visitor.id, reason });
          showSnackbar({ message: `Issue escalated for ${visitor.fullName}`, tone: 'success' });
          break;
        }
        case 'mismatch': {
          const visitor = await mismatchMutation.mutateAsync({ visitorId: actionState.visitor.id, reason });
          showSnackbar({ message: `Mismatch recorded for ${visitor.fullName}`, tone: 'success' });
          break;
        }
      }

      setActionState(null);
      await refreshWorkspace();
    } catch (error) {
      showSnackbar({ message: getErrorMessage(error, 'Unable to complete action'), tone: 'danger' });
    }
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
        sensitive
        sensitiveReason="visitor-operations"
        refreshing={monitoring.isRefetching || visitors.isRefetching}
        onRefresh={() => Promise.all([monitoring.refetch(), visitors.refetch()])}
      >
        <SurfaceCard
          title="Walk-in registration"
          subtitle={offlineLookupActive
            ? 'Registration requires connectivity so identity photos, host assignment, and badge creation stay backend-verified.'
            : 'Optimized for front-desk speed with minimal typing and immediate photo capture.'}
        >
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
              hosts={hostSearchState.results}
              loading={hostSearchState.isLoading}
              errorText={hostSearchState.isError ? getErrorMessage(hostSearchState.error, 'Unable to load results') : null}
              onRetry={hostSearchState.retry}
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
            label={offlineLookupActive ? 'Registration requires connectivity' : 'Register visitor'}
            onPress={() => void submitRegistration()}
            loading={createVisitorMutation.isPending || uploadVisitorPhotoMutation.isPending}
            disabled={!photoAsset || offlineLookupActive}
          />
        </SurfaceCard>

        <SurfaceCard
          title="Checkpoint queue"
          subtitle={offlineLookupActive
            ? `Offline lookup from cached records only. Last sync: ${runtime.offlineLastSyncAt ? new Date(runtime.offlineLastSyncAt).toLocaleString() : 'not available'}.`
            : 'Search across the live queue without opening a dashboard-heavy workspace.'}
        >
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

        <SurfaceCard title="Operational highlights" subtitle="Only the top three priority visitors are expanded for fast guard action.">
          {operationalHighlights.length ? (
            operationalHighlights.map((visitor) => (
              <View key={`highlight-${visitor.id}`} style={styles.queueCard}>
                <OperationalHighlightCard
                  visitor={visitor}
                  onPress={() => openVisitorRecord(visitor)}
                  onLongPress={() => showSnackbar({ message: 'Open Record for full history and badge actions', tone: 'info' })}
                />
                <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
                  {!offlineLookupActive && visitor.status === 'APPROVED' ? (
                    <PrimaryButton
                      label="Check in"
                      onPress={async () => {
                        try {
                          const nextVisitor = await checkInMutation.mutateAsync(visitor.id);
                          showSnackbar({ message: `${nextVisitor.fullName} checked in`, tone: 'success' });
                          await refreshWorkspace();
                        } catch (error) {
                          showSnackbar({ message: getErrorMessage(error, 'Unable to check in visitor'), tone: 'danger' });
                        }
                      }}
                      loading={checkInMutation.isPending}
                    />
                  ) : null}
                  {!offlineLookupActive && visitor.status === 'CHECKED_IN' ? (
                    <PrimaryButton
                      label="Check out"
                      onPress={async () => {
                        try {
                          const nextVisitor = await checkOutMutation.mutateAsync(visitor.id);
                          showSnackbar({ message: `${nextVisitor.fullName} checked out`, tone: 'success' });
                          await refreshWorkspace();
                        } catch (error) {
                          showSnackbar({ message: getErrorMessage(error, 'Unable to check out visitor'), tone: 'danger' });
                        }
                      }}
                      loading={checkOutMutation.isPending}
                      tone="secondary"
                    />
                  ) : null}
                  {!offlineLookupActive ? (
                    <>
                      <PrimaryButton label="Override" onPress={() => setActionState({ type: 'override', visitor })} tone="secondary" />
                      <PrimaryButton label="Deny entry" onPress={() => setActionState({ type: 'deny', visitor })} tone="danger" />
                      <PrimaryButton label="Escalate" onPress={() => setActionState({ type: 'escalate', visitor })} tone="secondary" />
                    </>
                  ) : (
                    <PrimaryButton label="Open cached record" onPress={() => openVisitorRecord(visitor)} tone="secondary" />
                  )}
                </View>
              </View>
            ))
          ) : (
            <EmptyState title="No priority visitors" body="Inside visitors, latest check-ins, latest check-outs, denials, and suspended records appear here." />
          )}
        </SurfaceCard>

        <SurfaceCard title="Recent records" subtitle="Compact visitor history for fast scanning. Tap a row to open the full operational record.">
          {visitorItems.length ? (
            <View style={styles.compactList}>
              {visitorItems.slice(0, 12).map((visitor) => (
                <VisitorCompactRow
                  key={visitor.id}
                  visitor={visitor}
                  onPress={() => openVisitorRecord(visitor)}
                  onLongPress={() => showSnackbar({ message: 'Operational menu is available in Open Record', tone: 'info' })}
                />
              ))}
            </View>
          ) : (
            <EmptyState title="No visitor activity yet" body="Registered visitors, approvals, and check-ins will appear here." />
          )}
        </SurfaceCard>
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

function OperationalHighlightCard({
  visitor,
  onPress,
  onLongPress,
}: {
  visitor: VisitorRecord;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: theme.colors.primarySoft }}
      style={({ pressed }) => [styles.highlightCard, pressed ? styles.pressed : null]}
    >
      {visitor.photoUrl ? (
        <Image source={{ uri: visitor.photoUrl }} style={styles.highlightPhoto} />
      ) : (
        <View style={styles.highlightPhotoMissing}>
          <Text style={styles.photoMissingText}>No photo</Text>
        </View>
      )}
      <View style={styles.highlightCopy}>
        <View style={styles.rowTitleLine}>
          <Text maxFontSizeMultiplier={1.08} numberOfLines={1} style={styles.rowName}>{visitor.fullName}</Text>
          <StatusPill label={visitorStatusLabel(visitor.status)} tone={statusTone(visitor.status)} />
        </View>
        <Text maxFontSizeMultiplier={1.06} numberOfLines={1} style={styles.rowMeta}>
          {[visitor.companyName || visitor.organizationName, visitor.hostEmployee ? `Host ${visitor.hostEmployee}` : null].filter(Boolean).join(' - ') || 'Visitor record'}
        </Text>
        <Text maxFontSizeMultiplier={1.06} numberOfLines={1} style={styles.rowMeta}>
          {highlightReason(visitor)} - {latestTimestamp(visitor)}
        </Text>
      </View>
    </Pressable>
  );
}

function VisitorCompactRow({
  visitor,
  onPress,
  onLongPress,
}: {
  visitor: VisitorRecord;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: theme.colors.primarySoft }}
      style={({ pressed }) => [styles.compactRow, pressed ? styles.pressed : null]}
    >
      {visitor.photoUrl ? <Image source={{ uri: visitor.photoUrl }} style={styles.rowPhoto} /> : <View style={styles.rowPhotoMissing} />}
      <View style={styles.compactCopy}>
        <View style={styles.rowTitleLine}>
          <Text maxFontSizeMultiplier={1.08} numberOfLines={1} style={styles.rowName}>{visitor.fullName}</Text>
          <StatusPill label={visitorStatusLabel(visitor.status)} tone={statusTone(visitor.status)} />
        </View>
        <Text maxFontSizeMultiplier={1.04} numberOfLines={1} style={styles.rowMeta}>
          {[visitor.companyName || visitor.organizationName || 'Organization not recorded', visitor.hostEmployee || 'Host unassigned'].join(' - ')}
        </Text>
        <Text maxFontSizeMultiplier={1.04} numberOfLines={1} style={styles.rowMeta}>
          {visitorStatusLabel(visitor.status)} - {latestTimestamp(visitor)}
        </Text>
      </View>
    </Pressable>
  );
}

function buildOperationalHighlights(monitoring?: SecurityMonitoring, visitorItems: VisitorRecord[] = []) {
  const ordered = [
    ...(monitoring?.suspendedVisitors ?? []),
    ...(monitoring?.rejectedVisitors ?? []),
    ...(monitoring?.overdueVisitors ?? []),
    ...(monitoring?.currentlyInside ?? []),
    ...(monitoring?.checkedOutVisitors ?? []),
    ...(monitoring?.approvedVisitors ?? []),
    ...visitorItems.filter((visitor) => ['CHECKED_IN', 'CHECKED_OUT', 'APPROVED'].includes(String(visitor.status || ''))),
  ];
  const seen = new Set<string>();
  return ordered.filter((visitor) => {
    if (!visitor.id || seen.has(visitor.id)) {
      return false;
    }
    seen.add(visitor.id);
    return true;
  }).slice(0, 3);
}

function highlightReason(visitor: VisitorRecord) {
  if (visitor.status === 'SUSPENDED') {
    return 'Suspension flag';
  }
  if (visitor.status === 'REJECTED') {
    return 'Denied entry';
  }
  if (visitor.status === 'CHECKED_IN') {
    return 'Currently inside';
  }
  if (visitor.status === 'CHECKED_OUT') {
    return 'Latest check-out';
  }
  if (visitor.status === 'APPROVED') {
    return 'Ready arrival';
  }
  return visitorStatusLabel(visitor.status);
}

function latestTimestamp(visitor: VisitorRecord) {
  return formatDateTime(visitor.checkOutTime || visitor.checkInTime || visitor.approvedAt || visitor.updatedAt || visitor.createdAt);
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
  highlightCard: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  highlightPhoto: {
    width: 66,
    height: 66,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceRaised,
  },
  highlightPhotoMissing: {
    width: 66,
    height: 66,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xs,
  },
  photoMissingText: {
    color: theme.colors.danger,
    textAlign: 'center',
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
  },
  highlightCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  compactList: {
    gap: 1,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  compactRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  pressed: {
    opacity: 0.82,
  },
  rowPhoto: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceRaised,
  },
  rowPhotoMissing: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
  },
  compactCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  rowName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  rowMeta: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.body.fontWeight,
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
