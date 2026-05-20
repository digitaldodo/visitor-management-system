import { View } from 'react-native';

import { MetricCard } from '../../components/cards/MetricCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { DetailRow } from '../../components/employee/DetailRow';
import { useSecurityAttendance, useSecurityMonitoring, useSecurityOverview } from '../../hooks/useSecurityWorkspace';
import { AccountProfileScreen } from '../common/AccountProfileScreen';

export function ProfileScreen() {
  const overview = useSecurityOverview();
  const monitoring = useSecurityMonitoring();
  const attendance = useSecurityAttendance();

  return (
    <AccountProfileScreen
      title="Profile"
      subtitle="Security identity, checkpoint context, and account settings without exposing organization-controlled access fields."
      refreshing={overview.isRefetching || monitoring.isRefetching || attendance.isRefetching}
      onRefresh={() => Promise.all([
        overview.refetch(),
        monitoring.refetch(),
        attendance.refetch(),
      ])}
      roleSummary={(
        <SurfaceCard title="Security operations" subtitle="Your mobile workspace stays scoped to checkpoint verification, visitor handling, and workforce presence support.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <MetricCard label="Inside" value={monitoring.data?.counts?.inside ?? monitoring.data?.currentlyInside?.length ?? 0} tone="success" />
            <MetricCard label="Overdue" value={monitoring.data?.overdueVisitors?.length ?? 0} tone={(monitoring.data?.overdueVisitors?.length ?? 0) ? 'warning' : 'default'} />
            <MetricCard label="Attendance scans" value={attendance.data?.length ?? 0} tone="info" />
          </View>
          <DetailRow label="Assignment" value={overview.data?.area || 'Security checkpoint'} />
          <DetailRow label="Access scope" value="QR scan, visitor exceptions, workforce onboarding, and presence verification" />
          <DetailRow label="Organization controls" value="Role, checkpoint assignment, and approval limits are managed by administrators" />
        </SurfaceCard>
      )}
    />
  );
}
