import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { AppScreen } from '../../components/layout/AppScreen';
import { useEmployeeApprovals, useEmployeePreApprovals } from '../../hooks/useEmployeeWorkspace';

export function RequestsScreen() {
  const approvals = useEmployeeApprovals();
  const preApprovals = useEmployeePreApprovals();

  return (
    <AppScreen
      title="Requests"
      subtitle="Visitor approvals and pre-approved access flows stay backend-governed while the app provides operational visibility."
      refreshing={approvals.isRefetching || preApprovals.isRefetching}
      onRefresh={() => {
        void approvals.refetch();
        void preApprovals.refetch();
      }}
    >
      <SurfaceCard title="Pending approvals">
        {approvals.data?.items.length ? (
          approvals.data.items.map((visitor) => (
            <RecordCard
              key={visitor.id}
              title={visitor.fullName}
              subtitle={visitor.companyName || visitor.purposeOfVisit}
              meta={visitor.scheduledStartTime ? formatDate(visitor.scheduledStartTime) : null}
              status={visitor.status || 'Pending'}
              tone="warning"
            />
          ))
        ) : (
          <EmptyState title="No pending approvals" body="This queue will reflect the employee approval endpoint in real time." />
        )}
      </SurfaceCard>

      <SurfaceCard title="Upcoming pre-approvals">
        {preApprovals.data?.length ? (
          preApprovals.data.map((visitor) => (
            <RecordCard
              key={visitor.id}
              title={visitor.fullName}
              subtitle={visitor.companyName || visitor.purposeOfVisit}
              meta={visitor.scheduledStartTime ? formatDate(visitor.scheduledStartTime) : null}
              status={visitor.status || 'Scheduled'}
              tone="info"
            />
          ))
        ) : (
          <EmptyState title="No pre-approved visitors" body="Create and approve future visits from the existing backend workflows when needed." />
        )}
      </SurfaceCard>
    </AppScreen>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
