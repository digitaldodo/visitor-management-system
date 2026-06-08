import { StyleSheet, View } from 'react-native';

import { MetricCard } from '../../components/cards/MetricCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { DetailRow } from '../../components/employee/DetailRow';
import { StatusPill } from '../../components/feedback/StatusPill';
import {
  useEmployeeAttendance,
  useEmployeeBadge,
  useEmployeeOverview,
  useEmployeeProfile,
} from '../../hooks/useEmployeeWorkspace';
import { theme } from '../../theme';
import { formatDateTime, formatShift } from '../../utils/employeeFormatting';
import { AccountProfileScreen } from '../common/AccountProfileScreen';

export function SettingsScreen() {
  const overview = useEmployeeOverview();
  const profile = useEmployeeProfile();
  const badge = useEmployeeBadge();
  const attendance = useEmployeeAttendance();

  return (
    <AccountProfileScreen
      title="Profile"
      subtitle="Employee identity, credential status, personal settings, and secure account controls."
      refreshing={overview.isRefetching || profile.isRefetching || badge.isRefetching || attendance.isRefetching}
      onRefresh={() => Promise.all([
        overview.refetch(),
        profile.refetch(),
        badge.refetch(),
        attendance.refetch(),
      ])}
      roleSummary={(
        <SurfaceCard title="Employee credential" subtitle="Badge authority stays managed by AccessFlow while personal settings remain user-editable.">
          <StatusPill label={badge.data?.active ? 'Badge active' : 'Badge unavailable'} tone={badge.data?.active ? 'success' : 'danger'} />
          <View style={styles.metricsGrid}>
            <MetricCard label="Pending approvals" value={overview.data?.metrics?.pending ?? 0} tone={(overview.data?.metrics?.pending ?? 0) ? 'warning' : 'default'} />
            <MetricCard label="Presence logs" value={attendance.data?.length ?? 0} tone="info" />
          </View>
          <DetailRow label="Badge issued" value={badge.data?.issuedAt ? formatDateTime(badge.data.issuedAt, badge.data.organizationTimezone) : 'Not issued yet'} muted={!badge.data?.issuedAt} />
          <DetailRow label="Credential QR" value={badge.data?.active ? 'Static QR issued and active' : 'Unavailable or revoked'} muted={!badge.data?.active} />
          <DetailRow label="Shift" value={formatShift(profile.data?.shiftName, profile.data?.shiftStartTime, profile.data?.shiftEndTime)} />
          <DetailRow label="Org timezone" value={profile.data?.organizationTimezone || badge.data?.organizationTimezone || 'Not assigned'} muted={!profile.data?.organizationTimezone && !badge.data?.organizationTimezone} />
        </SurfaceCard>
      )}
    />
  );
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
});
