import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { AppScreen } from '../../components/layout/AppScreen';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { apiConfig } from '../../api/apiConfig';
import { theme } from '../../theme';

export function ProfileScreen() {
  const { session, logout, isBusy, refreshSession } = useAuth();
  const runtime = useOperationalRuntime();

  return (
    <AppScreen title="Profile" subtitle="Operator identity, tenant context, secure session status, and runtime health.">
      <SurfaceCard title={session?.user.fullName || 'AccessFlow operator'}>
        <View style={styles.detailList}>
          <Text style={styles.text}>{session?.user.email}</Text>
          <Text style={styles.text}>Workspace: {session?.user.activeRole}</Text>
          <Text style={styles.text}>Organization: {session?.user.organizationCode || 'Platform-wide'}</Text>
          <Text style={styles.text}>Last sync: {session?.lastSyncedAt ? new Date(session.lastSyncedAt).toLocaleString() : 'Unknown'}</Text>
        </View>
      </SurfaceCard>

      <SurfaceCard title="Runtime">
        <View style={styles.detailList}>
          <Text style={styles.text}>Environment: {apiConfig.environment}</Text>
          <Text style={styles.text}>Distribution: {apiConfig.distributionChannel}</Text>
          <Text style={styles.text}>API base: {apiConfig.apiBaseUrl}</Text>
          <Text style={styles.text}>App version: {apiConfig.appVersion}</Text>
          <Text style={styles.text}>Runtime version: {apiConfig.runtimeVersion}</Text>
          <Text style={styles.text}>Build ID: {apiConfig.buildId}</Text>
          <Text style={styles.text}>Push permission: {runtime.pushPermissionStatus}</Text>
          <Text style={styles.text}>Runtime health: {runtime.runtimeHealth}</Text>
        </View>
      </SurfaceCard>

      <PrimaryButton label="Refresh session" onPress={() => void refreshSession()} loading={isBusy} />
      <PrimaryButton label="Log out" onPress={() => void logout()} tone="secondary" disabled={isBusy} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  detailList: {
    gap: theme.spacing.sm,
  },
  text: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
