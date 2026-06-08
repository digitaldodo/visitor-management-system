import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { OperationalLoadingState, SkeletonCard } from '../../components/feedback/LoadingState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppScreen } from '../../components/layout/AppScreen';
import { AppListScreen } from '../../components/layout/AppListScreen';
import { useAuth } from '../../auth/AuthProvider';
import { useOperationalActivityFeed, type OperationalFeedCategory, type OperationalFeedItem, type OperationalFeedSeverity } from '../../hooks/useOperationalActivityFeed';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useLocalization } from '../../localization/LocalizationProvider';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { theme } from '../../theme';

type FeedFilter = 'all' | 'priority' | 'visitor' | 'workforce' | 'approval';

export function OperationalFeedScreen() {
  const auth = useAuth();
  const navigation = useNavigation<{ navigate: (screen: string, params?: unknown) => void }>();
  const layout = useResponsiveLayout();
  const { t } = useLocalization();
  const runtime = useOperationalRuntime();
  const feed = useOperationalActivityFeed();
  const [filter, setFilter] = useState<FeedFilter>('all');

  const filteredItems = useMemo(
    () => feed.items.filter((item) => itemMatchesFilter(item, filter)),
    [feed.items, filter],
  );

  const priorityCount = feed.items.filter((item) => ['warning', 'security', 'emergency', 'denied'].includes(item.severity)).length;
  const role = auth.status === 'authenticated' ? auth.session.user.activeRole : null;
  const visitorCount = feed.items.filter((item) => item.category === 'visitor').length;
  const approvalCount = feed.items.filter((item) => item.category === 'approval').length;
  const workforceCount = feed.items.filter((item) => item.category === 'workforce').length;
  const listMaxWidth = layout.isLargeTablet ? 1180 : layout.contentMaxWidth;

  const openItem = useCallback((item: OperationalFeedItem) => {
    if (!role) {
      return;
    }
    if (item.targetType === 'visitor' && item.targetId) {
      if (role === 'SECURITY_GUARD') {
        navigation.navigate('VisitorDetail', { visitorId: item.targetId });
        return;
      }
      if (role === 'ADMIN') {
        navigation.navigate('Visitors');
        return;
      }
      if (role === 'VISITOR') {
        navigation.navigate('Pass');
        return;
      }
      navigation.navigate('Requests');
      return;
    }
    if (item.targetType === 'workforce') {
      navigation.navigate(role === 'ADMIN' ? 'Employees' : role === 'SECURITY_GUARD' ? 'Workforce' : 'Presence');
      return;
    }
    if (item.targetType === 'incident') {
      navigation.navigate(role === 'ADMIN' || role === 'SECURITY_GUARD' ? 'Emergency' : 'Notifications');
      return;
    }
    navigation.navigate(role === 'VISITOR' ? 'Notifications' : role === 'SECURITY_GUARD' ? 'Alerts' : 'Notifications');
  }, [navigation, role]);

  if (role !== 'ADMIN') {
    return (
      <AppScreen
        title="Activity"
        subtitle="Your workspace is focused on role-specific tasks and notifications."
        contentMaxWidth={layout.isLargeTablet ? 1180 : undefined}
      >
        <EmptyState icon="notifications-outline" title="Activity is admin-only" body="Your mobile workspace shows the tasks and notifications for your role." />
      </AppScreen>
    );
  }

  return (
    <AppListScreen
      title={t('feed.title')}
      subtitle={t('feed.subtitle')}
      data={feed.isLoading ? [] : filteredItems}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => (
        <View style={{ width: '100%', maxWidth: listMaxWidth }}>
          <FeedRow
            item={item}
            onPress={() => openItem(item)}
          />
        </View>
      )}
      ItemSeparatorComponent={() => <View style={styles.feedSeparator} />}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={9}
      refreshing={feed.isRefetching}
      onRefresh={feed.refetch}
      contentMaxWidth={layout.isLargeTablet ? 1180 : undefined}
      emptyComponent={(
        <View style={{ width: '100%', maxWidth: listMaxWidth }}>
          {feed.isLoading ? (
            <OperationalLoadingState
              title="Loading organization activity"
              body="Preparing visitor, workforce, approval, notification, and incident activity."
            >
              <SkeletonCard rows={3} />
            </OperationalLoadingState>
          ) : (
            <EmptyState icon="pulse-outline" title={t('feed.emptyTitle')} body={t('feed.emptyBody')} />
          )}
        </View>
      )}
      headerContent={(
        <>
          <View style={[styles.summaryGrid, layout.isTablet ? styles.summaryGridWide : null]}>
            <SummaryTile icon="pulse-outline" label="Org activity" value={feed.items.length} tone="info" />
            <SummaryTile icon="warning-outline" label={t('feed.summaryAlerts')} value={priorityCount} tone={priorityCount ? 'warning' : 'success'} />
            <SummaryTile icon="people-outline" label="Visitors" value={visitorCount} tone="info" />
            <SummaryTile
              icon={approvalCount ? 'checkmark-done-outline' : 'id-card-outline'}
              label={approvalCount ? 'Approvals' : 'Workforce'}
              value={approvalCount || workforceCount}
              tone={approvalCount ? 'warning' : 'success'}
            />
          </View>

          <WorkspaceReadinessPanel runtime={runtime} />

          <SurfaceCard title={t('feed.streamTitle')} subtitle={t('feed.streamSubtitle')}>
            <View style={styles.filterRow}>
              {filterOptions(t).map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === option.value }}
                  onPress={() => setFilter(option.value)}
                  style={[styles.filterChip, filter === option.value ? styles.filterChipActive : null]}
                >
                  <Text numberOfLines={1} style={[styles.filterText, filter === option.value ? styles.filterTextActive : null]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </SurfaceCard>
        </>
      )}
    />
  );
}

function WorkspaceReadinessPanel({
  runtime,
}: {
  runtime: ReturnType<typeof useOperationalRuntime>;
}) {
  const connectionTone = runtime.syncConnection.status === 'live'
    ? 'success'
    : runtime.syncConnection.status === 'offline' || runtime.offlineOperationalMode === 'offline'
      ? 'warning'
      : runtime.syncConnection.status === 'degraded'
        ? 'warning'
        : 'info';
  const queued = runtime.offlineOperationalQueueSize;
  const scans = runtime.offlineScanQueueSize;
  const lastEvent = runtime.syncConnection.lastEventAt ? relativeTime(runtime.syncConnection.lastEventAt) : 'No events';
  const stateLabel = runtime.isSyncingOfflineOperations
    ? 'Updating'
    : runtime.syncConnection.status === 'live'
      ? 'Current'
      : runtime.syncConnection.status === 'offline' || runtime.offlineOperationalMode === 'offline'
        ? 'Restoring'
        : 'Limited access';

  return (
    <View style={styles.syncPanel}>
      <View style={styles.syncStatusRow}>
        <View style={styles.syncIcon}>
          <Ionicons
            name="sparkles-outline"
            size={18}
            color={connectionTone === 'success' ? theme.colors.success : connectionTone === 'warning' ? theme.colors.warning : theme.colors.info}
          />
        </View>
        <View style={styles.syncCopy}>
          <Text numberOfLines={1} style={styles.syncTitle}>Workspace updates</Text>
          <Text numberOfLines={1} style={styles.syncMeta}>
            {queued
              ? `${queued} awaiting review${scans ? `, ${scans} scans` : ''}`
              : `Latest activity ${lastEvent}`}
          </Text>
        </View>
        <StatusPill label={stateLabel} tone={connectionTone} />
      </View>
    </View>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number | string;
  tone: 'success' | 'warning' | 'info';
}) {
  const color = tone === 'success' ? theme.colors.success : tone === 'warning' ? theme.colors.warning : theme.colors.info;
  return (
    <View style={styles.summaryTile}>
      <View style={[styles.summaryIcon, { backgroundColor: softTone(tone) }]}>
        <Ionicons
          name={icon}
          size={19}
          color={color}
        />
      </View>
      <View style={styles.summaryCopy}>
        <Text numberOfLines={1} style={styles.summaryLabel}>{label}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.summaryValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

function FeedRow({
  item,
  onPress,
}: {
  item: OperationalFeedItem;
  onPress: () => void;
}) {
  const { t } = useLocalization();
  const tone = severityTone(item.severity);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      android_ripple={{ color: theme.colors.primarySoft }}
      style={({ pressed }) => [styles.feedRow, pressed ? styles.feedRowPressed : null]}
    >
      <View style={styles.feedIconColumn}>
        <View style={[styles.feedIcon, { borderColor: tone.color, backgroundColor: tone.background }]}>
          <Ionicons name={severityIcon(item.severity, item.category)} size={18} color={tone.color} />
        </View>
      </View>
      <View style={[styles.feedCard, { borderLeftColor: tone.color }]}>
        <View style={styles.feedHeader}>
          <View style={styles.feedTitleBlock}>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.12} style={styles.feedTitle}>{item.title}</Text>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.08} style={styles.feedMeta}>
              {[item.actor, relativeTime(item.occurredAt), item.organization].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <StatusPill label={severityLabel(item.severity, t)} tone={statusTone(item.severity)} />
        </View>

        {item.detail ? <Text numberOfLines={3} maxFontSizeMultiplier={1.08} style={styles.feedDetail}>{item.detail}</Text> : null}

        <View style={styles.feedFooter}>
          <View style={styles.sourcePill}>
            <Ionicons name="business-outline" size={14} color={theme.colors.textSecondary} />
            <Text numberOfLines={1} style={styles.sourceText}>{item.source}</Text>
          </View>
          {item.groupCount && item.groupCount > 1 ? <MiniPill label={t('feed.grouped', { count: item.groupCount })} /> : null}
          {item.pendingSync ? <MiniPill label="Pending review" warning /> : null}
          {item.offlineGenerated ? <MiniPill label="Needs review" warning /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function MiniPill({ label, warning }: { label: string; warning?: boolean }) {
  return (
    <View style={[styles.miniPill, warning ? styles.miniPillWarning : null]}>
      <Text style={[styles.miniPillText, warning ? styles.miniPillWarningText : null]}>{label}</Text>
    </View>
  );
}

function itemMatchesFilter(item: OperationalFeedItem, filter: FeedFilter) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'priority') {
    return ['warning', 'security', 'emergency', 'denied'].includes(item.severity);
  }
  return item.category === filter;
}

function filterOptions(t: ReturnType<typeof useLocalization>['t']): Array<{ label: string; value: FeedFilter }> {
  return [
    { label: t('feed.filtersAll'), value: 'all' },
    { label: t('feed.filtersPriority'), value: 'priority' },
    { label: t('feed.filtersVisitors'), value: 'visitor' },
    { label: t('feed.filtersWorkforce'), value: 'workforce' },
    { label: t('feed.filtersApprovals'), value: 'approval' },
  ];
}

function severityTone(severity: OperationalFeedSeverity) {
  if (severity === 'emergency' || severity === 'security' || severity === 'denied') {
    return { color: theme.colors.danger, background: theme.colors.dangerSoft };
  }
  if (severity === 'warning') {
    return { color: theme.colors.warning, background: theme.colors.warningSoft };
  }
  if (severity === 'approval') {
    return { color: theme.colors.success, background: theme.colors.successSoft };
  }
  return { color: theme.colors.info, background: theme.colors.infoSoft };
}

function statusTone(severity: OperationalFeedSeverity) {
  if (severity === 'emergency' || severity === 'security' || severity === 'denied') {
    return 'danger' as const;
  }
  if (severity === 'warning') {
    return 'warning' as const;
  }
  if (severity === 'approval') {
    return 'success' as const;
  }
  return 'info' as const;
}

function severityIcon(severity: OperationalFeedSeverity, category: OperationalFeedCategory): keyof typeof Ionicons.glyphMap {
  if (severity === 'emergency') {
    return 'warning-outline';
  }
  if (severity === 'security' || severity === 'denied') {
    return 'shield-half-outline';
  }
  if (severity === 'approval') {
    return 'checkmark-done-outline';
  }
  if (severity === 'warning') {
    return 'alert-circle-outline';
  }
  if (category === 'workforce') {
    return 'id-card-outline';
  }
  if (category === 'sync') {
    return 'sparkles-outline';
  }
  return 'flash-outline';
}

function severityLabel(severity: OperationalFeedSeverity, t: ReturnType<typeof useLocalization>['t']) {
  const labels: Record<OperationalFeedSeverity, string> = {
    info: t('feed.severityInfo'),
    warning: t('feed.severityWarning'),
    security: t('feed.severityAlert'),
    emergency: t('feed.severityEmergency'),
    approval: t('feed.severityApproval'),
    denied: t('feed.severityDenied'),
  };
  return labels[severity];
}

function softTone(tone: 'success' | 'warning' | 'info') {
  if (tone === 'success') {
    return theme.colors.successSoft;
  }
  if (tone === 'warning') {
    return theme.colors.warningSoft;
  }
  return theme.colors.infoSoft;
}

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (diffMinutes < 1) {
    return 'now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  if (diffMinutes < 24 * 60) {
    return `${Math.round(diffMinutes / 60)}h`;
  }
  return new Date(timestamp).toLocaleDateString();
}

const styles = StyleSheet.create({
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  summaryGridWide: {
  },
  summaryTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 136,
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    ...theme.shadows.card,
  },
  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  summaryLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: theme.typography.heading.fontWeight,
    textTransform: 'capitalize',
  },
  syncPanel: {
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  syncStatusRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  syncIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  syncCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  syncTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  syncMeta: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  filterChip: {
    minHeight: 42,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  filterChipActive: {
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  filterText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  filterTextActive: {
    color: theme.colors.textPrimary,
  },
  feedRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  feedRowPressed: {
    opacity: 0.84,
  },
  feedSeparator: {
    height: theme.spacing.sm,
  },
  feedIconColumn: {
    width: 40,
    paddingTop: theme.spacing.sm,
    alignItems: 'center',
  },
  feedIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedCard: {
    flex: 1,
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.sm,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  feedTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  feedTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
    lineHeight: 22,
  },
  feedMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.body.fontWeight,
  },
  feedDetail: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
  feedFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  sourcePill: {
    maxWidth: '100%',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.spacing.sm,
  },
  sourceText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  miniPill: {
    minHeight: 28,
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.spacing.sm,
  },
  miniPillWarning: {
    borderColor: 'rgba(251, 191, 36, 0.28)',
    backgroundColor: theme.colors.warningSoft,
  },
  miniPillText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  miniPillWarningText: {
    color: theme.colors.warning,
  },
});
