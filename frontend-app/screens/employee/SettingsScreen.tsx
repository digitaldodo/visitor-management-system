import { Text } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { AppScreen } from '../../components/layout/AppScreen';
import { useEmployeeProfile } from '../../hooks/useEmployeeWorkspace';

export function SettingsScreen() {
  const profile = useEmployeeProfile();
  const { logout, isBusy, refreshSession } = useAuth();

  return (
    <AppScreen
      title="Settings"
      subtitle="Employee profile details, notification preferences, and session controls."
      refreshing={profile.isRefetching}
      onRefresh={() => {
        void profile.refetch();
      }}
    >
      <SurfaceCard title={profile.data?.fullName || 'Employee profile'}>
        <Text>Email: {profile.data?.email || 'Unknown'}</Text>
        <Text>Department: {profile.data?.department || 'Not set'}</Text>
        <Text>Designation: {profile.data?.designation || 'Not set'}</Text>
        <Text>Language: {profile.data?.preferredLanguage || 'Default'}</Text>
        <Text>Notifications: {profile.data?.notificationInAppEnabled ? 'Enabled' : 'Managed by backend settings'}</Text>
      </SurfaceCard>

      <PrimaryButton label="Refresh session" onPress={() => void refreshSession()} loading={isBusy} />
      <PrimaryButton label="Log out" onPress={() => void logout()} tone="secondary" disabled={isBusy} />
    </AppScreen>
  );
}
