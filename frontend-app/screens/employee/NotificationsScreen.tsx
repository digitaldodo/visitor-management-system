import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { AppScreen } from '../../components/layout/AppScreen';
import { useEmployeeNotifications } from '../../hooks/useEmployeeWorkspace';

export function NotificationsScreen() {
  const notifications = useEmployeeNotifications();

  return (
    <AppScreen
      title="Notifications"
      subtitle="Actionable visitor and access notifications from the employee endpoints."
      refreshing={notifications.isRefetching}
      onRefresh={() => {
        void notifications.refetch();
      }}
    >
      <SurfaceCard title="Recent notifications">
        {notifications.data?.length ? (
          notifications.data.map((notification) => (
            <RecordCard
              key={notification.id}
              title={notification.title}
              subtitle={notification.message}
              meta={notification.createdAt ? new Date(notification.createdAt).toLocaleString() : null}
              status={notification.read ? 'Read' : 'New'}
              tone={notification.read ? 'default' : 'info'}
            />
          ))
        ) : (
          <EmptyState title="No notifications yet" body="When the backend sends in-app notifications, they will appear here." />
        )}
      </SurfaceCard>
    </AppScreen>
  );
}
