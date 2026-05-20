import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { EmergencyBanner } from '../feedback/EmergencyBanner';
import { RuntimeBanner } from '../feedback/RuntimeBanner';
import { theme } from '../../theme';
import { KeyboardAwareScreen } from './KeyboardAwareScreen';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => Promise<unknown> | unknown;
  contentMaxWidth?: number;
};

const MIN_PULL_REFRESH_MS = 450;

export function AppScreen({ title, subtitle, children, refreshing, onRefresh, contentMaxWidth }: Props) {
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  const refreshInFlightRef = useRef(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const finishPullRefresh = useCallback((startedAt: number) => {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(0, MIN_PULL_REFRESH_MS - elapsedMs);

    setTimeout(() => {
      refreshInFlightRef.current = false;
      if (mountedRef.current) {
        setPullRefreshing(false);
      }
    }, remainingMs);
  }, []);

  const handlePullRefresh = useCallback(() => {
    if (!onRefresh || refreshInFlightRef.current) {
      return;
    }

    const startedAt = Date.now();
    refreshInFlightRef.current = true;
    setPullRefreshing(true);

    Promise.resolve(onRefresh())
      .catch(() => undefined)
      .finally(() => finishPullRefresh(startedAt));
  }, [finishPullRefresh, onRefresh]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAwareScreen
        alwaysBounceVertical={Boolean(onRefresh)}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          {
            gap: layout.cardSpacing,
            paddingHorizontal: layout.contentPadding,
            paddingTop: layout.isSmallPhone ? theme.spacing.sm : theme.spacing.md,
            paddingBottom: insets.bottom + layout.tabBarHeight + theme.spacing.xxl,
          },
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              colors={[theme.colors.primary]}
              enabled={Boolean(onRefresh)}
              progressBackgroundColor={theme.colors.surface}
              progressViewOffset={layout.isSmallPhone ? 10 : 16}
              refreshing={pullRefreshing && Boolean(refreshing || pullRefreshing)}
              tintColor={theme.colors.primary}
              title=""
              titleColor={theme.colors.textMuted}
              onRefresh={handlePullRefresh}
            />
          ) : undefined
        }
      >
        <View style={[styles.frame, { maxWidth: contentMaxWidth ?? layout.contentMaxWidth, gap: layout.cardSpacing }]}>
          <View style={[styles.header, layout.isSmallPhone ? styles.headerCompact : null]}>
            <View style={styles.brandChrome}>
              <View style={styles.brandLockup}>
                <Image source={require('../../assets/brand-icon.png')} style={styles.brandIcon} resizeMode="contain" />
                <View style={styles.brandCopy}>
                  <Text allowFontScaling={false} style={styles.brandName}>AccessFlow Mobile</Text>
                  <Text allowFontScaling={false} style={styles.brandMeta}>Operational workspace</Text>
                </View>
              </View>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text allowFontScaling={false} style={styles.liveText}>Live</Text>
              </View>
            </View>
            <Text allowFontScaling maxFontSizeMultiplier={1.18} style={[styles.title, layout.isSmallPhone ? styles.titleCompact : null]}>{title}</Text>
            {subtitle ? <Text allowFontScaling maxFontSizeMultiplier={1.12} style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <RuntimeBanner />
          <EmergencyBanner />
          <View style={[styles.children, { gap: layout.cardSpacing }]}>{children}</View>
        </View>
      </KeyboardAwareScreen>
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
  },
  frame: {
    width: '100%',
  },
  header: {
    gap: theme.spacing.sm,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.md,
  },
  headerCompact: {
    gap: theme.spacing.xs,
  },
  brandChrome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  brandLockup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.md,
  },
  brandCopy: {
    flex: 1,
    gap: 2,
  },
  brandName: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  brandMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm,
    minHeight: 30,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.success,
  },
  liveText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
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
