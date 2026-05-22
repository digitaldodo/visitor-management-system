import { StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization/LocalizationProvider';
import { theme } from '../../theme';

type Props = {
  label: string;
  value: string;
  muted?: boolean;
};

export function DetailRow({ label, value, muted }: Props) {
  const { tText } = useLocalization();

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{tText(label)}</Text>
      <Text style={[styles.value, muted ? styles.valueMuted : null]}>{tText(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  label: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    flex: 1.3,
    textAlign: 'right',
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  valueMuted: {
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.body.fontWeight,
  },
});
