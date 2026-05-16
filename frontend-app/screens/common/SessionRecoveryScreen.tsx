import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';

export function SessionRecoveryScreen() {
  const { recovery, retryBootstrap, logout, isBusy, session } = useAuth();
  const layout = useResponsiveLayout();

  return (
    <View style={styles.container}>
      <View style={[styles.frame, { maxWidth: layout.isTablet ? 720 : 480 }]}>
        <SurfaceCard
          title="Session recovery required"
          subtitle="The app avoided restoring a stale or incomplete session state. Use the safe recovery options below."
        >
          <View style={styles.messageBlock}>
            <Text style={styles.message}>{recovery?.message || 'The secure runtime could not finish bootstrapping.'}</Text>
            {session?.user.fullName ? (
              <Text style={styles.context}>Last operator: {session.user.fullName}</Text>
            ) : null}
            {session?.user.organizationCode ? (
              <Text style={styles.context}>Organization: {session.user.organizationCode}</Text>
            ) : null}
          </View>
          <View style={styles.actions}>
            <PrimaryButton label="Retry recovery" onPress={() => void retryBootstrap()} loading={isBusy} />
            <PrimaryButton label="Sign out safely" onPress={() => void logout()} tone="secondary" disabled={isBusy} />
          </View>
        </SurfaceCard>
        <View style={styles.helpBlock}>
          <Text style={styles.helpTitle}>What this protects against</Text>
          <Text style={styles.helpBody}>Stale tokens, broken refresh loops, runtime upgrades, and partially written session data are isolated here instead of freezing the workspace.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.canvas,
  },
  frame: {
    width: '100%',
    alignSelf: 'center',
    gap: theme.spacing.md,
  },
  messageBlock: {
    gap: theme.spacing.sm,
  },
  message: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  context: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  actions: {
    gap: theme.spacing.md,
  },
  helpBlock: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  helpTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  helpBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
