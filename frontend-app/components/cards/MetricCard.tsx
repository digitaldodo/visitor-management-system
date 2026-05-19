import { StyleSheet, Text, View } from 'react-native';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';

type Props = {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

export function MetricCard({ label, value, tone = 'default' }: Props) {
  const layout = useResponsiveLayout();
  const accent = {
    default: theme.colors.primarySoft,
    success: theme.colors.successSoft,
    warning: theme.colors.warningSoft,
    danger: theme.colors.dangerSoft,
  }[tone];

  return (
    <View style={[styles.card, { backgroundColor: accent, minWidth: layout.isSmallPhone ? 132 : 144, padding: layout.isSmallPhone ? theme.spacing.sm : theme.spacing.md }]}>
      <Text numberOfLines={2} maxFontSizeMultiplier={1.08} style={styles.label}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.value, layout.isSmallPhone ? styles.valueCompact : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: theme.spacing.xs,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.metric.fontSize,
    fontWeight: theme.typography.metric.fontWeight,
  },
  valueCompact: {
    fontSize: 24,
  },
});
