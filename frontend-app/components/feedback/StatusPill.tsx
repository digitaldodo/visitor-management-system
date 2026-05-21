import { StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization/LocalizationProvider';
import { theme } from '../../theme';

type Props = {
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
};

export function StatusPill({ label, tone = 'default' }: Props) {
  const { tText } = useLocalization();
  const palette = {
    default: [theme.colors.surfaceMuted, theme.colors.textSecondary, theme.colors.border],
    success: [theme.colors.successSoft, theme.colors.success, 'rgba(74, 222, 128, 0.24)'],
    warning: [theme.colors.warningSoft, theme.colors.warning, 'rgba(251, 191, 36, 0.24)'],
    danger: [theme.colors.dangerSoft, theme.colors.danger, 'rgba(248, 113, 113, 0.24)'],
    info: [theme.colors.infoSoft, theme.colors.info, 'rgba(125, 211, 252, 0.24)'],
  } as const;

  const [backgroundColor, color, borderColor] = palette[tone];

  return (
    <View style={[styles.pill, { backgroundColor, borderColor }]}>
      <Text numberOfLines={2} maxFontSizeMultiplier={1.08} style={[styles.label, { color }]}>{tText(label)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
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
