import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { AppScreen } from '../../components/layout/AppScreen';
import { NotificationCenter } from '../../components/notifications/NotificationCenter';
import { useNotificationsQuery } from '../../hooks/useNotificationsQuery';
import { useSecurityMonitoring } from '../../hooks/useSecurityWorkspace';
import { markAllNotificationsRead, markNotificationRead } from '../../services/notificationService';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { theme } from '../../theme';
import type { NotificationRecord } from '../../types/domain';
import { formatDateTime, statusTone, visitorStatusLabel } from '../../utils/securityFormatting';

export function AlertsScreen() {
  const queryClient = useQueryClient();
  const { localNotifications, markLocalNotificationRead } = useOperationalRuntime();
  const monitoring = useSecurityMonitoring();
  const notifications = useNotificationsQuery(20);
  const markReadMutation = useMutation({ mutationFn: markNotificationRead });
  const markAllReadMutation = useMutation({ mutationFn: markAllNotificationsRead });

  const securityItems = useMemo(
    () => (notifications.data?.items ?? []).filter((item) => ['SECURITY', 'WORKFORCE', 'SYSTEM'].includes(String(item.category || '').toUpperCase())),
    [notifications.data?.items],
  );
  const localSecurityItems = useMemo(
    () => localNotifications.filter((item) => ['SECURITY', 'SYSTEM', 'WORKFORCE'].includes(String(item.category || '').toUpperCase())),
    [localNotifications],
  );

  const deniedCount = monitoring.data?.rejectedVisitors.length ?? 0;
  const suspiciousCount = securityItems.filter((item) => String(item.type || '').includes('SUSPICIOUS')).length;
  const invalidCredentialCount = securityItems.filter((item) => String(item.type || '').includes('CREDENTIAL')).length;

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['security', 'monitoring'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
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
      title="Alert Center"
      subtitle="Security-focused operational awareness for denied entries, suspicious activity, invalid credentials, escalation events, and runtime issues."
      refreshing={monitoring.isRefetching || notifications.isRefetching}
      onRefresh={() => {
        void monitoring.refetch();
        void notifications.refetch();
      }}
    >
      <View style={styles.metricGrid}>
        <MetricCard label="Denied scans" value={deniedCount} tone={deniedCount ? 'danger' : 'default'} />
        <MetricCard label="Suspicious" value={suspiciousCount} tone={suspiciousCount ? 'warning' : 'default'} />
        <MetricCard label="Invalid creds" value={invalidCredentialCount} tone={invalidCredentialCount ? 'warning' : 'default'} />
      </View>

      <View style={styles.alertSection}>
        {monitoring.data?.rejectedVisitors.slice(0, 4).map((visitor) => (
          <RecordCard
            key={`denied-${visitor.id}`}
            title={visitor.fullName}
            subtitle={visitor.rejectionReason || visitor.companyName || 'Denied at checkpoint'}
            meta={visitor.updatedAt ? formatDateTime(visitor.updatedAt) : null}
            status={visitorStatusLabel(visitor.status)}
            tone={statusTone(visitor.status)}
          />
        ))}
        {monitoring.data?.suspendedVisitors.slice(0, 3).map((visitor) => (
          <RecordCard
            key={`suspended-${visitor.id}`}
            title={visitor.fullName}
            subtitle={visitor.suspensionReason || 'Recurring access suspended'}
            meta={visitor.updatedAt ? formatDateTime(visitor.updatedAt) : null}
            status={visitorStatusLabel(visitor.status)}
            tone="warning"
          />
        ))}
      </View>

      <NotificationCenter
        title="Recent alerts"
        subtitle="Prioritized operational notifications stay grouped to reduce noise while keeping checkpoint visibility high."
        inbox={{
          unreadCount: securityItems.filter((item) => !item.read).length,
          items: securityItems,
        }}
        localNotifications={localSecurityItems}
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
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  alertSection: {
    gap: theme.spacing.sm,
  },
});
