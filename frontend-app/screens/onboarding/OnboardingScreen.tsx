import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useMemo, useRef, useState } from 'react';
import { Image, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { FadeSlideView } from '../../components/motion/FadeSlideView';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { writeOnboardingComplete } from '../../storage/onboardingStorage';
import { theme } from '../../theme';

const slides = [
  {
    eyebrow: 'Visitor operations',
    title: 'Run every front desk workflow with confidence',
    body: 'Register visitors, track requests, and keep approved access visible across reception, security, employee, and admin roles.',
    icon: 'people-outline',
    signals: ['Visitor records', 'Host routing', 'Live activity'],
  },
  {
    eyebrow: 'QR access',
    title: 'Fast badge checks for controlled entry',
    body: 'Scan visitor passes and workforce credentials with clear validation states, supervised overrides, and audit-ready outcomes.',
    icon: 'qr-code-outline',
    signals: ['Secure scans', 'Badge status', 'Manual recovery'],
  },
  {
    eyebrow: 'Approvals',
    title: 'Keep decisions moving without losing control',
    body: 'Surface pending approvals, denials, incidents, and operational alerts so the right team can respond quickly.',
    icon: 'checkmark-done-outline',
    signals: ['Approvals', 'Incident alerts', 'Role-aware routing'],
  },
  {
    eyebrow: 'Offline support',
    title: 'Stay useful when connectivity is degraded',
    body: 'Known operational records can remain available offline, while queued actions sync back for backend confirmation.',
    icon: 'cloud-offline-outline',
    signals: ['Cached records', 'Queued sync', 'Provisional access'],
  },
] as const;

export function OnboardingScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const contentWidth = layout.width;
  const activeSlide = slides[activeIndex] ?? slides[0];
  const isLastSlide = activeIndex === slides.length - 1;

  const permissionHighlights = useMemo(() => [
    { icon: 'camera-outline' as const, label: 'Camera', body: 'QR verification and identity photos' },
    { icon: 'notifications-outline' as const, label: 'Notifications', body: 'Approvals, incidents, and sync updates' },
    { icon: 'images-outline' as const, label: 'Files', body: 'Selected credential and profile images' },
    { icon: 'finger-print-outline' as const, label: 'Biometric', body: 'Trusted-session unlock on supported devices' },
  ], []);

  const finish = async () => {
    await writeOnboardingComplete();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const next = () => {
    if (isLastSlide) {
      void finish();
      return;
    }
    const nextIndex = Math.min(activeIndex + 1, slides.length - 1);
    scrollRef.current?.scrollTo({ x: nextIndex * contentWidth, animated: true });
    setActiveIndex(nextIndex);
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / contentWidth);
    setActiveIndex(Math.min(Math.max(nextIndex, 0), slides.length - 1));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View
        style={[
          styles.container,
          {
            paddingTop: layout.isCompactHeight ? theme.spacing.sm : theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.lg,
          },
        ]}
      >
        <View style={[styles.topBar, { paddingHorizontal: layout.contentPadding }]}>
          <View style={styles.brandMark}>
            <Image source={require('../../assets/brand-icon.png')} style={styles.brandIcon} resizeMode="contain" />
          </View>
          <Pressable accessibilityRole="button" onPress={() => void finish()} hitSlop={8} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={16}
        >
          {slides.map((slide, index) => (
            <View key={slide.title} style={[styles.slide, { width: contentWidth, paddingHorizontal: layout.contentPadding }]}>
              <FadeSlideView delayMs={80} style={styles.illustration}>
                <View style={styles.orbit}>
                  <View style={styles.phoneFrame}>
                    <View style={styles.phoneHeader}>
                      <View style={styles.phoneDot} />
                      <View style={styles.phoneLine} />
                    </View>
                    <View style={styles.phonePanel}>
                      <Ionicons name={slide.icon} size={48} color={theme.colors.info} />
                      <View style={styles.phoneRows}>
                        <View style={styles.phoneRowWide} />
                        <View style={styles.phoneRow} />
                        <View style={styles.phoneRowShort} />
                      </View>
                    </View>
                  </View>
                  <View style={[styles.floatBadge, styles.floatBadgeTop]}>
                    <Ionicons name="lock-closed-outline" size={17} color={theme.colors.success} />
                  </View>
                  <View style={[styles.floatBadge, styles.floatBadgeBottom]}>
                    <Ionicons name="pulse-outline" size={17} color={theme.colors.warning} />
                  </View>
                </View>
              </FadeSlideView>

              <FadeSlideView delayMs={160} style={styles.copyBlock}>
                <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
                <Text maxFontSizeMultiplier={1.12} style={[styles.title, layout.isSmallPhone ? styles.titleCompact : null]}>{slide.title}</Text>
                <Text maxFontSizeMultiplier={1.08} style={styles.body}>{slide.body}</Text>
                <View style={styles.signalRow}>
                  {slide.signals.map((signal) => (
                    <View key={signal} style={styles.signalChip}>
                      <Text numberOfLines={1} style={styles.signalText}>{signal}</Text>
                    </View>
                  ))}
                </View>
              </FadeSlideView>

              {index === slides.length - 1 ? (
                <FadeSlideView delayMs={220} style={styles.permissionGrid}>
                  {permissionHighlights.map((item) => (
                    <View key={item.label} style={styles.permissionTile}>
                      <Ionicons name={item.icon} size={20} color={theme.colors.info} />
                      <View style={styles.permissionCopy}>
                        <Text style={styles.permissionLabel}>{item.label}</Text>
                        <Text style={styles.permissionBody}>{item.body}</Text>
                      </View>
                    </View>
                  ))}
                </FadeSlideView>
              ) : null}
            </View>
          ))}
        </ScrollView>

        <View style={[styles.footer, { paddingHorizontal: layout.contentPadding }]}>
          <View style={styles.dots}>
            {slides.map((slide, index) => (
              <View
                key={slide.title}
                style={[styles.dot, activeIndex === index ? styles.dotActive : null]}
              />
            ))}
          </View>
          <PrimaryButton label={isLastSlide ? 'Start secure sign-in' : 'Continue'} onPress={next} />
          <View style={styles.legalRow}>
            <Pressable accessibilityRole="link" onPress={() => navigation.navigate('Legal', { type: 'privacy' })} hitSlop={8}>
              <Text style={styles.legalText}>Privacy Policy</Text>
            </Pressable>
            <Text style={styles.legalDivider}>/</Text>
            <Pressable accessibilityRole="link" onPress={() => navigation.navigate('Legal', { type: 'terms' })} hitSlop={8}>
              <Text style={styles.legalText}>Terms</Text>
            </Pressable>
          </View>
          <Text style={styles.contextLine}>{activeSlide.eyebrow} for enterprise mobile operations</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
  },
  container: {
    flex: 1,
  },
  topBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    overflow: 'hidden',
  },
  brandIcon: {
    width: 39,
    height: 39,
  },
  skipButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  skipText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.spacing.xl,
  },
  illustration: {
    alignItems: 'center',
  },
  orbit: {
    width: '100%',
    maxWidth: 430,
    aspectRatio: 1.18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    overflow: 'hidden',
  },
  phoneFrame: {
    width: '52%',
    minWidth: 190,
    maxWidth: 250,
    aspectRatio: 0.62,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  phoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  phoneDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.success,
  },
  phoneLine: {
    flex: 1,
    height: 8,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceRaised,
  },
  phonePanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  phoneRows: {
    width: '72%',
    gap: theme.spacing.xs,
  },
  phoneRowWide: {
    height: 10,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(248, 251, 255, 0.62)',
  },
  phoneRow: {
    height: 10,
    width: '82%',
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(175, 189, 209, 0.62)',
  },
  phoneRowShort: {
    height: 10,
    width: '56%',
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(20, 184, 166, 0.50)',
  },
  floatBadge: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
  },
  floatBadgeTop: {
    top: '17%',
    right: '22%',
  },
  floatBadgeBottom: {
    bottom: '18%',
    left: '22%',
  },
  copyBlock: {
    gap: theme.spacing.sm,
  },
  eyebrow: {
    color: theme.colors.info,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
  titleCompact: {
    fontSize: 25,
    lineHeight: 31,
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 23,
  },
  signalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  signalChip: {
    minHeight: 32,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  signalText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  permissionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  permissionTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.sm,
  },
  permissionCopy: {
    flex: 1,
    gap: 2,
  },
  permissionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  permissionBody: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  footer: {
    gap: theme.spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.surfaceRaised,
  },
  dotActive: {
    width: 28,
    backgroundColor: theme.colors.primary,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  legalText: {
    color: theme.colors.info,
    fontSize: 13,
    fontWeight: '800',
  },
  legalDivider: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  contextLine: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
