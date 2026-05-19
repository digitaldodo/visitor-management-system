import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../theme';

export function BootScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.badgeLabel}>AccessFlow</Text>
      </View>
      <Text style={styles.title}>Restoring your operational workspace</Text>
      <Text style={styles.subtitle}>
        Verifying the runtime, recovering the secure session, and reconnecting to the backend.
      </Text>
      <ActivityIndicator color={theme.colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.canvas,
  },
  badge: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
  },
  badgeLabel: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title.fontSize,
    fontWeight: theme.typography.title.fontWeight,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
    textAlign: 'center',
  },
});
