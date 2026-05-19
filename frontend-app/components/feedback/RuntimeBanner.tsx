import { StyleSheet, Text, View } from 'react-native';

import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { theme } from '../../theme';

export function RuntimeBanner() {
  const {
    degradedMessage,
    runtimeUpdateAvailable,
    pushPermissionStatus,
    runtimeHealth,
    otaUpdate,
    devicePosture,
    offlineScanQueueSize,
  } = useOperationalRuntime();

  if (runtimeHealth === 'locked') {
    return (
      <View style={[styles.banner, styles.warning]}>
        <Text style={styles.title}>Workspace locked</Text>
        <Text style={styles.body}>The session is paused after inactivity. Resume the workspace from the lock screen to continue.</Text>
      </View>
    );
  }

  if (runtimeHealth === 'update-required') {
    return (
      <View style={[styles.banner, styles.danger]}>
        <Text style={styles.title}>Update required</Text>
        <Text style={styles.body}>This mobile build is below the backend support floor. Update AccessFlow before continuing operations.</Text>
      </View>
    );
  }

  if (!degradedMessage && !runtimeUpdateAvailable && pushPermissionStatus !== 'DENIED' && !devicePosture.suspicious && offlineScanQueueSize === 0) {
    return null;
  }

  const tone = degradedMessage || devicePosture.suspicious ? styles.danger : runtimeUpdateAvailable || offlineScanQueueSize > 0 ? styles.warning : styles.info;
  const title = degradedMessage
    ? 'Degraded sync'
    : devicePosture.suspicious
      ? 'Device review required'
      : offlineScanQueueSize > 0
        ? 'Offline scan queue active'
        : runtimeUpdateAvailable
          ? 'Runtime update detected'
          : 'Notifications limited';
  const message = degradedMessage
    ?? (devicePosture.suspicious
      ? 'This device was flagged by session policy. AccessFlow has limited operations until the session is safely resumed.'
      : offlineScanQueueSize > 0
        ? `${offlineScanQueueSize} scan${offlineScanQueueSize === 1 ? '' : 's'} are waiting for supervised retry. Access is never granted from offline cache alone.`
        : runtimeUpdateAvailable
          ? otaUpdate.updateDownloaded
            ? 'A compatible mobile update is downloaded and will apply on restart or when operations choose to reload.'
            : 'The app detected a newer backend runtime and is refreshing operational data safely.'
          : 'Push notifications are turned off on this device. In-app alerts will still appear while the app is open.');

  return (
    <View style={[styles.banner, tone]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: theme.colors.dangerSoft,
    borderColor: 'rgba(248, 113, 113, 0.28)',
  },
  warning: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: 'rgba(251, 191, 36, 0.28)',
  },
  info: {
    backgroundColor: theme.colors.infoSoft,
    borderColor: 'rgba(125, 211, 252, 0.28)',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  body: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
