import { Modal, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../components/buttons/PrimaryButton';
import { SurfaceCard } from '../components/cards/SurfaceCard';
import { useOperationalRuntime } from './OperationalRuntimeProvider';
import { theme } from '../theme';

export function OperationalLockOverlay() {
  const { sessionLock, runtimeHealth, unlockSession, isUnlocking, otaUpdate, applyPendingUpdate } = useOperationalRuntime();

  if (!sessionLock.isLocked) {
    return null;
  }

  const title = 'Update required';
  const body = runtimeHealth === 'update-required'
    ? 'This AccessFlow build is older than the backend allows. Update the app before resuming guard, employee, or admin operations.'
    : 'AccessFlow is checking whether this workspace can resume.';

  return (
    <Modal animationType="fade" transparent visible onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <SurfaceCard title={title} subtitle="Operational protection">
          <View style={styles.copy}>
            <Text style={styles.body}>{body}</Text>
            <Text style={styles.context}>Screenshot protection: {sessionLock.screenshotProtectionEnabled ? 'enabled' : 'disabled'}</Text>
            {otaUpdate.updateDownloaded ? <Text style={styles.context}>OTA update: downloaded and ready</Text> : null}
          </View>
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
});
