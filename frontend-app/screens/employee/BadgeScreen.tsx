import { Image, StyleSheet, Text } from 'react-native';

import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { AppScreen } from '../../components/layout/AppScreen';
import { useEmployeeBadge } from '../../hooks/useEmployeeWorkspace';

export function BadgeScreen() {
  const badge = useEmployeeBadge();

  return (
    <AppScreen
      title="Badge"
      subtitle="Employee identity and backend-issued QR rendering for access checkpoints."
      refreshing={badge.isRefetching}
      onRefresh={() => {
        void badge.refetch();
      }}
    >
      {badge.data ? (
        <SurfaceCard title={badge.data.fullName} subtitle={badge.data.department || badge.data.designation || 'Employee badge'}>
          <Text>Employee ID: {badge.data.employeeId || 'Pending'}</Text>
          <Text>Organization: {badge.data.organizationCode || badge.data.organizationName || 'Unknown'}</Text>
          <Text>Shift: {badge.data.shiftName || 'Not assigned'}</Text>
          <Text>Status: {badge.data.active ? 'Active' : 'Inactive'}</Text>
          {badge.data.qrImageDataUri ? <Image source={{ uri: badge.data.qrImageDataUri }} style={styles.qrImage} /> : null}
        </SurfaceCard>
      ) : (
        <EmptyState title="Badge not available yet" body="The employee badge endpoint is connected and waiting for backend badge issuance." />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  qrImage: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 320,
    alignSelf: 'center',
    marginTop: 12,
  },
});
