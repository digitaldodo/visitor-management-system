import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../../theme';

type Props = {
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
};

export function StatusPill({ label, tone = 'default' }: Props) {
  const palette = {
    default: [theme.colors.surfaceMuted, theme.colors.textPrimary],
    success: [theme.colors.successSoft, theme.colors.success],
    warning: [theme.colors.warningSoft, theme.colors.warning],
    danger: [theme.colors.dangerSoft, theme.colors.danger],
    info: [theme.colors.infoSoft, theme.colors.info],
  } as const;

  const [backgroundColor, color] = palette[tone];

  return (
    <View style={[styles.pill, { backgroundColor }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  label: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
