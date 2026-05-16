import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { AppScreen } from '../../components/layout/AppScreen';
import { useSecurityOverview, useSecurityVisitors } from '../../hooks/useSecurityWorkspace';

export function VisitorsScreen() {
  const overview = useSecurityOverview();
  const visitors = useSecurityVisitors();

  const metrics = useMemo(() => Object.entries(overview.data?.metrics ?? {}).slice(0, 4), [overview.data?.metrics]);

  return (
    <AppScreen
      title="Visitors"
      subtitle="Live visitor operations backed directly by the security endpoints."
      refreshing={overview.isRefetching || visitors.isRefetching}
      onRefresh={() => {
        void overview.refetch();
        void visitors.refetch();
      }}
    >
      <View style={styles.metricGrid}>
        {metrics.map(([label, value]) => (
          <MetricCard key={label} label={humanize(label)} value={value} />
        ))}
      </View>

      <SurfaceCard title="Recent visitor records" subtitle="Approved, checked-in, and pending records from the security queue.">
        {visitors.data?.items.length ? (
          visitors.data.items.slice(0, 8).map((visitor) => (
            <RecordCard
              key={visitor.id}
              title={visitor.fullName}
              subtitle={visitor.companyName || visitor.purposeOfVisit}
              meta={[
                visitor.hostEmployee ? `Host: ${visitor.hostEmployee}` : null,
                visitor.scheduledStartTime ? `Start: ${formatDate(visitor.scheduledStartTime)}` : null,
              ].filter(Boolean).join(' · ')}
              status={visitor.status || 'Pending'}
              tone={visitor.status === 'CHECKED_IN' ? 'success' : visitor.status === 'REJECTED' ? 'danger' : 'info'}
            />
          ))
        ) : (
          <EmptyState title="No visitor records yet" body="Once security activity starts, live visitor records will appear here." />
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

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Scheduled';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
