import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 12}
        style={styles.flex}
      >
        <ScrollView
          alwaysBounceVertical={false}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          overScrollMode="auto"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            {
              gap: layout.cardSpacing,
              paddingHorizontal: layout.contentPadding,
              paddingTop: layout.isSmallPhone ? theme.spacing.sm : theme.spacing.md,
              paddingBottom: insets.bottom + layout.tabBarHeight + theme.spacing.lg,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.colors.primary} />
            ) : undefined
          }
        >
          <View style={[styles.frame, { maxWidth: contentMaxWidth ?? layout.contentMaxWidth, gap: layout.cardSpacing }]}>
            <View style={[styles.header, layout.isSmallPhone ? styles.headerCompact : null]}>
              <Text allowFontScaling maxFontSizeMultiplier={1.18} style={[styles.title, layout.isSmallPhone ? styles.titleCompact : null]}>{title}</Text>
              {subtitle ? <Text allowFontScaling maxFontSizeMultiplier={1.12} style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <RuntimeBanner />
            <View style={[styles.children, { gap: layout.cardSpacing }]}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
  },
  flex: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
  },
  frame: {
    width: '100%',
  },
  header: {
    gap: theme.spacing.sm,
  },
  headerCompact: {
    gap: theme.spacing.xs,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title.fontSize,
    fontWeight: theme.typography.title.fontWeight,
  },
  titleCompact: {
    fontSize: 22,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  children: {
  },
});
