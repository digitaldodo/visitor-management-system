import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { AppScreen } from '../../components/layout/AppScreen';
import { useEmployeeAttendance } from '../../hooks/useEmployeeWorkspace';

export function PresenceScreen() {
  const attendance = useEmployeeAttendance();

  return (
    <AppScreen
      title="Presence"
      subtitle="Your recent attendance activity from the employee presence backend."
      refreshing={attendance.isRefetching}
      onRefresh={() => {
        void attendance.refetch();
      }}
    >
      <SurfaceCard title="Attendance history">
        {attendance.data?.length ? (
          attendance.data.map((entry) => (
            <RecordCard
              key={entry.id}
              title={entry.attendanceDate || 'Shift record'}
              subtitle={entry.shiftName || entry.department}
              meta={[
                entry.checkInTime ? `In: ${formatTime(entry.checkInTime)}` : null,
                entry.checkOutTime ? `Out: ${formatTime(entry.checkOutTime)}` : null,
              ].filter(Boolean).join(' · ')}
              status={entry.status || entry.state || 'Recorded'}
              tone={entry.late ? 'warning' : 'success'}
            />
          ))
        ) : (
          <EmptyState title="No attendance history yet" body="Presence records will load here after your first backend attendance event." />
        )}
      </SurfaceCard>
    </AppScreen>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
