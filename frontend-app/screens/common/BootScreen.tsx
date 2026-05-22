import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

import { ShimmerSkeleton } from '../../components/feedback/LoadingState';
import { theme } from '../../theme';

export function BootScreen() {
  const scale = useRef(new Animated.Value(0.96)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.02,
            duration: 1200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.96,
            duration: 1200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]).start();
  }, [opacity, scale]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.badge, { opacity, transform: [{ scale }] }]}>
        <View style={styles.logoShell}>
          <Image source={require('../../assets/brand-icon.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <Image source={require('../../assets/brand-wordmark.png')} style={styles.wordmark} resizeMode="contain" />
        <View style={styles.badgePill}>
          <Ionicons name="shield-checkmark-outline" size={15} color={theme.colors.info} />
          <Text style={styles.badgeLabel}>Mobile operations</Text>
        </View>
      </Animated.View>
      <Text style={styles.title}>Preparing your workspace</Text>
      <Text style={styles.subtitle}>
        AccessFlow is loading your mobile session.
      </Text>
      <View style={styles.loadingBlock}>
        <ShimmerSkeleton rows={3} compact />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.canvas,
  },
  badge: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  logoShell: {
    width: 92,
    height: 92,
    borderRadius: theme.radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  logo: {
    width: 72,
    height: 72,
  },
  wordmark: {
    width: 240,
    height: 64,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
  },
  badgeLabel: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title.fontSize,
    fontWeight: theme.typography.title.fontWeight,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
    textAlign: 'center',
  },
  loadingBlock: {
    width: '100%',
    maxWidth: 280,
  },
});
