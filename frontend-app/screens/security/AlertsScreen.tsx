import { StyleSheet, View } from 'react-native';

import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { AppScreen } from '../../components/layout/AppScreen';
import { useNotificationsQuery } from '../../hooks/useNotificationsQuery';
import { useSecurityMonitoring } from '../../hooks/useSecurityWorkspace';

export function AlertsScreen() {
  const monitoring = useSecurityMonitoring();
  const notifications = useNotificationsQuery(10);
  const counts = Object.entries(monitoring.data?.counts ?? {}).slice(0, 4);

  return (
    <AppScreen
      title="Alerts"
      subtitle="Checkpoint risk signals and operator notifications share a single surface for quick action."
      refreshing={monitoring.isRefetching || notifications.isRefetching}
      onRefresh={() => {
        void monitoring.refetch();
        void notifications.refetch();
      }}
    >
      <View style={styles.metricGrid}>
        {counts.map(([label, value]) => (
          <MetricCard key={label} label={label.replace(/[_-]/g, ' ')} value={value} tone={value > 0 ? 'warning' : 'default'} />
        ))}
      </View>

      <SurfaceCard title="Overdue or active concerns">
        {monitoring.data?.overdueVisitors.length ? (
          monitoring.data.overdueVisitors.slice(0, 6).map((visitor) => (
            <RecordCard
              key={visitor.id}
              title={visitor.fullName}
              subtitle={visitor.companyName || 'Overdue visitor'}
              meta={visitor.hostEmployee ? `Host: ${visitor.hostEmployee}` : null}
              status={visitor.status || 'Overdue'}
              tone="warning"
            />
          ))
        ) : (
          <EmptyState title="No overdue visitors" body="Monitoring alerts will surface here when backend risk thresholds are hit." />
        )}
      </SurfaceCard>

      <SurfaceCard title="Operator notifications">
        {notifications.data?.items.length ? (
          notifications.data.items.map((notification) => (
            <RecordCard
              key={notification.id}
              title={notification.title}
              subtitle={notification.message}
              meta={notification.createdAt ? formatDate(notification.createdAt) : null}
              status={notification.read ? 'Read' : 'New'}
              tone={notification.read ? 'default' : 'info'}
            />
          ))
        ) : (
          <EmptyState title="No notifications" body="Backend notifications will appear here without duplicating notification logic in the app." />
        )}
      </SurfaceCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
