import { StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization/LocalizationProvider';
import { theme } from '../../theme';

type Props = {
  label: string;
  tone?: keyof typeof theme.statusTones;
};

export function StatusPill({ label, tone = 'default' }: Props) {
  const { tText } = useLocalization();
  const palette = theme.statusTones[tone] ?? theme.statusTones.default;

  return (
    <View style={[styles.pill, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <View style={[styles.indicator, { backgroundColor: palette.indicator }]} />
      <Text numberOfLines={2} maxFontSizeMultiplier={1.08} style={[styles.label, { color: palette.foreground }]}>{tText(label)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: theme.radii.pill,
  },
  label: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
});
