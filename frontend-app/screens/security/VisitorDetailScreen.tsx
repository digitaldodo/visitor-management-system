import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { useOperationalSnackbar } from '../../components/feedback/OperationalSnackbar';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppScreen } from '../../components/layout/AppScreen';
import { OperationalFieldList } from '../../components/security/OperationalFieldList';
import { ReasonCaptureModal } from '../../components/security/ReasonCaptureModal';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import {
  useCheckInVisitorMutation,
  useCheckOutVisitorMutation,
  useReactivateVisitorMutation,
  useSecurityVisitor,
  useSecurityVisitorPass,
} from '../../hooks/useSecurityWorkspace';
import { theme } from '../../theme';
import type { VisitorRecord } from '../../types/domain';
import type { VisitorPass } from '../../services/visitorService';
import {
  formatDateTime,
  formatVisitorWindow,
  statusTone,
  visitorStatusLabel,
  visitorTypeLabel,
} from '../../utils/securityFormatting';

type RouteParams = {
  visitorId?: string;
  initialVisitor?: VisitorRecord;
};

export function VisitorDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { showSnackbar } = useOperationalSnackbar();
  const runtime = useOperationalRuntime();
  const params = (route.params ?? {}) as RouteParams;
  const visitorId = params.visitorId ?? params.initialVisitor?.id ?? null;
  const [historyOpen, setHistoryOpen] = useState(true);
  const [reactivateReasonOpen, setReactivateReasonOpen] = useState(false);

  const visitorQuery = useSecurityVisitor(visitorId);
  const passQuery = useSecurityVisitorPass(visitorId);
  const checkInMutation = useCheckInVisitorMutation();
  const checkOutMutation = useCheckOutVisitorMutation();
  const reactivateMutation = useReactivateVisitorMutation();
  const visitor = visitorQuery.data ?? params.initialVisitor ?? null;

  const intelligence = useMemo(() => buildVisitorIntelligence(visitor), [visitor]);
  const offlineLookupActive = runtime.offlineOperationalMode !== 'online';

  const refreshWorkspace = async () => {
    await Promise.all([
      visitorQuery.refetch(),
      passQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ['security', 'visitors'] }),
      queryClient.invalidateQueries({ queryKey: ['security', 'monitoring'] }),
      queryClient.invalidateQueries({ queryKey: ['security', 'overview'] }),
    ]);
  };

  const checkIn = async () => {
    if (!visitorId) {
      showSnackbar({ message: 'Unable to load visitor record', tone: 'danger' });
      return;
    }
    try {
      const updated = await checkInMutation.mutateAsync(visitorId);
      showSnackbar({ message: `${updated.fullName} checked in`, tone: 'success' });
      await refreshWorkspace();
    } catch (error) {
      showSnackbar({ message: getErrorMessage(error, 'Connection lost. Retry shortly'), tone: 'danger' });
    }
  };

  const checkOut = async () => {
    if (!visitorId) {
      showSnackbar({ message: 'Unable to load visitor record', tone: 'danger' });
      return;
    }
    try {
      const updated = await checkOutMutation.mutateAsync(visitorId);
      showSnackbar({ message: `${updated.fullName} checked out`, tone: 'success' });
      await refreshWorkspace();
    } catch (error) {
      showSnackbar({ message: getErrorMessage(error, 'Connection lost. Retry shortly'), tone: 'danger' });
    }
  };

  const reactivate = async () => {
    if (!visitorId) {
      showSnackbar({ message: 'Unable to load visitor record', tone: 'danger' });
      return;
    }
    try {
      const updated = await reactivateMutation.mutateAsync(visitorId);
      setReactivateReasonOpen(false);
      showSnackbar({ message: `${updated.fullName} access reactivated`, tone: 'success' });
      await refreshWorkspace();
    } catch (error) {
      showSnackbar({ message: getErrorMessage(error, 'Unable to reactivate visitor'), tone: 'danger' });
    }
  };

  if (!visitorId) {
    return (
      <AppScreen title="Visitor Record" subtitle="Operational record could not be resolved.">
        <EmptyState title="Data unavailable" body="Unable to load visitor record." />
        <PrimaryButton label="Back" onPress={() => navigation.goBack()} tone="secondary" />
      </AppScreen>
    );
  }

  return (
    <>
      <AppScreen
        title="Visitor Record"
        subtitle="Open record, badge, repeat-visit intelligence, approvals, and immutable audit trail."
        refreshing={visitorQuery.isRefetching || passQuery.isRefetching}
        onRefresh={refreshWorkspace}
      >
        {visitor ? (
          <>
            <SurfaceCard>
              <VisitorHero visitor={visitor} />
              <View style={styles.actionRow}>
                <PrimaryButton label="Back" onPress={() => navigation.goBack()} tone="secondary" />
                {visitor.status === 'APPROVED' ? (
                  <PrimaryButton
                    label={offlineLookupActive ? 'Check-in via scanner offline' : 'Check in'}
                    onPress={() => {
                      if (offlineLookupActive) {
                        showSnackbar({ message: 'Use QR scan for offline queued check-in so badge cache validation is enforced.', tone: 'warning' });
                        return;
                      }
                      void checkIn();
                    }}
                    loading={checkInMutation.isPending}
                    tone={offlineLookupActive ? 'secondary' : 'primary'}
                  />
                ) : null}
                {visitor.status === 'CHECKED_IN' ? (
                  <PrimaryButton
                    label={offlineLookupActive ? 'Check-out via scanner offline' : 'Check out'}
                    onPress={() => {
                      if (offlineLookupActive) {
                        showSnackbar({ message: 'Use QR scan for offline queued check-out so badge cache validation is enforced.', tone: 'warning' });
                        return;
                      }
                      void checkOut();
                    }}
                    loading={checkOutMutation.isPending}
                    tone="secondary"
                  />
                ) : null}
                {!offlineLookupActive && canReactivate(visitor) ? (
                  <PrimaryButton
                    label="Reactivate"
                    onPress={() => setReactivateReasonOpen(true)}
                    loading={reactivateMutation.isPending}
                    tone="secondary"
                  />
                ) : null}
              </View>
            </SurfaceCard>

            <SurfaceCard title="Badge and QR" subtitle="Read-only pass evidence for guard verification.">
              {passQuery.data ? (
                <VisitorBadgePreview visitor={visitor} pass={passQuery.data} />
              ) : passQuery.isError ? (
                <View style={styles.messageStack}>
                  <StatusPill label="Data unavailable" tone="warning" />
                  <Text style={styles.bodyText}>{getErrorMessage(passQuery.error, 'Badge data unavailable')}</Text>
                  <PrimaryButton
                    label="Retry"
                    onPress={() => {
                      showSnackbar({ message: 'Retrying badge record', tone: 'info' });
                      void passQuery.refetch();
                    }}
                    tone="secondary"
                  />
                </View>
              ) : (
                <Text style={styles.bodyText}>Loading badge record...</Text>
              )}
            </SurfaceCard>

            <SurfaceCard title="Identity and Visit">
              <OperationalFieldList
                items={[
                  { label: 'Visitor type', value: visitorTypeLabel(visitor.visitorType) },
                  { label: 'Organization', value: visitor.organizationName || visitor.companyName || visitor.vendorCompanyName || 'Not recorded' },
                  { label: 'Host', value: visitor.hostEmployee || visitor.sponsorEmployee || 'Unassigned' },
                  { label: 'Department', value: visitor.hostEmployeeDepartment || visitor.department || 'Not recorded' },
                  { label: 'Phone', value: [visitor.phoneCountryCode, visitor.phone].filter(Boolean).join(' ') || 'Not recorded' },
                  { label: 'Email', value: visitor.email || 'Not recorded' },
                  { label: 'Purpose', value: visitor.purposeOfVisit || 'Not recorded' },
                  { label: 'Access window', value: formatVisitorWindow(visitor) },
                  { label: 'Check-in', value: visitor.checkInTime ? formatDateTime(visitor.checkInTime) : 'Not checked in' },
                  { label: 'Check-out', value: visitor.checkOutTime ? formatDateTime(visitor.checkOutTime) : 'Not checked out' },
                ]}
              />
            </SurfaceCard>

            <SurfaceCard title="Repeat-Visitor Intelligence" subtitle="Operational context derived from this backend record and audit trail.">
              <View style={styles.metricGrid}>
                {intelligence.map((item) => (
                  <View key={item.label} style={styles.metricTile}>
                    <Text style={styles.metricValue}>{item.value}</Text>
                    <Text style={styles.metricLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
              <OperationalFieldList
                items={[
                  { label: 'Prior hosts', value: visitor.hostEmployee || visitor.sponsorEmployee || 'No prior host returned' },
                  { label: 'Badge history', value: visitor.badgeId ? `Badge ${visitor.badgeId}` : visitor.qrCode ? 'QR issued without badge ID' : 'No badge issued' },
                  { label: 'Photo history', value: visitor.photoUrl ? 'Photo-backed record available' : 'No photo returned' },
                  { label: 'Suspension flags', value: visitor.suspensionReason || visitor.revocationReason || visitor.rejectionReason || 'No flags returned' },
                  { label: 'Security notes', value: latestSecurityNote(visitor) || 'No security note recorded' },
                ]}
              />
            </SurfaceCard>

            <SurfaceCard title="Approval Logs">
              <OperationalFieldList
                items={[
                  { label: 'Approved', value: visitor.approvedAt ? formatDateTime(visitor.approvedAt) : 'Not approved' },
                  { label: 'Approved by', value: visitor.approvedBy || 'Not recorded' },
                  { label: 'Rejected', value: visitor.rejectedAt ? formatDateTime(visitor.rejectedAt) : 'Not rejected' },
                  { label: 'Rejected by', value: visitor.rejectedBy || 'Not recorded' },
                  { label: 'Rejection reason', value: visitor.rejectionReason || 'No rejection reason' },
                  { label: 'Suspended', value: visitor.suspendedAt ? formatDateTime(visitor.suspendedAt) : 'Not suspended' },
                  { label: 'Suspension reason', value: visitor.suspensionReason || 'No suspension reason' },
                ]}
              />
            </SurfaceCard>

            <SurfaceCard title="Audit Trail" subtitle="History is preserved; this screen does not mutate audit entries.">
              <Pressable
                accessibilityRole="button"
                onPress={() => setHistoryOpen((open) => !open)}
                onLongPress={() => showSnackbar({ message: 'Open Record history is shown here', tone: 'info' })}
                style={styles.historyToggle}
              >
                <Text style={styles.historyToggleText}>{historyOpen ? 'Hide History' : 'Open History'}</Text>
              </Pressable>
              {historyOpen ? <StatusTimeline visitor={visitor} /> : null}
            </SurfaceCard>
          </>
        ) : visitorQuery.isError ? (
          <SurfaceCard title="Data unavailable">
            <Text style={styles.bodyText}>{getErrorMessage(visitorQuery.error, 'Unable to load visitor record')}</Text>
            <PrimaryButton label="Retry" onPress={() => void visitorQuery.refetch()} tone="secondary" />
          </SurfaceCard>
        ) : (
          <SurfaceCard title="Loading record">
            <Text style={styles.bodyText}>Loading visitor operational record...</Text>
          </SurfaceCard>
        )}
      </AppScreen>

      <ReasonCaptureModal
        visible={reactivateReasonOpen}
        title="Reactivate visitor"
        helperText="Confirm that the visitor has been reviewed before reactivation. Backend audit history remains preserved."
        confirmLabel="Reactivate"
        loading={reactivateMutation.isPending}
        onCancel={() => setReactivateReasonOpen(false)}
        onConfirm={() => void reactivate()}
      />
    </>
  );
}

function VisitorHero({ visitor }: { visitor: VisitorRecord }) {
  return (
    <View style={styles.hero}>
      {visitor.photoUrl ? (
        <Image source={{ uri: visitor.photoUrl }} style={styles.heroPhoto} />
      ) : (
        <View style={styles.heroPhotoFallback}>
          <Text style={styles.heroPhotoFallbackText}>No photo</Text>
        </View>
      )}
      <View style={styles.heroCopy}>
        <View style={styles.heroTitleRow}>
          <Text maxFontSizeMultiplier={1.12} style={styles.heroName}>{visitor.fullName}</Text>
          <StatusPill label={visitorStatusLabel(visitor.status)} tone={statusTone(visitor.status)} />
        </View>
        <Text maxFontSizeMultiplier={1.08} style={styles.metaText}>
          {[visitor.companyName || visitor.organizationName || visitor.vendorCompanyName, visitor.hostEmployee ? `Host ${visitor.hostEmployee}` : null]
            .filter(Boolean)
            .join(' - ') || 'Visitor identity record'}
        </Text>
        <Text maxFontSizeMultiplier={1.08} style={styles.metaText}>
          {visitor.badgeId ? `Badge ${visitor.badgeId}` : visitor.qrCode ? 'QR issued' : 'Badge pending'} - {latestTimestamp(visitor)}
        </Text>
      </View>
    </View>
  );
}

function VisitorBadgePreview({ visitor, pass }: { visitor: VisitorRecord; pass: VisitorPass }) {
  return (
    <View style={styles.badgePreview}>
      <View style={styles.badgeIdentity}>
        {pass.photoUrl || visitor.photoUrl ? (
          <Image source={{ uri: pass.photoUrl || visitor.photoUrl || '' }} style={styles.badgePhoto} />
        ) : null}
        <View style={styles.badgeCopy}>
          <Text style={styles.heroName}>{pass.fullName || visitor.fullName}</Text>
          <Text style={styles.metaText}>{[pass.organizationName || visitor.organizationName, pass.hostEmployee || visitor.hostEmployee].filter(Boolean).join(' - ')}</Text>
          <Text style={styles.metaText}>{pass.valid ? 'Valid pass' : 'Pass not currently valid'}</Text>
        </View>
      </View>
      {pass.qrImageDataUri ? <Image source={{ uri: pass.qrImageDataUri }} style={styles.qrImage} resizeMode="contain" /> : null}
      <OperationalFieldList
        items={[
          { label: 'Badge ID', value: pass.badgeId || visitor.badgeId || 'Not issued' },
          { label: 'Status', value: pass.statusLabel || visitorStatusLabel(pass.status || visitor.status) },
          { label: 'Pass code', value: pass.passCode || 'Not returned' },
          { label: 'Issued', value: pass.issuedAt ? formatDateTime(pass.issuedAt) : visitor.qrIssuedAt ? formatDateTime(visitor.qrIssuedAt) : 'Not recorded' },
          { label: 'Expires', value: pass.expiresAt ? formatDateTime(pass.expiresAt) : 'Not recorded' },
        ]}
      />
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
      {history.slice(0, 12).map((entry, index) => (
        <View key={`${entry.timestamp || 'event'}-${index}`} style={styles.timelineRow}>
          <View style={styles.timelineDot} />
          <View style={styles.timelineCopy}>
            <Text style={styles.timelineTitle}>{entry.action || visitorStatusLabel(entry.status)}</Text>
            <Text style={styles.metaText}>{entry.timestamp ? formatDateTime(entry.timestamp) : 'Timestamp not recorded'}</Text>
            {entry.note ? <Text style={styles.bodyText}>{entry.note}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function buildVisitorIntelligence(visitor?: VisitorRecord | null) {
  const history = visitor?.statusHistory ?? [];
  const approvals = history.filter((entry) => entry.status === 'APPROVED' || String(entry.action || '').toLowerCase().includes('approv')).length;
  const exceptions = history.filter((entry) => ['REJECTED', 'SUSPENDED', 'EXPIRED'].includes(String(entry.status || ''))).length
    + [visitor?.rejectionReason, visitor?.suspensionReason, visitor?.revocationReason].filter(Boolean).length;

  return [
    { label: 'Audit events', value: String(history.length) },
    { label: 'Approvals', value: String(approvals || (visitor?.approvedAt ? 1 : 0)) },
    { label: 'Flags', value: String(exceptions) },
    { label: 'Badge records', value: visitor?.badgeId || visitor?.qrCode ? '1' : '0' },
  ];
}

function latestTimestamp(visitor: VisitorRecord) {
  return formatDateTime(visitor.checkOutTime || visitor.checkInTime || visitor.approvedAt || visitor.updatedAt || visitor.createdAt);
}

function latestSecurityNote(visitor: VisitorRecord) {
  return [
    visitor.rejectionReason,
    visitor.suspensionReason,
    visitor.revocationReason,
    visitor.notes,
    ...(visitor.statusHistory ?? []).map((entry) => entry.note),
  ].find((note) => Boolean(note && note.trim()));
}

function canReactivate(visitor: VisitorRecord) {
  return ['RECURRING', 'CONTRACTOR_VENDOR'].includes(String(visitor.visitorType || '')) && String(visitor.status || '') === 'SUSPENDED';
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  heroPhoto: {
    width: 92,
    height: 92,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceRaised,
  },
  heroPhotoFallback: {
    width: 92,
    height: 92,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm,
  },
  heroPhotoFallbackText: {
    color: theme.colors.danger,
    textAlign: 'center',
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
  },
  heroCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  heroTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  heroName: {
    flexShrink: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  metaText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  badgePreview: {
    gap: theme.spacing.md,
  },
  badgeIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  badgePhoto: {
    width: 74,
    height: 74,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceRaised,
  },
  badgeCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  qrImage: {
    alignSelf: 'center',
    width: 210,
    height: 210,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.textInverse,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  metricTile: {
    minWidth: 112,
    flex: 1,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  metricValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
  },
  historyToggle: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.spacing.md,
  },
  historyToggleText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  timeline: {
    gap: theme.spacing.md,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  timelineDot: {
    width: 11,
    height: 11,
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
  messageStack: {
    gap: theme.spacing.sm,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
