import { Modal, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../components/buttons/PrimaryButton';
import { SurfaceCard } from '../components/cards/SurfaceCard';
import { useOperationalRuntime } from './OperationalRuntimeProvider';
import { theme } from '../theme';

export function OperationalLockOverlay() {
  const { sessionLock, runtimeHealth, unlockSession, isUnlocking } = useOperationalRuntime();

  if (!sessionLock.isLocked) {
    return null;
  }

  const title = runtimeHealth === 'update-required' ? 'Update required' : 'Workspace locked';
  const body = runtimeHealth === 'update-required'
    ? 'This AccessFlow build is older than the backend allows. Update the app before resuming guard, employee, or admin operations.'
    : 'The workspace paused after inactivity so stale sessions do not remain open on shared devices or guard tablets.';

  return (
    <Modal animationType="fade" transparent visible onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <SurfaceCard title={title} subtitle="Operational protection">
          <View style={styles.copy}>
            <Text style={styles.body}>{body}</Text>
            <Text style={styles.context}>Biometric readiness: {sessionLock.biometricAvailable ? 'available' : 'not configured on this device'}</Text>
            <Text style={styles.context}>Screenshot protection: {sessionLock.screenshotProtectionEnabled ? 'enabled' : 'disabled'}</Text>
          </View>
          <View style={styles.actions}>
            <PrimaryButton
              label={runtimeHealth === 'update-required' ? 'Retry after update' : 'Resume session'}
              onPress={() => void unlockSession()}
              loading={isUnlocking}
            />
          </View>
        </SurfaceCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(7, 16, 25, 0.72)',
  },
  copy: {
    gap: theme.spacing.sm,
  },
  body: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  context: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    gap: theme.spacing.sm,
  },
});
