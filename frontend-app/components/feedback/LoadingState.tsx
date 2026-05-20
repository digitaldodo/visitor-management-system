import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';

type SkeletonProps = {
  rows?: number;
  compact?: boolean;
};

type OperationalLoadingProps = {
  title?: string;
  body?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children?: ReactNode;
};

export function ShimmerSkeleton({ rows = 3, compact }: SkeletonProps) {
  const opacity = useShimmerOpacity();

  return (
    <View style={styles.skeletonBlock} accessibilityRole="progressbar">
      {Array.from({ length: rows }).map((_, index) => (
        <Animated.View
          key={index}
          style={[
            styles.skeletonLine,
            compact ? styles.skeletonLineCompact : null,
            index === rows - 1 ? styles.skeletonLineShort : null,
            { opacity },
          ]}
        />
      ))}
    </View>
  );
}

export function SkeletonCard({ rows = 4 }: SkeletonProps) {
  const layout = useResponsiveLayout();
  const opacity = useShimmerOpacity();

  return (
    <View style={[styles.skeletonCard, { padding: layout.cardPadding, gap: layout.cardSpacing }]}>
      <View style={styles.skeletonHeader}>
        <Animated.View style={[styles.skeletonIcon, { opacity }]} />
        <View style={styles.skeletonCopy}>
          <ShimmerSkeleton rows={2} compact />
        </View>
      </View>
      <ShimmerSkeleton rows={rows} />
    </View>
  );
}

export function OperationalLoadingState({
  title = 'Preparing workspace',
  body = 'AccessFlow is loading operational data and restoring a secure mobile session.',
  icon = 'sync-circle-outline',
  children,
}: OperationalLoadingProps) {
  const opacity = useShimmerOpacity();

  return (
    <View style={styles.loadingState} accessibilityRole="progressbar">
      <Animated.View style={[styles.loadingIcon, { opacity }]}>
        <Ionicons name={icon} size={24} color={theme.colors.info} />
      </Animated.View>
      <Text style={styles.loadingTitle}>{title}</Text>
      <Text style={styles.loadingBody}>{body}</Text>
      {children ?? <ShimmerSkeleton rows={3} />}
    </View>
  );
}

function useShimmerOpacity() {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  return shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0.86] });
}

const styles = StyleSheet.create({
  skeletonBlock: {
    gap: theme.spacing.sm,
  },
  skeletonLine: {
    height: 16,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(191, 219, 254, 0.16)',
  },
  skeletonLineCompact: {
    height: 12,
  },
  skeletonLineShort: {
    width: '68%',
  },
  skeletonCard: {
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  skeletonIcon: {
    width: 46,
    height: 46,
    borderRadius: theme.radii.md,
    backgroundColor: 'rgba(125, 211, 252, 0.16)',
  },
  skeletonCopy: {
    flex: 1,
  },
  loadingState: {
    gap: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.lg,
  },
  loadingIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  loadingTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  loadingBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
