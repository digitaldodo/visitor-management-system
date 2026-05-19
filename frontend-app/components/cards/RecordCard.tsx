import { StyleSheet, Text, View } from 'react-native';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';
import { StatusPill } from '../feedback/StatusPill';

type Props = {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  status?: string | null;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
};

export function RecordCard({ title, subtitle, meta, status, tone = 'default' }: Props) {
  const layout = useResponsiveLayout();

  return (
    <View style={styles.card}>
      <View style={[styles.header, layout.isSmallPhone ? styles.headerCompact : null]}>
        <View style={styles.titleWrap}>
          <Text maxFontSizeMultiplier={1.1} style={styles.title}>{title}</Text>
          {subtitle ? <Text maxFontSizeMultiplier={1.08} style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {status ? <StatusPill label={status} tone={tone} /> : null}
      </View>
      {meta ? <Text maxFontSizeMultiplier={1.08} style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  headerCompact: {
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  titleWrap: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
});
