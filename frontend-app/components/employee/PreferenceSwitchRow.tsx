import { StyleSheet, Switch, Text, View } from 'react-native';

import { useLocalization } from '../../localization/LocalizationProvider';
import { theme } from '../../theme';

type Props = {
  label: string;
  helperText: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function PreferenceSwitchRow({ label, helperText, value, onValueChange }: Props) {
  const { tText } = useLocalization();

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{tText(label)}</Text>
        <Text style={styles.helper}>{tText(helperText)}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primarySoft }}
        thumbColor={value ? theme.colors.primary : theme.colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  label: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  helper: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
