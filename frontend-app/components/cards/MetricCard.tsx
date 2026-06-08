import { StyleSheet, Text, View } from 'react-native';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useLocalization } from '../../localization/LocalizationProvider';
import { theme } from '../../theme';

type Props = {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
};

export function MetricCard({ label, value, tone = 'default' }: Props) {
  const layout = useResponsiveLayout();
  const { tText } = useLocalization();
  const accent = {
    default: theme.colors.surfaceMuted,
    success: theme.colors.successSoft,
    warning: theme.colors.warningSoft,
    danger: theme.colors.dangerSoft,
    info: theme.colors.infoSoft,
  }[tone];

  return (
    <View style={[styles.card, { backgroundColor: accent, minWidth: layout.isSmallPhone ? 128 : 140, padding: layout.isSmallPhone ? theme.spacing.sm : theme.spacing.md }]}>
      <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82} maxFontSizeMultiplier={1.08} style={styles.label}>{tText(label)}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.74} style={[styles.value, layout.isSmallPhone ? styles.valueCompact : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  label: {
    minHeight: 30,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  value: {
    maxWidth: '100%',
    color: theme.colors.textPrimary,
    fontSize: theme.typography.metric.fontSize,
    fontWeight: theme.typography.metric.fontWeight,
  },
  valueCompact: {
    fontSize: 24,
  },
});
