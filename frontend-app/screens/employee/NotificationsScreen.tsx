import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { MetricCard } from '../../components/cards/MetricCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppScreen } from '../../components/layout/AppScreen';
import {
  useEmployeeNotifications,
  useMarkAllEmployeeNotificationsReadMutation,
  useMarkEmployeeNotificationReadMutation,
} from '../../hooks/useEmployeeWorkspace';
import type { NotificationRecord } from '../../types/domain';
import { theme } from '../../theme';
import { formatDateTime, notificationTone } from '../../utils/employeeFormatting';

export function NotificationsScreen() {
  const queryClient = useQueryClient();
  const notifications = useEmployeeNotifications(30);
  const markReadMutation = useMarkEmployeeNotificationReadMutation();
  const markAllReadMutation = useMarkAllEmployeeNotificationsReadMutation();

  const items = notifications.data?.items ?? [];
  const unreadCount = notifications.data?.unreadCount ?? 0;
  const issueCount = useMemo(
    () => items.filter((item) => String(item.type || '').toUpperCase().includes('ISSUE') || String(item.type || '').toUpperCase().includes('REVOKED')).length,
    [items],
  );

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee', 'notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'overview'] }),
    ]);
  };

  const markRead = async (notification: NotificationRecord) => {
    if (notification.read) {
      return;
    }

    await markReadMutation.mutateAsync(notification.id);
    await refreshWorkspace();
  };

  const markAllRead = async () => {
    await markAllReadMutation.mutateAsync();
    await refreshWorkspace();
  };

  return (
    <AppScreen
      title="Notifications"
      subtitle="Operational alerts for visitor approvals, arrivals, badge issues, denials, revocations, and workforce access status."
      refreshing={notifications.isRefetching}
      onRefresh={() => {
        void notifications.refetch();
      }}
    >
      <View style={styles.metricsGrid}>
        <MetricCard label="Unread" value={unreadCount} tone={unreadCount ? 'warning' : 'success'} />
        <MetricCard label="Badge issues" value={issueCount} tone={issueCount ? 'danger' : 'default'} />
        <MetricCard label="Loaded" value={items.length} tone="default" />
      </View>

      <SurfaceCard title="Inbox controls" subtitle="The current experience is in-app only, but the data flow is already shaped for future push delivery.">
        <View style={styles.controlRow}>
          <StatusPill label={unreadCount ? `${unreadCount} unread` : 'All caught up'} tone={unreadCount ? 'warning' : 'success'} />
          <PrimaryButton
            label="Mark all read"
            onPress={() => void markAllRead()}
            tone="secondary"
            loading={markAllReadMutation.isPending}
            disabled={!unreadCount}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard title="Recent notifications" subtitle="Tap a notification to mark it read while keeping the backend inbox authoritative.">
        {items.length ? (
          items.map((notification) => (
            <Pressable
              key={notification.id}
              accessibilityRole="button"
              onPress={() => void markRead(notification)}
              style={({ pressed }) => [
                styles.notificationCard,
                notification.read ? styles.notificationRead : styles.notificationUnread,
                pressed ? styles.notificationPressed : null,
              ]}
            >
              <View style={styles.notificationHeader}>
                <View style={styles.notificationCopy}>
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  <Text style={styles.notificationMessage}>{notification.message}</Text>
                </View>
                <StatusPill label={notification.read ? 'Read' : 'New'} tone={notificationTone(notification)} />
              </View>
              <View style={styles.notificationMeta}>
                <Text style={styles.notificationMetaText}>{notification.type || 'Operational update'}</Text>
                <Text style={styles.notificationMetaText}>
                  {notification.createdAt ? formatDateTime(notification.createdAt) : 'Just now'}
                </Text>
              </View>
              {notification.visitorName ? (
                <Text style={styles.visitorNote}>Visitor: {notification.visitorName}</Text>
              ) : null}
            </Pressable>
          ))
        ) : (
          <EmptyState
            title="No notifications yet"
            body="Approval decisions, arrival alerts, badge issues, access denials, and other operational events will appear here as the backend publishes them."
          />
        )}
      </SurfaceCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  controlRow: {
    gap: theme.spacing.sm,
  },
  notificationCard: {
    gap: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  notificationUnread: {
    borderColor: theme.colors.primarySoft,
    backgroundColor: '#F7FBFF',
  },
  notificationRead: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  notificationPressed: {
    opacity: 0.82,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  notificationCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  notificationTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  notificationMessage: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  notificationMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  notificationMetaText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  visitorNote: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
});
