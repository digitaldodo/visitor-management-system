import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { RuntimeBanner } from '../feedback/RuntimeBanner';
import { theme } from '../../theme';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentMaxWidth?: number;
};

export function AppScreen({ title, subtitle, children, refreshing, onRefresh, contentMaxWidth }: Props) {
  const layout = useResponsiveLayout();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: layout.contentPadding,
            paddingBottom: layout.isTablet ? theme.spacing.xxl + theme.spacing.sm : theme.spacing.xxl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          ) : undefined
        }
      >
        <View style={[styles.frame, { maxWidth: contentMaxWidth ?? layout.contentMaxWidth }]}>
          <View style={styles.header}>
            <Text allowFontScaling style={styles.title}>{title}</Text>
            {subtitle ? <Text allowFontScaling style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <RuntimeBanner />
          <View style={styles.children}>{children}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
  },
  content: {
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  frame: {
    width: '100%',
    gap: theme.spacing.lg,
  },
  header: {
    gap: theme.spacing.sm,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title.fontSize,
    fontWeight: theme.typography.title.fontWeight,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  children: {
    gap: theme.spacing.lg,
  },
});
