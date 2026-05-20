import { StyleSheet, Text, View } from 'react-native';

import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { theme } from '../../theme';

export function RuntimeBanner() {
  const {
    degradedMessage,
    pushPermissionStatus,
    runtimeHealth,
    devicePosture,
    offlineScanQueueSize,
    offlineOperationalMode,
    offlineOperationalQueueSize,
    offlineLastSyncAt,
    isSyncingOfflineOperations,
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

  if (
    !degradedMessage
    && pushPermissionStatus !== 'DENIED'
    && !devicePosture.suspicious
    && offlineOperationalQueueSize === 0
    && offlineOperationalMode === 'online'
    && !isSyncingOfflineOperations
  ) {
    return null;
  }

  const tone = offlineOperationalMode === 'offline' || degradedMessage || devicePosture.suspicious
    ? styles.danger
    : offlineOperationalQueueSize > 0
      ? styles.warning
      : styles.info;
  const title = offlineOperationalMode === 'offline'
    ? 'Offline Mode'
    : isSyncingOfflineOperations
      ? 'Syncing...'
      : degradedMessage
        ? 'Degraded sync'
    : devicePosture.suspicious
      ? 'Device review required'
      : offlineOperationalQueueSize > 0
        ? 'Queued actions pending'
        : 'Notifications limited';
  const message = offlineOperationalMode === 'offline'
    ? `Cached records are available for known visitors and workforce only. ${offlineOperationalQueueSize ? `${offlineOperationalQueueSize} action${offlineOperationalQueueSize === 1 ? '' : 's'} pending sync.` : lastSyncCopy(offlineLastSyncAt)}`
    : isSyncingOfflineOperations
      ? 'Back online. AccessFlow is safely replaying queued checkpoint actions and refreshing operational records.'
      : degradedMessage
    ?? (devicePosture.suspicious
      ? 'This device was flagged by session policy. AccessFlow has limited operations until the session is safely resumed.'
      : offlineOperationalQueueSize > 0
        ? `${offlineOperationalQueueSize} action${offlineOperationalQueueSize === 1 ? '' : 's'} queued, including ${offlineScanQueueSize} scan${offlineScanQueueSize === 1 ? '' : 's'}. Access is marked provisional until sync confirms.`
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

function lastSyncCopy(lastSyncAt: string | null) {
  if (!lastSyncAt) {
    return 'No local sync timestamp is available yet.';
  }

  return `Last sync ${new Date(lastSyncAt).toLocaleString()}.`;
}
