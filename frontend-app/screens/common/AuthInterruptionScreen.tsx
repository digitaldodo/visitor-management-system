import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';

export function AuthInterruptionScreen() {
  const auth = useAuth();
  const layout = useResponsiveLayout();
  const interruption = auth.status === 'auth-interrupted' ? auth.interruption : null;

  return (
    <View style={styles.container}>
      <View style={[styles.frame, { maxWidth: layout.isTablet ? 720 : 480 }]}>
        <SurfaceCard
          title="Authentication interrupted"
          subtitle="Your AccessFlow session is still protected on this device."
        >
          <View style={styles.statusRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="finger-print-outline" size={28} color={theme.colors.info} />
            </View>
            <View style={styles.statusCopy}>
              <Text style={styles.message}>
                {interruption?.message || 'Authentication cancelled. Continue securely to retry.'}
              </Text>
              <Text style={styles.context}>
                Retry fingerprint, use Android device unlock when offered, or sign in with your password.
              </Text>
            </View>
          </View>

          {auth.session?.user.fullName ? (
            <View style={styles.operatorBlock}>
              <Text style={styles.operatorLabel}>Protected session</Text>
              <Text style={styles.operatorValue}>{auth.session.user.fullName}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton label="Retry fingerprint" onPress={() => void auth.retryBootstrap()} loading={auth.isBusy} />
            <PrimaryButton label="Use device PIN" onPress={() => void auth.retryBootstrap()} tone="secondary" disabled={auth.isBusy} />
            {interruption?.canUsePassword ? (
              <PrimaryButton label="Sign in with password" onPress={auth.continueWithPasswordSignIn} tone="secondary" disabled={auth.isBusy} />
            ) : null}
          </View>
        </SurfaceCard>
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
  },
  statusRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: theme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.infoSoft,
  },
  statusCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  message: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
    lineHeight: 23,
  },
  context: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
  operatorBlock: {
    gap: 4,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.md,
  },
  operatorLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
  },
  operatorValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  actions: {
    gap: theme.spacing.sm,
  },
});
