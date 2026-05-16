import { StyleSheet, Text, View } from 'react-native';

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
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {status ? <StatusPill label={status} tone={tone} /> : null}
      </View>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
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
