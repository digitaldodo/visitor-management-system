import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import type { EmployeeBadge } from '../../types/domain';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';
import { formatDateTime, formatShift } from '../../utils/employeeFormatting';
import { DetailRow } from './DetailRow';
import { StatusPill } from '../feedback/StatusPill';

type BadgeNetworkMode = 'online' | 'degraded' | 'offline';
type BadgeQrVariant = 'dynamic' | 'fallback';

type Props = {
  badge: EmployeeBadge;
  compact?: boolean;
  networkMode?: BadgeNetworkMode;
  qrVariant?: BadgeQrVariant;
};

type CredentialState = {
  label: string;
  tone: 'default' | 'success' | 'warning' | 'danger' | 'info';
  markerColor: string;
  liveLabel: string;
};

const BRAND_PALETTE = [
  ['#153E75', '#14B8A6', '#DDE7FF'],
  ['#172554', '#F59E0B', '#E0F2FE'],
  ['#0F3B36', '#4F7CFF', '#DCFCE7'],
  ['#3B1D5F', '#22C55E', '#F3E8FF'],
  ['#263238', '#38BDF8', '#F8FAFC'],
] as const;

export function EmployeeBadgeCard({ badge, compact = false, networkMode = 'online', qrVariant = 'dynamic' }: Props) {
  const layout = useResponsiveLayout();
  const [now, setNow] = useState(() => Date.now());
  const pulse = useRef(new Animated.Value(0)).current;
  const watermark = useRef(new Animated.Value(0)).current;

  const brand = useMemo(() => organizationPalette(badge.organizationCode || badge.organizationName || badge.fullName), [
    badge.fullName,
    badge.organizationCode,
    badge.organizationName,
  ]);
  const remainingSeconds = secondsUntil(badge.qrExpiresAt, now);
  const state = credentialState(badge, remainingSeconds, networkMode);
  const qrImage = qrVariant === 'fallback' ? badge.staticFallbackQrImageDataUri || badge.qrImageDataUri : badge.qrImageDataUri;
  const issuedCopy = formatDateTime(badge.issuedAt, badge.organizationTimezone);
  const validatedCopy = formatDateTime(badge.lastValidatedAt || badge.serverTime, badge.organizationTimezone);
  const rotate = watermark.interpolate({ inputRange: [0, 1], outputRange: ['-5deg', '5deg'] });
  const markerScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] });
  const markerOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.68, 1] });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ]),
    );
    const watermarkAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(watermark, { toValue: 1, duration: 4200, useNativeDriver: true }),
        Animated.timing(watermark, { toValue: 0, duration: 4200, useNativeDriver: true }),
      ]),
    );
    pulseAnimation.start();
    watermarkAnimation.start();
    return () => {
      pulseAnimation.stop();
      watermarkAnimation.stop();
    };
  }, [pulse, watermark]);

  return (
    <View style={[styles.card, { padding: layout.cardPadding }, compact ? styles.cardCompact : null]}>
      <View style={[styles.brandPanel, { backgroundColor: brand[0], borderColor: `${brand[1]}55` }]}>
        <View style={[styles.brandRail, { backgroundColor: brand[1] }]} />
        <View style={[styles.brandGlow, { backgroundColor: `${brand[1]}2A` }]} />
        <Animated.Text
          pointerEvents="none"
          style={[styles.watermark, { color: `${brand[2]}20`, transform: [{ rotate }] }]}
        >
          VERIFIED
        </Animated.Text>

        <View style={[styles.header, layout.isSmallPhone ? styles.headerCompact : null]}>
          <View style={[styles.identityRow, layout.isSmallPhone ? styles.identityRowCompact : null]}>
            {badge.employeePhotoUrl ? <Image source={{ uri: badge.employeePhotoUrl }} style={styles.avatar} /> : <AvatarFallback fullName={badge.fullName} brandColor={brand[1]} />}
            <View style={styles.identityCopy}>
              <Text maxFontSizeMultiplier={1.08} style={[styles.organization, { color: brand[2] }]}>
                {badge.organizationName || badge.organizationCode || 'AccessFlow'}
              </Text>
              <Text maxFontSizeMultiplier={1.1} style={[styles.name, layout.isSmallPhone ? styles.nameCompact : null]}>
                {badge.fullName}
              </Text>
              <Text maxFontSizeMultiplier={1.06} style={styles.meta}>
                {[badge.department, badge.designation].filter(Boolean).join(' / ') || 'Operational employee'}
              </Text>
            </View>
          </View>
          <View style={styles.statusStack}>
            <StatusPill label={state.label} tone={state.tone} />
            <View style={styles.liveRow}>
              <Animated.View style={[styles.liveDot, { backgroundColor: state.markerColor, opacity: markerOpacity, transform: [{ scale: markerScale }] }]} />
              <Text style={styles.liveText}>{state.liveLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.securityStrip}>
          <Text style={styles.securityLabel}>Credential</Text>
          <Text style={styles.securityValue}>{badge.checkpointMarker || badge.employeeId || 'ACCESSFLOW'}</Text>
          <Text style={styles.securityLabel}>{qrVariant === 'fallback' ? 'Offline fallback' : 'Dynamic QR'}</Text>
        </View>
      </View>

      <View style={[styles.qrShell, state.tone === 'danger' ? styles.qrShellDanger : state.tone === 'warning' ? styles.qrShellWarning : null]}>
        <View style={styles.qrHeader}>
          <View>
            <Text style={styles.qrTitle}>{qrVariant === 'fallback' ? 'Offline Cached QR' : 'Live Validation QR'}</Text>
            <Text style={styles.qrSubtitle}>
              {qrVariant === 'fallback' ? 'Use only during approved connectivity loss' : `Refreshes in ${formatCountdown(remainingSeconds)}`}
            </Text>
          </View>
          <View style={[styles.rotatingMarker, { borderColor: state.markerColor }]}>
            <Ionicons name={networkMode === 'offline' ? 'cloud-offline-outline' : 'shield-checkmark'} size={18} color={state.markerColor} />
          </View>
        </View>
        {qrImage ? <Image source={{ uri: qrImage }} style={[styles.qrImage, { maxHeight: layout.isTablet ? 360 : compact ? 300 : 280 }]} fadeDuration={0} /> : null}
        <View style={styles.qrFooter}>
          <Text style={styles.qrCaption}>{qrVariant === 'fallback' ? 'Cached operational fallback' : 'Session-bound credential'}</Text>
          <Text style={styles.timestamp}>{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text>
        </View>
      </View>

      <View style={styles.detailList}>
        <DetailRow label="Employee ID" value={badge.employeeId || 'Pending'} />
        <DetailRow label="Access scope" value={badge.accessScope || formatShift(badge.shiftName, badge.shiftStartTime, badge.shiftEndTime)} />
        <DetailRow label="Status" value={statusDetail(badge, remainingSeconds, networkMode)} muted={state.tone !== 'success'} />
        <DetailRow label="Last synced" value={validatedCopy} muted={!badge.lastValidatedAt && !badge.serverTime} />
        {!compact ? <DetailRow label="Issued" value={issuedCopy} muted={!badge.issuedAt} /> : null}
      </View>

      {!compact ? (
        <View style={styles.validationBand}>
          <Ionicons name="scan-circle-outline" size={18} color={state.markerColor} />
          <Text style={styles.footerNote}>
            {networkMode === 'offline'
              ? 'Offline cached credential visible. Security should treat access as provisional until sync confirms.'
              : 'Animated watermark, timestamp, and short-lived QR reduce the value of stale screenshots.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function AvatarFallback({ fullName, brandColor }: { fullName: string; brandColor: string }) {
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <View style={[styles.avatarFallback, { borderColor: `${brandColor}AA` }]}>
      <Text style={styles.avatarFallbackLabel}>{initials || 'AF'}</Text>
    </View>
  );
}

function credentialState(badge: EmployeeBadge, remainingSeconds: number, networkMode: BadgeNetworkMode): CredentialState {
  const status = String(badge.credentialStatus || (badge.active ? 'ACTIVE' : 'REVOKED')).toUpperCase();
  if (networkMode === 'offline') {
    return { label: 'Offline Cached', tone: 'info', markerColor: theme.colors.info, liveLabel: 'Sync pending' };
  }
  if (['REVOKED', 'SUSPENDED', 'DISABLED', 'LOCKED'].includes(status) || !badge.active) {
    return { label: badge.statusLabel || 'Revoked', tone: 'danger', markerColor: theme.colors.danger, liveLabel: 'Blocked' };
  }
  if (status === 'PENDING_APPROVAL') {
    return { label: 'Pending Approval', tone: 'warning', markerColor: theme.colors.warning, liveLabel: 'Not live' };
  }
  if (remainingSeconds <= 0) {
    return { label: 'Expired', tone: 'danger', markerColor: theme.colors.danger, liveLabel: 'Refresh required' };
  }
  if (remainingSeconds <= 15 || networkMode === 'degraded') {
    return { label: 'Expiring Soon', tone: 'warning', markerColor: theme.colors.warning, liveLabel: networkMode === 'degraded' ? 'Degraded' : 'Rotating' };
  }
  return { label: badge.statusLabel || 'Active', tone: 'success', markerColor: theme.colors.success, liveLabel: 'Live verified' };
}

function organizationPalette(seed: string) {
  const hash = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return BRAND_PALETTE[hash % BRAND_PALETTE.length];
}

function secondsUntil(value: string | null | undefined, now: number) {
  if (!value) {
    return 60;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 60;
  }
  return Math.max(0, Math.ceil((timestamp - now) / 1000));
}

function formatCountdown(seconds: number) {
  if (seconds <= 0) {
    return '00:00';
  }
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function statusDetail(badge: EmployeeBadge, remainingSeconds: number, networkMode: BadgeNetworkMode) {
  if (networkMode === 'offline') {
    return 'Offline cached / sync pending';
  }
  if (!badge.active) {
    return badge.statusLabel || 'Credential unavailable';
  }
  return `Valid window ${formatCountdown(remainingSeconds)} / ${badge.qrMode || 'dynamic session'}`;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    gap: theme.spacing.lg,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  cardCompact: {
    paddingTop: theme.spacing.xl,
  },
  brandPanel: {
    overflow: 'hidden',
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  brandRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  brandGlow: {
    position: 'absolute',
    right: -40,
    top: -38,
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  watermark: {
    position: 'absolute',
    right: 8,
    bottom: 16,
    fontSize: 34,
    fontWeight: '800',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  headerCompact: {
    flexDirection: 'column',
  },
  identityRow: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  identityRowCompact: {
    alignItems: 'center',
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceRaised,
  },
  avatarFallback: {
    width: 68,
    height: 68,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
  },
  avatarFallbackLabel: {
    color: theme.colors.textInverse,
    fontSize: 20,
    fontWeight: '800',
  },
  identityCopy: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: theme.colors.textInverse,
    fontSize: 24,
    fontWeight: '800',
  },
  nameCompact: {
    fontSize: 20,
  },
  meta: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.body.fontWeight,
  },
  organization: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statusStack: {
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  liveText: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
  },
  securityStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  securityLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  securityValue: {
    color: theme.colors.textInverse,
    fontSize: 13,
    fontWeight: '800',
  },
  qrShell: {
    alignItems: 'stretch',
    backgroundColor: theme.colors.textInverse,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 2,
    borderColor: 'rgba(74, 222, 128, 0.34)',
  },
  qrShellWarning: {
    borderColor: 'rgba(245, 158, 11, 0.50)',
  },
  qrShellDanger: {
    borderColor: 'rgba(248, 113, 113, 0.58)',
  },
  qrHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  qrTitle: {
    color: '#0B1220',
    fontSize: 16,
    fontWeight: '800',
  },
  qrSubtitle: {
    color: '#526173',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  rotatingMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  qrImage: {
    width: '100%',
    aspectRatio: 1,
    alignSelf: 'center',
  },
  qrFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  qrCaption: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flex: 1,
  },
  timestamp: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
  },
  detailList: {
    gap: theme.spacing.sm,
  },
  validationBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.md,
  },
  footerNote: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
});
