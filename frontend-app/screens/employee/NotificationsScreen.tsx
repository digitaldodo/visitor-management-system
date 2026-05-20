import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { MetricCard } from '../../components/cards/MetricCard';
import { AppScreen } from '../../components/layout/AppScreen';
import { NotificationCenter } from '../../components/notifications/NotificationCenter';
import {
  useEmployeeNotifications,
  useMarkAllEmployeeNotificationsReadMutation,
  useMarkEmployeeNotificationReadMutation,
} from '../../hooks/useEmployeeWorkspace';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import type { NotificationRecord } from '../../types/domain';
import { theme } from '../../theme';

export function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { localNotifications, markLocalNotificationRead } = useOperationalRuntime();
  const notifications = useEmployeeNotifications(30);
  const markReadMutation = useMarkEmployeeNotificationReadMutation();
  const markAllReadMutation = useMarkAllEmployeeNotificationsReadMutation();

  const backendItems = notifications.data?.items ?? [];
  const localWorkspaceNotifications = localNotifications.filter((item) => String(item.category || '').toUpperCase() !== 'SYSTEM');
  const unreadCount = (notifications.data?.unreadCount ?? 0) + localWorkspaceNotifications.filter((item) => !item.read).length;
  const criticalCount = useMemo(
    () => [...backendItems, ...localWorkspaceNotifications].filter((item) => String(item.priority || '').toUpperCase() === 'CRITICAL').length,
    [backendItems, localWorkspaceNotifications],
  );

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee', 'notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
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

  return (
    <AppScreen
      title="Notification Center"
      subtitle="Grouped notifications for approvals, arrivals, access changes, workforce updates, and account alerts."
      refreshing={notifications.isRefetching}
      onRefresh={() => notifications.refetch()}
    >
      <View style={styles.metricsGrid}>
        <MetricCard label="Unread" value={unreadCount} tone={unreadCount ? 'warning' : 'success'} />
        <MetricCard label="Critical" value={criticalCount} tone={criticalCount ? 'danger' : 'default'} />
        <MetricCard label="Loaded" value={backendItems.length + localWorkspaceNotifications.length} tone="default" />
      </View>

      <NotificationCenter
        title="Operational inbox"
        subtitle="Important account and workspace updates stay grouped so routine background recovery stays out of the way."
        inbox={notifications.data}
        localNotifications={localWorkspaceNotifications}
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

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
});
