import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useLocalization } from '../../localization/LocalizationProvider';
import { theme } from '../../theme';

type Props = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

export function SurfaceCard({ title, subtitle, children }: Props) {
  const layout = useResponsiveLayout();
  const { tText } = useLocalization();
  const translatedTitle = tText(title);
  const translatedSubtitle = tText(subtitle);

  return (
    <View style={[styles.card, { gap: layout.cardSpacing, padding: layout.cardPadding }]}>
      {(translatedTitle || translatedSubtitle) ? (
        <View style={styles.header}>
          {translatedTitle ? <Text allowFontScaling maxFontSizeMultiplier={1.14} style={[styles.title, layout.isSmallPhone ? styles.titleCompact : null]}>{translatedTitle}</Text> : null}
          {translatedSubtitle ? <Text allowFontScaling maxFontSizeMultiplier={1.1} style={styles.subtitle}>{translatedSubtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
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
