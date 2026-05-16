import { Text } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { AppScreen } from '../../components/layout/AppScreen';
import { apiConfig } from '../../api/apiConfig';

export function ProfileScreen() {
  const { session, logout, isBusy, refreshSession } = useAuth();

  return (
    <AppScreen title="Profile" subtitle="Operator identity, tenant context, and runtime health.">
      <SurfaceCard title={session?.user.fullName || 'AccessFlow operator'}>
        <Text>{session?.user.email}</Text>
        <Text>Workspace: {session?.user.activeRole}</Text>
        <Text>Organization: {session?.user.organizationCode || 'Platform-wide'}</Text>
        <Text>Last sync: {session?.lastSyncedAt ? new Date(session.lastSyncedAt).toLocaleString() : 'Unknown'}</Text>
      </SurfaceCard>

      <SurfaceCard title="Runtime">
        <Text>API base: {apiConfig.apiBaseUrl}</Text>
        <Text>App version: {apiConfig.appVersion}</Text>
        <Text>Runtime version: {apiConfig.runtimeVersion}</Text>
      </SurfaceCard>

      <PrimaryButton label="Refresh session" onPress={() => void refreshSession()} loading={isBusy} />
      <PrimaryButton label="Log out" onPress={() => void logout()} tone="secondary" disabled={isBusy} />
    </AppScreen>
  );
}
