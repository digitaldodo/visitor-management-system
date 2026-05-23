import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useLocalization } from '../../localization/LocalizationProvider';
import { theme } from '../../theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
};

export function PrimaryButton({ label, onPress, disabled, loading, tone = 'primary' }: Props) {
  const layout = useResponsiveLayout();
  const { tText } = useLocalization();
  const translatedLabel = tText(label);
  const toneStyles = {
    primary: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primaryLine,
      labelColor: theme.colors.textInverse,
    },
    secondary: {
      backgroundColor: theme.colors.surfaceRaised,
      borderColor: theme.colors.border,
      labelColor: theme.colors.textPrimary,
    },
    danger: {
      backgroundColor: theme.colors.danger,
      borderColor: theme.colors.danger,
      labelColor: theme.colors.textInverse,
    },
  }[tone];

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled || loading}
      hitSlop={6}
      onPress={onPress}
      android_ripple={{ color: tone === 'primary' || tone === 'danger' ? 'rgba(255,255,255,0.18)' : theme.colors.primarySoft }}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: layout.touchTarget,
          backgroundColor: toneStyles.backgroundColor,
          borderColor: toneStyles.borderColor,
          opacity: disabled ? 0.55 : pressed ? 0.82 : 1,
        },
      ]}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={toneStyles.labelColor} />
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82} maxFontSizeMultiplier={1.12} style={[styles.label, { color: toneStyles.labelColor }]}>{translatedLabel}</Text>
        </View>
      ) : (
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82} maxFontSizeMultiplier={1.12} style={[styles.label, { color: toneStyles.labelColor }]}>{translatedLabel}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    ...theme.shadows.card,
  },
  label: {
    maxWidth: '100%',
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
    textAlign: 'center',
  },
  loadingRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
