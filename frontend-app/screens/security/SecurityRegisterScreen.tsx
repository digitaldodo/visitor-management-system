import { memo, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { useOperationalSnackbar } from '../../components/feedback/OperationalSnackbar';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { AppScreen } from '../../components/layout/AppScreen';
import { OperationalFieldList } from '../../components/security/OperationalFieldList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import {
  useReactivateVisitorMutation,
  useSecurityAttendance,
  useSecurityMonitoring,
  useSecurityVisitors,
} from '../../hooks/useSecurityWorkspace';
import { theme } from '../../theme';
import type { EmployeeAttendanceRecord, SecurityMonitoring, VisitorRecord, VisitorStatus } from '../../types/domain';
import {
  employeePresenceLabel,
  formatDateTime,
  formatVisitorWindow,
  statusTone,
  visitorStatusLabel,
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
  const navigation = useNavigation<{ navigate: (screen: string, params?: unknown) => void }>();
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const { showSnackbar } = useOperationalSnackbar();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<RegisterKind>('ALL');
  const [status, setStatus] = useState<RegisterStatus>('ALL');
  const [dateWindow, setDateWindow] = useState<DateWindow>('30D');
  const [page, setPage] = useState(0);
  const [selectedAttendance, setSelectedAttendance] = useState<EmployeeAttendanceRecord | null>(null);
  const [menuVisitor, setMenuVisitor] = useState<VisitorRecord | null>(null);

  const deferredSearch = useDebouncedValue(search.trim(), 220);
  const dateRange = useMemo(() => buildDateRange(dateWindow), [dateWindow]);
  const monitoring = useSecurityMonitoring(deferredSearch);
  const visitors = useSecurityVisitors(
    kind === 'WORKFORCE' ? '' : deferredSearch,
    status === 'ALL' ? undefined : status,
    page,
    VISITOR_PAGE_SIZE,
    dateRange.from,
    dateRange.to,
  );
  const attendance = useSecurityAttendance();
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
  const highlights = useMemo(() => buildOperationalHighlights(monitoring.data, visitorItems), [monitoring.data, visitorItems]);
  const isRefreshing = visitors.isRefetching || attendance.isRefetching || monitoring.isRefetching;

  const openVisitorRecord = (visitor: VisitorRecord) => {
    setMenuVisitor(null);
    navigation.navigate('VisitorDetail', { visitorId: visitor.id, initialVisitor: visitor });
  };

  const selectAttendance = (entry: EmployeeAttendanceRecord) => {
    setSelectedAttendance(entry);
    setMenuVisitor(null);
  };

  const refreshRegister = async () => {
    await Promise.all([
      visitors.refetch(),
      attendance.refetch(),
      monitoring.refetch(),
      queryClient.invalidateQueries({ queryKey: ['security', 'monitoring'] }),
    ]);
  };

  const reactivateRecurring = async (visitor: VisitorRecord) => {
    try {
      const updated = await reactivateMutation.mutateAsync(visitor.id);
      setMenuVisitor(null);
      showSnackbar({ message: `${updated.fullName} access reactivated`, tone: 'success' });
      await refreshRegister();
    } catch (error) {
      showSnackbar({ message: getErrorMessage(error, 'Unable to reactivate visitor'), tone: 'danger' });
    }
  };

  return (
    <AppScreen
      title="Security Register"
      subtitle="High-density operational register for visitors, workforce presence, badges, approvals, and audit history."
      refreshing={isRefreshing}
      onRefresh={refreshRegister}
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

      <SurfaceCard title="Operational highlights" subtitle="Priority visitors only. Full history stays compact below.">
        {highlights.length ? (
          highlights.map((visitor) => (
            <OperationalHighlightCard
              key={`highlight-${visitor.id}`}
              visitor={visitor}
              onPress={() => openVisitorRecord(visitor)}
              onLongPress={() => setMenuVisitor(visitor)}
            />
          ))
        ) : (
          <EmptyState title="No priority records" body="Inside visitors, recent check-ins, denials, suspensions, and approvals will appear here first." />
        )}
      </SurfaceCard>

      {menuVisitor ? (
        <SurfaceCard title="Operational menu" subtitle="Long-press actions for the selected visitor record.">
          <VisitorCompactRow visitor={menuVisitor} onPress={() => openVisitorRecord(menuVisitor)} />
          <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
            <PrimaryButton label="Open Record" onPress={() => openVisitorRecord(menuVisitor)} />
            {canReactivate(menuVisitor) ? (
              <PrimaryButton
                label="Reactivate access"
                onPress={() => void reactivateRecurring(menuVisitor)}
                loading={reactivateMutation.isPending}
                tone="secondary"
              />
            ) : (
              <PrimaryButton
                label="More actions"
                onPress={() => showSnackbar({ message: 'Additional operational actions are available inside Open Record', tone: 'info' })}
                tone="secondary"
              />
            )}
            <PrimaryButton label="Close menu" onPress={() => setMenuVisitor(null)} tone="secondary" />
          </View>
        </SurfaceCard>
      ) : null}

      {selectedAttendance ? (
        <SurfaceCard title="Workforce entry detail" subtitle="Read-only workforce register event for guard review.">
          <WorkforceCompactRow entry={selectedAttendance} onPress={() => undefined} />
          <OperationalFieldList
            items={[
              { label: 'Check-in', value: selectedAttendance.checkInTime ? formatDateTime(selectedAttendance.checkInTime) : 'Not checked in' },
              { label: 'Check-out', value: selectedAttendance.checkOutTime ? formatDateTime(selectedAttendance.checkOutTime) : 'Not checked out' },
              { label: 'Guard assist', value: selectedAttendance.securityGuardName || 'Static QR/self-service' },
              { label: 'Override note', value: selectedAttendance.overrideReason || 'No override note' },
              { label: 'Shift', value: [selectedAttendance.shiftName, selectedAttendance.shiftStartTime, selectedAttendance.shiftEndTime].filter(Boolean).join(' - ') || 'Not assigned' },
              { label: 'Record state', value: selectedAttendance.state || selectedAttendance.status || 'Recorded' },
            ]}
          />
          <PrimaryButton label="Close details" onPress={() => setSelectedAttendance(null)} tone="secondary" />
        </SurfaceCard>
      ) : null}

      <SurfaceCard title="Visitor history" subtitle="Compact scan-first register. Tap a row for full identity, badge, QR, approvals, and audit trail.">
        {visitorItems.length ? (
          <>
            <View style={styles.compactList}>
              {visitorItems.map((visitor) => (
                <VisitorCompactRow
                  key={visitor.id}
                  visitor={visitor}
                  onPress={() => openVisitorRecord(visitor)}
                  onLongPress={() => setMenuVisitor(visitor)}
                />
              ))}
            </View>
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

      <SurfaceCard title="Workforce entries" subtitle="Compact employee and workforce presence history.">
        {attendanceItems.length ? (
          <View style={styles.compactList}>
            {attendanceItems.map((entry) => (
              <WorkforceCompactRow
                key={entry.id}
                entry={entry}
                onPress={() => selectAttendance(entry)}
                onLongPress={() => showSnackbar({ message: `${entry.employeeName} workforce entry opened`, tone: 'info' })}
              />
            ))}
          </View>
        ) : (
          <EmptyState title="No workforce entries" body="Workforce check-in and check-out events will appear after guard scans or assisted actions." />
        )}
      </SurfaceCard>
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
          <Text numberOfLines={1} style={[styles.segmentLabel, value === option.value ? styles.segmentLabelActive : null]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const OperationalHighlightCard = memo(function OperationalHighlightCard({
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
});

const VisitorCompactRow = memo(function VisitorCompactRow({
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
});

const WorkforceCompactRow = memo(function WorkforceCompactRow({
  entry,
  onPress,
  onLongPress,
}: {
  entry: EmployeeAttendanceRecord;
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
      <View style={styles.workforceAvatar}>
        <Text style={styles.workforceAvatarText}>{entry.employeeName.slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={styles.compactCopy}>
        <View style={styles.rowTitleLine}>
          <Text maxFontSizeMultiplier={1.08} numberOfLines={1} style={styles.rowName}>{entry.employeeName}</Text>
          <StatusPill label={employeePresenceLabel(entry)} tone={statusTone(entry.status)} />
        </View>
        <Text maxFontSizeMultiplier={1.04} numberOfLines={1} style={styles.rowMeta}>
          {[entry.department || entry.organizationName || 'Workforce', entry.designation || entry.employeeId].filter(Boolean).join(' - ')}
        </Text>
        <Text maxFontSizeMultiplier={1.04} numberOfLines={1} style={styles.rowMeta}>
          {employeePresenceLabel(entry)} - {formatDateTime(entry.checkOutTime || entry.checkInTime || entry.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
});

function buildOperationalHighlights(monitoring?: SecurityMonitoring, visitorItems: VisitorRecord[] = []) {
  const ordered = [
    ...(monitoring?.suspendedVisitors ?? []),
    ...(monitoring?.rejectedVisitors ?? []),
    ...(monitoring?.overdueVisitors ?? []),
    ...(monitoring?.currentlyInside ?? []),
    ...(monitoring?.approvedVisitors ?? []),
    ...visitorItems.filter((visitor) => ['CHECKED_IN', 'APPROVED', 'CHECKED_OUT'].includes(String(visitor.status || ''))),
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

function latestTimestamp(visitor: VisitorRecord) {
  return formatDateTime(visitor.checkOutTime || visitor.checkInTime || visitor.approvedAt || visitor.updatedAt || visitor.createdAt);
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
  pressed: {
    opacity: 0.82,
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
  compactCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
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
  workforceAvatar: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(20, 184, 166, 0.28)',
  },
  workforceAvatarText: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '800',
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
  actionGrid: {
    gap: theme.spacing.sm,
  },
  actionGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
});
