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
      subtitle: 'AccessFlow kept your saved session protected while the service connection is restored.',
      message: fallbackMessage,
      primaryAction: 'Retry connection',
      helpTitle: 'What to check',
      helpBody: 'Confirm the device network or VPN, then retry. Signing out removes the remembered session from this device.',
    };
  }

  if (normalizedReason.includes('version')) {
    return {
      title: 'App update required',
      subtitle: 'Your organization requires a newer AccessFlow build before this workspace can resume.',
      message: fallbackMessage,
      primaryAction: 'Check again',
      helpTitle: 'Why this appears',
      helpBody: 'This protects operational data when mobile and backend security policies no longer match.',
    };
  }

  if (normalizedReason.includes('config')) {
    return {
      title: 'Configuration required',
      subtitle: 'This AccessFlow build needs a valid service configuration before sign-in.',
      message: fallbackMessage,
      primaryAction: 'Retry configuration',
      helpTitle: 'Deployment note',
      helpBody: 'Set the Expo API base URL for this build profile, then restart the app.',
    };
  }

  return {
    title: 'Restoring session',
    subtitle: 'AccessFlow is checking the saved workspace before reopening it.',
    message: fallbackMessage,
    primaryAction: 'Retry recovery',
    helpTitle: 'What to expect',
    helpBody: 'Most recovery issues clear after the service connection or session state refreshes. Signing out only clears this device.',
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
