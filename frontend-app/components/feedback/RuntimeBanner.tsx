import { StyleSheet, Text, View } from 'react-native';

import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { useLocalization } from '../../localization/LocalizationProvider';
import { theme } from '../../theme';

export function RuntimeBanner() {
  const { t } = useLocalization();
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
        <Text style={styles.title}>{t('runtime.lockedTitle')}</Text>
        <Text style={styles.body}>{t('runtime.lockedBody')}</Text>
      </View>
    );
  }

  if (runtimeHealth === 'update-required') {
    return (
      <View style={[styles.banner, styles.danger]}>
        <Text style={styles.title}>{t('runtime.updateRequiredTitle')}</Text>
        <Text style={styles.body}>{t('runtime.updateRequiredBody')}</Text>
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
    ? t('runtime.offlineMode')
    : isSyncingOfflineOperations
      ? t('runtime.syncing')
      : degradedMessage
        ? t('runtime.degradedSync')
    : devicePosture.suspicious
      ? t('runtime.deviceReview')
      : offlineOperationalQueueSize > 0
        ? t('runtime.queuedActions')
        : t('runtime.notificationsLimited');
  const message = offlineOperationalMode === 'offline'
    ? offlineOperationalQueueSize
      ? t('runtime.offlineBody', { count: offlineOperationalQueueSize })
      : t('runtime.offlineBodyNoQueue', { lastSync: lastSyncCopy(offlineLastSyncAt, t) })
    : isSyncingOfflineOperations
      ? t('runtime.syncingBody')
      : degradedMessage
    ?? (devicePosture.suspicious
      ? t('runtime.suspiciousBody')
      : offlineOperationalQueueSize > 0
        ? t('runtime.queuedBody', { count: offlineOperationalQueueSize, scanCount: offlineScanQueueSize })
        : t('runtime.pushDeniedBody'));

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

function lastSyncCopy(lastSyncAt: string | null, t: ReturnType<typeof useLocalization>['t']) {
  if (!lastSyncAt) {
    return t('runtime.noSyncTime');
  }

  return t('runtime.lastSync', { time: new Date(lastSyncAt).toLocaleString() });
}
