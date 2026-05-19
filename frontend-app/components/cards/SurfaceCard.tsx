import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';

type Props = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

export function SurfaceCard({ title, subtitle, children }: Props) {
  const layout = useResponsiveLayout();

  return (
    <View style={[styles.card, { gap: layout.cardSpacing, padding: layout.cardPadding }]}>
      {(title || subtitle) ? (
        <View style={styles.header}>
          {title ? <Text allowFontScaling maxFontSizeMultiplier={1.14} style={[styles.title, layout.isSmallPhone ? styles.titleCompact : null]}>{title}</Text> : null}
          {subtitle ? <Text allowFontScaling maxFontSizeMultiplier={1.1} style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.card,
  },
  header: {
    gap: theme.spacing.xs,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  titleCompact: {
    fontSize: 18,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
