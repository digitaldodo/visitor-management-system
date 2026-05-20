import { Modal, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../components/buttons/PrimaryButton';
import { SurfaceCard } from '../components/cards/SurfaceCard';
import { useOperationalRuntime } from './OperationalRuntimeProvider';
import { theme } from '../theme';

export function OperationalLockOverlay() {
  const { sessionLock, runtimeHealth, unlockSession, isUnlocking, authInterruptionMessage, otaUpdate, applyPendingUpdate, devicePosture } = useOperationalRuntime();

  if (!sessionLock.isLocked) {
    return null;
  }

  const title = runtimeHealth === 'update-required'
    ? 'Update required'
    : sessionLock.reason === 'suspicious-device'
      ? 'Device review required'
      : 'Workspace locked';
  const body = runtimeHealth === 'update-required'
    ? 'This AccessFlow build is older than the backend allows. Update the app before resuming guard, employee, or admin operations.'
    : sessionLock.reason === 'suspicious-device'
      ? 'AccessFlow detected a device/session policy concern. Resume only after the device posture is verified by operations.'
    : 'The workspace paused after inactivity so stale sessions do not remain open on shared devices or guard tablets.';

  return (
    <Modal animationType="fade" transparent visible onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <SurfaceCard title={title} subtitle="Operational protection">
          <View style={styles.copy}>
            <Text style={styles.body}>{body}</Text>
            <Text style={styles.context}>Biometric readiness: {sessionLock.biometricAvailable ? 'available' : 'not configured on this device'}</Text>
            <Text style={styles.context}>Screenshot protection: {sessionLock.screenshotProtectionEnabled ? 'enabled' : 'disabled'}</Text>
            <Text style={styles.context}>Managed mode: {devicePosture.managedMode}</Text>
            {otaUpdate.updateDownloaded ? <Text style={styles.context}>OTA update: downloaded and ready</Text> : null}
          </View>
          {authInterruptionMessage ? (
            <View style={styles.softInterruption}>
              <Text style={styles.softTitle}>Authentication cancelled</Text>
              <Text style={styles.softBody}>{authInterruptionMessage}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            {runtimeHealth === 'update-required' && otaUpdate.updateDownloaded ? (
              <PrimaryButton
                label="Apply downloaded update"
                onPress={() => void applyPendingUpdate()}
                loading={isUnlocking}
              />
            ) : null}
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
    backgroundColor: theme.colors.overlay,
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
  softInterruption: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.infoSoft,
    padding: theme.spacing.md,
  },
  softTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  softBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
});
