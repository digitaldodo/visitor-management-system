import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { useEmergencyState } from '../../hooks/useEmergencyWorkspace';
import { theme } from '../../theme';

export function EmergencyBanner() {
  const auth = useAuth();
  const state = useEmergencyState(auth.status === 'authenticated');
  const emergency = state.data;

  if (!emergency?.lockdownActive && !emergency?.evacuationActive && !emergency?.latestBroadcastTitle) {
    return null;
  }

  const title = emergency.lockdownActive
    ? 'Emergency lockdown active'
    : emergency.evacuationActive
      ? 'Evacuation workflow active'
      : emergency.latestBroadcastTitle || 'Emergency broadcast';
  const body = emergency.lockdownActive
    ? emergency.lockdownReason || 'Visitor approvals and new check-ins are temporarily suspended.'
    : emergency.evacuationActive
      ? emergency.evacuationScope || 'Use the evacuation register for personnel accountability.'
      : emergency.latestBroadcastMessage || 'Review current operational guidance.';

  return (
    <View style={[styles.banner, emergency.lockdownActive ? styles.lockdown : styles.broadcast]}>
      <Ionicons name={emergency.lockdownActive ? 'warning' : 'megaphone-outline'} size={21} color={theme.colors.textInverse} />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  lockdown: {
    borderColor: 'rgba(248, 113, 113, 0.45)',
    backgroundColor: 'rgba(127, 29, 29, 0.78)',
  },
  broadcast: {
    borderColor: 'rgba(245, 158, 11, 0.44)',
    backgroundColor: 'rgba(120, 53, 15, 0.72)',
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  body: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
});
