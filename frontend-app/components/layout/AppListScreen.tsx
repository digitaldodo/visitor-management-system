import { useCallback, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, Text, View, type FlatListProps, type ListRenderItem } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useLocalization } from '../../localization/LocalizationProvider';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { useSensitiveScreenProtection } from '../../security/MobileSecurityProvider';
import { EmergencyBanner } from '../feedback/EmergencyBanner';
import { RuntimeBanner } from '../feedback/RuntimeBanner';
import { FadeSlideView } from '../motion/FadeSlideView';
import { theme } from '../../theme';

type Props<T> = Omit<FlatListProps<T>, 'data' | 'renderItem' | 'ListHeaderComponent' | 'refreshControl'> & {
  title: string;
  subtitle?: string;
  data: T[];
  renderItem: ListRenderItem<T>;
  headerContent?: ReactNode;
  emptyComponent?: ReactElement | null;
  refreshing?: boolean;
  onRefresh?: () => Promise<unknown> | unknown;
  contentMaxWidth?: number;
  sensitive?: boolean;
  sensitiveReason?: string;
};

const MIN_PULL_REFRESH_MS = 450;

export function AppListScreen<T>({
  title,
  subtitle,
  data,
  renderItem,
  headerContent,
  emptyComponent,
  refreshing,
  onRefresh,
  contentMaxWidth,
  sensitive,
  sensitiveReason,
  contentContainerStyle,
  ...flatListProps
}: Props<T>) {
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const { t, tText } = useLocalization();
  const { devicePosture, offlineOperationalMode } = useOperationalRuntime();
  const refreshInFlightRef = useRef(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  useSensitiveScreenProtection(sensitiveReason ?? title, Boolean(sensitive));

  const finishPullRefresh = useCallback((startedAt: number) => {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(0, MIN_PULL_REFRESH_MS - elapsedMs);
    setTimeout(() => {
      refreshInFlightRef.current = false;
      setPullRefreshing(false);
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
      <FlatList
        data={data}
        renderItem={renderItem}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            gap: layout.cardSpacing,
            paddingHorizontal: layout.contentPadding,
            paddingTop: layout.isSmallPhone ? theme.spacing.sm : theme.spacing.md,
            paddingBottom: insets.bottom + layout.tabBarHeight + theme.spacing.xxl,
          },
          contentContainerStyle,
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
        ListHeaderComponent={(
          <View style={[styles.frame, { maxWidth: contentMaxWidth ?? layout.contentMaxWidth, gap: layout.cardSpacing }]}>
            <FadeSlideView style={[styles.header, layout.isSmallPhone ? styles.headerCompact : null]}>
              <View style={styles.brandChrome}>
                <View style={styles.brandLockup}>
                  <Image source={require('../../assets/brand-icon.png')} style={styles.brandIcon} resizeMode="contain" />
                  <View style={styles.brandCopy}>
                    <Text allowFontScaling={false} style={styles.brandName}>AccessFlow Mobile</Text>
                    <Text allowFontScaling={false} style={styles.brandMeta}>{t('app.brandMeta')}</Text>
                  </View>
                </View>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text allowFontScaling={false} style={styles.liveText}>{t('common.live')}</Text>
                </View>
              </View>
              <Text allowFontScaling maxFontSizeMultiplier={1.18} style={[styles.title, layout.isSmallPhone ? styles.titleCompact : null]}>{tText(title)}</Text>
              {subtitle ? <Text allowFontScaling maxFontSizeMultiplier={1.12} style={styles.subtitle}>{tText(subtitle)}</Text> : null}
              {devicePosture.operationalModeEnabled ? (
                <View style={styles.operationalIndicatorRow}>
                  <View style={styles.operationalIndicator}>
                    <Text allowFontScaling={false} style={styles.operationalIndicatorText}>
                      Operational mode
                    </Text>
                  </View>
                  {devicePosture.checkpointName ? (
                    <View style={styles.operationalIndicator}>
                      <Text allowFontScaling={false} style={styles.operationalIndicatorText}>{devicePosture.checkpointName}</Text>
                    </View>
                  ) : null}
                  <View style={styles.operationalIndicator}>
                    <Text allowFontScaling={false} style={styles.operationalIndicatorText}>
                      {offlineOperationalMode === 'online' ? t('common.ready') : t('common.reconnecting')}
                    </Text>
                  </View>
                </View>
              ) : null}
            </FadeSlideView>
            <FadeSlideView delayMs={70}>
              <RuntimeBanner />
            </FadeSlideView>
            <FadeSlideView delayMs={110}>
              <EmergencyBanner />
            </FadeSlideView>
            {headerContent ? <FadeSlideView delayMs={140} style={{ gap: layout.cardSpacing }}>{headerContent}</FadeSlideView> : null}
          </View>
        )}
        ListEmptyComponent={emptyComponent}
        {...flatListProps}
      />
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
  operationalIndicatorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  operationalIndicator: {
    minHeight: 28,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.sm,
    justifyContent: 'center',
  },
  operationalIndicatorText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
