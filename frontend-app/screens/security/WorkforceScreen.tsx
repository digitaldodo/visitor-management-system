import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { AppScreen } from '../../components/layout/AppScreen';
import { useSecurityAttendance, useSecurityEmployees } from '../../hooks/useSecurityWorkspace';

export function WorkforceScreen() {
  const attendance = useSecurityAttendance();
  const employees = useSecurityEmployees();

  return (
    <AppScreen
      title="Workforce"
      subtitle="Presence visibility, employee lookup, and onboarding handoff are ready for operational guard devices."
      refreshing={attendance.isRefetching || employees.isRefetching}
      onRefresh={() => {
        void attendance.refetch();
        void employees.refetch();
      }}
    >
      <SurfaceCard title="Presence logs" subtitle="Real-time attendance history from security-controlled employee access scans.">
        {attendance.data?.length ? (
          attendance.data.slice(0, 8).map((entry) => (
            <RecordCard
              key={entry.id}
              title={entry.employeeName}
              subtitle={entry.department || entry.designation}
              meta={[
                entry.lastAction ? `Last action: ${entry.lastAction}` : null,
                entry.checkInTime ? `Check-in: ${formatDate(entry.checkInTime)}` : null,
              ].filter(Boolean).join(' · ')}
              status={entry.status || entry.state || 'Unknown'}
              tone={entry.status === 'PRESENT' ? 'success' : entry.status === 'ABSENT' ? 'danger' : 'info'}
            />
          ))
        ) : (
          <EmptyState title="No presence logs yet" body="Attendance scan activity will appear here after the first employee access events." />
        )}
      </SurfaceCard>

      <SurfaceCard title="Employee directory" subtitle="Fast lookup for override and badge support workflows.">
        {employees.data?.length ? (
          employees.data.slice(0, 8).map((employee) => (
            <RecordCard
              key={employee.id}
              title={employee.fullName}
              subtitle={employee.department || employee.designation}
              meta={[
                employee.employeeId ? `ID: ${employee.employeeId}` : null,
                employee.shiftName ? `Shift: ${employee.shiftName}` : null,
              ].filter(Boolean).join(' · ')}
              status={employee.currentlyIn ? 'Inside' : employee.accountStatus || 'Available'}
              tone={employee.currentlyIn ? 'success' : employee.active ? 'info' : 'warning'}
            />
          ))
        ) : (
          <EmptyState title="No employee directory data" body="The security employee search endpoint is connected and ready." />
        )}
      </SurfaceCard>
    </AppScreen>
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Pending';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
