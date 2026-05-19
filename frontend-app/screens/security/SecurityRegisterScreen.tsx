import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { AppScreen } from '../../components/layout/AppScreen';
import { OperationalFieldList } from '../../components/security/OperationalFieldList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import {
  useReactivateVisitorMutation,
  useSecurityAttendance,
  useSecurityVisitorPass,
  useSecurityVisitors,
} from '../../hooks/useSecurityWorkspace';
import { theme } from '../../theme';
import type { EmployeeAttendanceRecord, VisitorRecord, VisitorStatus } from '../../types/domain';
import {
  employeePresenceLabel,
  formatDateTime,
  formatVisitorWindow,
  statusTone,
  visitorStatusLabel,
  visitorTypeLabel,
} from '../../utils/securityFormatting';

type RegisterKind = 'ALL' | 'VISITORS' | 'WORKFORCE';
type DateWindow = 'ALL' | 'TODAY' | '7D' | '30D';
type RegisterStatus = 'ALL' | VisitorStatus;

const VISITOR_PAGE_SIZE = 30;
const KIND_OPTIONS: { label: string; value: RegisterKind }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Visitors', value: 'VISITORS' },
  { label: 'Workforce', value: 'WORKFORCE' },
];
const STATUS_OPTIONS: { label: string; value: RegisterStatus }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Inside', value: 'CHECKED_IN' },
  { label: 'Checked out', value: 'CHECKED_OUT' },
  { label: 'Denied', value: 'REJECTED' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Suspended', value: 'SUSPENDED' },
];
const DATE_OPTIONS: { label: string; value: DateWindow }[] = [
  { label: 'All dates', value: 'ALL' },
  { label: 'Today', value: 'TODAY' },
  { label: '7 days', value: '7D' },
  { label: '30 days', value: '30D' },
];

export function SecurityRegisterScreen() {
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<RegisterKind>('ALL');
  const [status, setStatus] = useState<RegisterStatus>('ALL');
  const [dateWindow, setDateWindow] = useState<DateWindow>('30D');
  const [page, setPage] = useState(0);
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorRecord | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<EmployeeAttendanceRecord | null>(null);
  const [badgeVisitorId, setBadgeVisitorId] = useState<string | null>(null);
  const [referenceVisitor, setReferenceVisitor] = useState<VisitorRecord | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const deferredSearch = useDebouncedValue(search.trim(), 220);
  const dateRange = useMemo(() => buildDateRange(dateWindow), [dateWindow]);
  const visitors = useSecurityVisitors(
    kind === 'WORKFORCE' ? '' : deferredSearch,
    status === 'ALL' ? undefined : status,
    page,
    VISITOR_PAGE_SIZE,
    dateRange.from,
    dateRange.to,
  );
  const attendance = useSecurityAttendance();
  const visitorPass = useSecurityVisitorPass(badgeVisitorId);
  const reactivateMutation = useReactivateVisitorMutation();

  const filteredAttendance = useMemo(() => {
    const query = deferredSearch.toLowerCase();
    return (attendance.data ?? [])
      .filter((entry) => matchesAttendanceSearch(entry, query))
      .filter((entry) => matchesAttendanceDate(entry, dateRange.from, dateRange.to))
      .slice(0, 40);
  }, [attendance.data, dateRange.from, dateRange.to, deferredSearch]);

  const visitorItems = kind === 'WORKFORCE' ? [] : visitors.data?.items ?? [];
  const attendanceItems = kind === 'VISITORS' ? [] : filteredAttendance;
  const isRefreshing = visitors.isRefetching || attendance.isRefetching || visitorPass.isRefetching;

  const selectVisitor = (visitor: VisitorRecord) => {
    setSelectedVisitor(visitor);
    setSelectedAttendance(null);
  };

  const selectAttendance = (entry: EmployeeAttendanceRecord) => {
    setSelectedAttendance(entry);
    setSelectedVisitor(null);
    setBadgeVisitorId(null);
  };

  const refreshRegister = async () => {
    await Promise.all([
      visitors.refetch(),
      attendance.refetch(),
      queryClient.invalidateQueries({ queryKey: ['security', 'monitoring'] }),
    ]);
  };

  const reactivateRecurring = async (visitor: VisitorRecord) => {
    const updated = await reactivateMutation.mutateAsync(visitor.id);
    setSelectedVisitor(updated);
    setActionMessage(`${updated.fullName} was reactivated with backend audit history preserved.`);
    await refreshRegister();
  };

  return (
    <AppScreen
      title="Security Register"
      subtitle="Searchable gate register for previous visitors, workforce presence, denied entries, expired visits, and badge audit reference."
      refreshing={isRefreshing}
      onRefresh={() => {
        void refreshRegister();
      }}
    >
      <SurfaceCard title="Operational lookup" subtitle="Search by person, organization, phone, badge ID, QR payload, access state, or host.">
        <AppTextField
          label="Search register"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setPage(0);
          }}
          placeholder="Name, phone, organization, badge, QR, host, employee ID"
        />
        <SegmentRow
          options={KIND_OPTIONS}
          value={kind}
          onChange={(value) => {
            setKind(value);
            setPage(0);
          }}
        />
        <SegmentRow
          options={STATUS_OPTIONS}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(0);
          }}
        />
        <SegmentRow
          options={DATE_OPTIONS}
          value={dateWindow}
          onChange={(value) => {
            setDateWindow(value);
            setPage(0);
          }}
        />
        <OperationalFieldList
          items={[
            { label: 'Visitor records', value: String(visitors.data?.totalItems ?? visitorItems.length) },
            { label: 'Workforce logs', value: String(attendanceItems.length) },
            { label: 'Register mode', value: kind.toLowerCase() },
            { label: 'Date window', value: dateWindowLabel(dateWindow) },
          ]}
        />
      </SurfaceCard>

      {referenceVisitor ? (
        <SurfaceCard title="Reference approval" subtitle="Pinned for visual comparison and recurring-visit context. No historical values are modified here.">
          <VisitorIdentityHeader visitor={referenceVisitor} />
          <OperationalFieldList
            items={[
              { label: 'Previous approval', value: referenceVisitor.approvedAt ? formatDateTime(referenceVisitor.approvedAt) : visitorStatusLabel(referenceVisitor.status) },
              { label: 'Host', value: referenceVisitor.hostEmployee || 'Unassigned' },
              { label: 'Organization', value: referenceVisitor.organizationName || referenceVisitor.companyName || 'Not recorded' },
              { label: 'Badge', value: referenceVisitor.badgeId || 'Not issued' },
            ]}
          />
          <PrimaryButton label="Clear reference" onPress={() => setReferenceVisitor(null)} tone="secondary" />
        </SurfaceCard>
      ) : null}

      {selectedVisitor ? (
        <SurfaceCard title="Visitor record detail" subtitle="Audit-safe reference view for guard validation and previous approvals.">
          <VisitorIdentityHeader visitor={selectedVisitor} />
          <OperationalFieldList
            items={[
              { label: 'Host employee', value: selectedVisitor.hostEmployee || 'Unassigned' },
              { label: 'Organization', value: selectedVisitor.organizationName || selectedVisitor.companyName || 'Not recorded' },
              { label: 'Phone', value: [selectedVisitor.phoneCountryCode, selectedVisitor.phone].filter(Boolean).join(' ') || 'Not recorded' },
              { label: 'Purpose', value: selectedVisitor.purposeOfVisit || 'Not recorded' },
              { label: 'Arrival/check-in', value: selectedVisitor.checkInTime ? formatDateTime(selectedVisitor.checkInTime) : formatVisitorWindow(selectedVisitor) },
              { label: 'Check-out', value: selectedVisitor.checkOutTime ? formatDateTime(selectedVisitor.checkOutTime) : 'Not checked out' },
              { label: 'Approval status', value: visitorStatusLabel(selectedVisitor.status) },
              { label: 'Security notes', value: latestSecurityNote(selectedVisitor) || 'No security note recorded' },
            ]}
          />
          <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
            <PrimaryButton label="View badge" onPress={() => setBadgeVisitorId(selectedVisitor.id)} tone="secondary" />
            <PrimaryButton label="Reference approval" onPress={() => setReferenceVisitor(selectedVisitor)} tone="secondary" />
            {canReactivate(selectedVisitor) ? (
              <PrimaryButton
                label="Re-initiate recurring"
                onPress={() => void reactivateRecurring(selectedVisitor)}
                tone="secondary"
                loading={reactivateMutation.isPending}
              />
            ) : null}
            <PrimaryButton label="Close details" onPress={() => setSelectedVisitor(null)} tone="secondary" />
          </View>
          <StatusTimeline visitor={selectedVisitor} />
        </SurfaceCard>
      ) : null}

      {badgeVisitorId ? (
        <SurfaceCard title="Badge reference" subtitle="Read-only badge preview for visual verification. Backend pass rules still control validity.">
          {visitorPass.data ? (
            <>
              <VisitorBadgePreview visitor={selectedVisitor} pass={visitorPass.data} />
              <OperationalFieldList
                items={[
                  { label: 'Badge ID', value: visitorPass.data.badgeId || 'Not issued' },
                  { label: 'Check-in state', value: visitorPass.data.checkInState || visitorStatusLabel(visitorPass.data.status) },
                  { label: 'Valid', value: visitorPass.data.valid ? 'Yes' : 'No' },
                  { label: 'Expires', value: visitorPass.data.expiresAt ? formatDateTime(visitorPass.data.expiresAt) : 'Pending' },
                ]}
              />
              <PrimaryButton label="Hide badge" onPress={() => setBadgeVisitorId(null)} tone="secondary" />
            </>
          ) : visitorPass.isError ? (
            <View style={styles.messageStack}>
              <StatusPill label="Badge unavailable" tone="warning" />
              <Text style={styles.bodyText}>{getErrorMessage(visitorPass.error, 'Badge details could not be loaded for this record.')}</Text>
              <PrimaryButton label="Hide badge" onPress={() => setBadgeVisitorId(null)} tone="secondary" />
            </View>
          ) : (
            <View style={styles.messageStack}>
              <StatusPill label="Loading badge" tone="info" />
              <Text style={styles.bodyText}>Loading the backend badge reference...</Text>
            </View>
          )}
        </SurfaceCard>
      ) : null}

      {selectedAttendance ? (
        <SurfaceCard title="Workforce entry detail" subtitle="Read-only workforce register event for guard reference.">
          <RecordCard
            title={selectedAttendance.employeeName}
            subtitle={[selectedAttendance.department, selectedAttendance.designation].filter(Boolean).join(' · ')}
            meta={[selectedAttendance.employeeId ? `ID ${selectedAttendance.employeeId}` : null, selectedAttendance.organizationName].filter(Boolean).join(' · ')}
            status={employeePresenceLabel(selectedAttendance)}
            tone={statusTone(selectedAttendance.status)}
          />
          <OperationalFieldList
            items={[
              { label: 'Check-in', value: selectedAttendance.checkInTime ? formatDateTime(selectedAttendance.checkInTime) : 'Not checked in' },
              { label: 'Check-out', value: selectedAttendance.checkOutTime ? formatDateTime(selectedAttendance.checkOutTime) : 'Not checked out' },
              { label: 'Guard assist', value: selectedAttendance.securityGuardName || 'Static QR/self-service' },
              { label: 'Override note', value: selectedAttendance.overrideReason || 'No override note' },
              { label: 'Shift', value: [selectedAttendance.shiftName, selectedAttendance.shiftStartTime, selectedAttendance.shiftEndTime].filter(Boolean).join(' · ') || 'Not assigned' },
              { label: 'Record state', value: selectedAttendance.state || selectedAttendance.status || 'Recorded' },
            ]}
          />
          <PrimaryButton label="Close details" onPress={() => setSelectedAttendance(null)} tone="secondary" />
        </SurfaceCard>
      ) : null}

      <SurfaceCard title="Visitor history" subtitle="Paged visitor register records with visual identity and badge status.">
        {visitorItems.length ? (
          <>
            {visitorItems.map((visitor) => (
              <View key={visitor.id} style={styles.registerCard}>
                <VisitorIdentityHeader visitor={visitor} compact />
                <OperationalFieldList
                  items={[
                    { label: 'Window', value: formatVisitorWindow(visitor) },
                    { label: 'Host', value: visitor.hostEmployee || 'Unassigned' },
                    { label: 'Badge / QR', value: visitor.badgeId || (visitor.qrCode ? 'QR issued' : 'Not issued') },
                    { label: 'Created', value: visitor.createdAt ? formatDateTime(visitor.createdAt) : 'Unknown' },
                  ]}
                />
                <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
                  <PrimaryButton label="Open details" onPress={() => selectVisitor(visitor)} tone="secondary" />
                  <PrimaryButton
                    label="View badge"
                    onPress={() => {
                      selectVisitor(visitor);
                      setBadgeVisitorId(visitor.id);
                    }}
                    tone="secondary"
                  />
                  <PrimaryButton label="Reference" onPress={() => setReferenceVisitor(visitor)} tone="secondary" />
                </View>
              </View>
            ))}
            <View style={[styles.paginationRow, layout.fieldStacked ? styles.paginationStacked : null]}>
              <PrimaryButton label="Newer" onPress={() => setPage((current) => Math.max(0, current - 1))} tone="secondary" disabled={page === 0} />
              <Text style={styles.pageText}>Page {page + 1} of {Math.max(visitors.data?.totalPages ?? 1, 1)}</Text>
              <PrimaryButton label="Older" onPress={() => setPage((current) => current + 1)} tone="secondary" disabled={Boolean(visitors.data?.last)} />
            </View>
          </>
        ) : (
          <EmptyState title="No visitor records" body="Visitor register results will appear when the current filters match historical access records." />
        )}
      </SurfaceCard>

      <SurfaceCard title="Workforce entries" subtitle="Recent employee and workforce check-ins for gate-register reference.">
        {attendanceItems.length ? (
          attendanceItems.map((entry) => (
            <View key={entry.id} style={styles.registerCard}>
              <RecordCard
                title={entry.employeeName}
                subtitle={[entry.department, entry.designation, entry.organizationName].filter(Boolean).join(' · ')}
                meta={[
                  entry.employeeId ? `ID ${entry.employeeId}` : null,
                  entry.checkInTime ? `In: ${formatDateTime(entry.checkInTime)}` : null,
                  entry.checkOutTime ? `Out: ${formatDateTime(entry.checkOutTime)}` : null,
                ].filter(Boolean).join(' · ')}
                status={employeePresenceLabel(entry)}
                tone={statusTone(entry.status)}
              />
              <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
                <PrimaryButton label="Open details" onPress={() => selectAttendance(entry)} tone="secondary" />
                <PrimaryButton
                  label="Verify previous"
                  onPress={() => {
                    selectAttendance(entry);
                    setActionMessage(`${entry.employeeName} previous workforce access is open for guard reference.`);
                  }}
                  tone="secondary"
                />
              </View>
            </View>
          ))
        ) : (
          <EmptyState title="No workforce entries" body="Workforce check-in and check-out events will appear after guard scans or assisted actions." />
        )}
      </SurfaceCard>

      {actionMessage ? (
        <SurfaceCard title="Register update">
          <StatusPill label="Recorded" tone="success" />
          <Text style={styles.bodyText}>{actionMessage}</Text>
        </SurfaceCard>
      ) : null}
    </AppScreen>
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
        <Pressable
          key={option.value}
          accessibilityRole="button"
          onPress={() => onChange(option.value)}
          style={[styles.segment, value === option.value ? styles.segmentActive : null]}
        >
          <Text style={[styles.segmentLabel, value === option.value ? styles.segmentLabelActive : null]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function VisitorIdentityHeader({ visitor, compact = false }: { visitor: VisitorRecord; compact?: boolean }) {
  return (
    <View style={[styles.identityRow, compact ? styles.identityRowCompact : null]}>
      {visitor.photoUrl ? (
        <Image source={{ uri: visitor.photoUrl }} style={[styles.identityPhoto, compact ? styles.identityPhotoCompact : null]} />
      ) : (
        <View style={[styles.identityPhotoFallback, compact ? styles.identityPhotoCompact : null]}>
          <Text style={styles.identityPhotoFallbackText}>No photo</Text>
        </View>
      )}
      <View style={styles.identityCopy}>
        <View style={styles.identityTitleRow}>
          <Text maxFontSizeMultiplier={1.1} style={styles.identityName}>{visitor.fullName}</Text>
          <StatusPill label={visitorStatusLabel(visitor.status)} tone={statusTone(visitor.status)} />
        </View>
        <Text maxFontSizeMultiplier={1.08} style={styles.identityMeta}>
          {[visitor.companyName || visitor.organizationName, visitorTypeLabel(visitor.visitorType), visitor.badgeId ? `Badge ${visitor.badgeId}` : 'Badge pending']
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text maxFontSizeMultiplier={1.08} style={styles.identityMeta}>
          {visitor.photoUrl ? 'Photo-backed identity record' : 'Photo missing - badge verification blocked'}
        </Text>
      </View>
    </View>
  );
}

function VisitorBadgePreview({ visitor, pass }: { visitor: VisitorRecord | null; pass: NonNullable<ReturnType<typeof useSecurityVisitorPass>['data']> }) {
  return (
    <View style={styles.badgePreview}>
      {pass.photoUrl ? <Image source={{ uri: pass.photoUrl }} style={styles.badgePhoto} /> : visitor?.photoUrl ? <Image source={{ uri: visitor.photoUrl }} style={styles.badgePhoto} /> : null}
      <View style={styles.badgeCopy}>
        <Text style={styles.identityName}>{pass.fullName || visitor?.fullName || 'Visitor'}</Text>
        <Text style={styles.identityMeta}>{[pass.organizationName || visitor?.organizationName, pass.hostEmployee || visitor?.hostEmployee].filter(Boolean).join(' · ')}</Text>
        <Text style={styles.identityMeta}>{pass.purposeOfVisit || visitor?.purposeOfVisit || 'Visit access'}</Text>
      </View>
      {pass.qrImageDataUri ? <Image source={{ uri: pass.qrImageDataUri }} style={styles.qrImage} resizeMode="contain" /> : null}
    </View>
  );
}

function StatusTimeline({ visitor }: { visitor: VisitorRecord }) {
  const history = visitor.statusHistory ?? [];
  if (!history.length) {
    return (
      <View style={styles.timelineEmpty}>
        <Text style={styles.bodyText}>No status history entries were returned for this record.</Text>
      </View>
    );
  }

  return (
    <View style={styles.timeline}>
      <Text style={styles.sectionLabel}>Immutable status history</Text>
      {history.slice(0, 8).map((entry, index) => (
        <View key={`${entry.timestamp || 'event'}-${index}`} style={styles.timelineRow}>
          <View style={styles.timelineDot} />
          <View style={styles.timelineCopy}>
            <Text style={styles.timelineTitle}>{entry.action || visitorStatusLabel(entry.status)}</Text>
            <Text style={styles.identityMeta}>{entry.timestamp ? formatDateTime(entry.timestamp) : 'Timestamp not recorded'}</Text>
            {entry.note ? <Text style={styles.bodyText}>{entry.note}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function buildDateRange(window: DateWindow) {
  if (window === 'ALL') {
    return {};
  }
  const now = new Date();
  const from = new Date(now);
  if (window === 'TODAY') {
    from.setHours(0, 0, 0, 0);
  } else if (window === '7D') {
    from.setDate(from.getDate() - 7);
  } else {
    from.setDate(from.getDate() - 30);
  }
  return { from: from.toISOString(), to: now.toISOString() };
}

function matchesAttendanceSearch(entry: EmployeeAttendanceRecord, query: string) {
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
    entry.organizationCode,
    entry.securityGuardName,
    entry.state,
    entry.status,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function matchesAttendanceDate(entry: EmployeeAttendanceRecord, from?: string, to?: string) {
  if (!from && !to) {
    return true;
  }
  const timestamp = entry.checkInTime || entry.checkOutTime || entry.createdAt;
  if (!timestamp) {
    return false;
  }
  const value = new Date(timestamp).getTime();
  return (!from || value >= new Date(from).getTime()) && (!to || value <= new Date(to).getTime());
}

function latestSecurityNote(visitor: VisitorRecord) {
  return [
    visitor.rejectionReason,
    visitor.suspensionReason,
    visitor.revocationReason,
    ...(visitor.statusHistory ?? []).map((entry) => entry.note),
  ].find((note) => Boolean(note && note.trim()));
}

function canReactivate(visitor: VisitorRecord) {
  return ['RECURRING', 'CONTRACTOR_VENDOR'].includes(String(visitor.visitorType || '')) && String(visitor.status || '') === 'SUSPENDED';
}

function dateWindowLabel(window: DateWindow) {
  return DATE_OPTIONS.find((option) => option.value === window)?.label || 'All dates';
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
  registerCard: {
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  identityRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  identityRowCompact: {
    alignItems: 'flex-start',
  },
  identityPhoto: {
    width: 96,
    height: 96,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceRaised,
  },
  identityPhotoCompact: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  identityPhotoFallback: {
    width: 96,
    height: 96,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm,
  },
  identityPhotoFallbackText: {
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
  identityTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  identityName: {
    flexShrink: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  identityMeta: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
  actionGrid: {
    gap: theme.spacing.sm,
  },
  actionGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badgePreview: {
    gap: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  badgePhoto: {
    width: 98,
    height: 98,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceRaised,
  },
  badgeCopy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  qrImage: {
    width: 210,
    height: 210,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.textInverse,
  },
  timeline: {
    gap: theme.spacing.md,
  },
  sectionLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
    marginTop: 5,
  },
  timelineCopy: {
    flex: 1,
    gap: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: theme.spacing.md,
  },
  timelineTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  timelineEmpty: {
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  paginationStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  pageText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
    textAlign: 'center',
  },
  messageStack: {
    gap: theme.spacing.sm,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
