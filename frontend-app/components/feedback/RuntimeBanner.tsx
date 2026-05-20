import { StyleSheet, Text, View } from 'react-native';

import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { useMobileSecurity } from '../../security/MobileSecurityProvider';
import { useLocalization } from '../../localization/LocalizationProvider';
import { theme } from '../../theme';

export function RuntimeBanner() {
  const { t } = useLocalization();
  const {
    runtimeHealth,
    devicePosture,
  } = useOperationalRuntime();
  const mobileSecurity = useMobileSecurity();

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

  if (!devicePosture.suspicious && !mobileSecurity.sensitiveOperationsRestricted) {
    return null;
  }

  return (
    <View style={[styles.banner, styles.danger]}>
      <Text style={styles.title}>{t('runtime.deviceReview')}</Text>
      <Text style={styles.body}>{mobileSecurity.warning ?? t('runtime.suspiciousBody')}</Text>
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
