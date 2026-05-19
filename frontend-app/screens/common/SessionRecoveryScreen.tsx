import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';

export function SessionRecoveryScreen() {
  const { recovery, retryBootstrap, logout, isBusy, session } = useAuth();
  const layout = useResponsiveLayout();
  const copy = recoveryCopy(recovery?.reason, recovery?.message);

  return (
    <View style={styles.container}>
      <View style={[styles.frame, { maxWidth: layout.isTablet ? 720 : 480 }]}>
        <SurfaceCard
          title={copy.title}
          subtitle={copy.subtitle}
        >
          <View style={styles.messageBlock}>
            <Text style={styles.message}>{copy.message}</Text>
            {session?.user.fullName ? (
              <Text style={styles.context}>Last operator: {session.user.fullName}</Text>
            ) : null}
            {session?.user.organizationCode ? (
              <Text style={styles.context}>Organization: {session.user.organizationCode}</Text>
            ) : null}
          </View>
          <View style={styles.actions}>
            <PrimaryButton label={copy.primaryAction} onPress={() => void retryBootstrap()} loading={isBusy} />
            <PrimaryButton label="Sign out safely" onPress={() => void logout()} tone="secondary" disabled={isBusy} />
          </View>
        </SurfaceCard>
        <View style={styles.helpBlock}>
          <Text style={styles.helpTitle}>{copy.helpTitle}</Text>
          <Text style={styles.helpBody}>{copy.helpBody}</Text>
        </View>
      </View>
    </View>
  );
}

function recoveryCopy(reason?: string, message?: string | null) {
  const normalizedReason = String(reason || '').toLowerCase();
  const fallbackMessage = message || 'The secure runtime could not finish bootstrapping.';

  if (normalizedReason.includes('network')) {
    return {
      title: 'Connection recovery',
      subtitle: 'AccessFlow preserved the saved session, but the backend could not be reached.',
      message: fallbackMessage,
      primaryAction: 'Retry connection',
      helpTitle: 'What to check',
      helpBody: 'Confirm the device network or VPN, then retry. Signing out clears the remembered session from secure storage.',
    };
  }

  if (normalizedReason.includes('version')) {
    return {
      title: 'App update required',
      subtitle: 'This build is no longer compatible with the backend runtime policy.',
      message: fallbackMessage,
      primaryAction: 'Check again',
      helpTitle: 'Why this appears',
      helpBody: 'Version recovery prevents a mismatched app and backend from entering a broken authenticated state.',
    };
  }

  if (normalizedReason.includes('config')) {
    return {
      title: 'Configuration required',
      subtitle: 'The mobile runtime is missing a valid backend URL.',
      message: fallbackMessage,
      primaryAction: 'Retry configuration',
      helpTitle: 'Deployment note',
      helpBody: 'Set the Expo API base URL for this build profile, then restart the app.',
    };
  }

  return {
    title: 'Session recovery required',
    subtitle: 'The app avoided restoring a stale or incomplete session state. Use the safe recovery options below.',
    message: fallbackMessage,
    primaryAction: 'Retry recovery',
    helpTitle: 'What this protects against',
    helpBody: 'Stale tokens, broken refresh loops, runtime upgrades, and partially written session data are isolated here instead of freezing the workspace.',
  };
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
