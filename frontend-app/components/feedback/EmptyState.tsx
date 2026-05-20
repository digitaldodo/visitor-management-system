import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../theme';

type Props = {
  title: string;
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'default' | 'warning' | 'danger' | 'success';
};

export function EmptyState({ title, body, icon = 'file-tray-outline', actionLabel, onAction, tone = 'default' }: Props) {
  const toneColor = tone === 'warning'
    ? theme.colors.warning
    : tone === 'danger'
      ? theme.colors.danger
      : tone === 'success'
        ? theme.colors.success
        : theme.colors.info;

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { borderColor: toneColor, backgroundColor: softTone(tone) }]}>
        <Ionicons name={icon} size={24} color={toneColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward-outline" size={16} color={theme.colors.info} />
        </Pressable>
      ) : null}
    </View>
  );
}

function softTone(tone: Props['tone']) {
  if (tone === 'warning') {
    return theme.colors.warningSoft;
  }
  if (tone === 'danger') {
    return theme.colors.dangerSoft;
  }
  if (tone === 'success') {
    return theme.colors.successSoft;
  }
  return theme.colors.infoSoft;
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.lg,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  action: {
    alignSelf: 'flex-start',
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.md,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
});
