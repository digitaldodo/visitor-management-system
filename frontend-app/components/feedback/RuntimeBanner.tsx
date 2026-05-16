import { StyleSheet, Text, View } from 'react-native';

import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { theme } from '../../theme';

export function RuntimeBanner() {
  const { degradedMessage, runtimeUpdateAvailable, pushPermissionStatus, runtimeHealth } = useOperationalRuntime();

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

  if (!degradedMessage && !runtimeUpdateAvailable && pushPermissionStatus !== 'DENIED') {
    return null;
  }

  const tone = degradedMessage ? styles.danger : runtimeUpdateAvailable ? styles.warning : styles.info;
  const title = degradedMessage
    ? 'Degraded sync'
    : runtimeUpdateAvailable
      ? 'Runtime update detected'
      : 'Notifications limited';
  const message = degradedMessage
    ?? (runtimeUpdateAvailable
      ? 'The app detected a newer backend runtime and is refreshing operational data safely.'
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
    borderColor: '#E6B8B2',
  },
  warning: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: '#E4C18E',
  },
  info: {
    backgroundColor: theme.colors.infoSoft,
    borderColor: '#C6D7EA',
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
