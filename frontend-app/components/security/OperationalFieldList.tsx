import { StyleSheet, Text, View } from 'react-native';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';

type Item = {
  label: string;
  value?: string | null;
};

export function OperationalFieldList({ items }: { items: Item[] }) {
  const layout = useResponsiveLayout();

  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <View key={item.label} style={[styles.item, { minWidth: layout.isPhone ? '100%' : '45%' }]}>
          <Text maxFontSizeMultiplier={1.08} style={styles.label}>{item.label}</Text>
          <Text maxFontSizeMultiplier={1.08} style={styles.value}>{item.value || 'Not recorded'}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  item: {
    flexGrow: 1,
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
});
