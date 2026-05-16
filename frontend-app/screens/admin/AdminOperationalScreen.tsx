import { Text } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { AppScreen } from '../../components/layout/AppScreen';

export function AdminOperationalScreen() {
  const { session, logout, isBusy } = useAuth();

  return (
    <AppScreen
      title="Admin access"
      subtitle="The mobile foundation authenticates admins and super-admins safely while the first tabbed operational shell is focused on security and employee users."
    >
      <SurfaceCard title={session?.user.fullName || 'Admin operator'}>
        <Text>Workspace role: {session?.user.activeRole}</Text>
        <Text>Organization: {session?.user.organizationCode || 'Platform scope'}</Text>
        <Text>Account: {session?.user.email}</Text>
      </SurfaceCard>

      <SurfaceCard title="Next mobile phases">
        <Text>Admin analytics, approvals, and control-room workflows can layer onto this auth and navigation foundation without changing backend rules.</Text>
      </SurfaceCard>

      <PrimaryButton label="Log out" onPress={() => void logout()} tone="secondary" disabled={isBusy} />
    </AppScreen>
  );
}
