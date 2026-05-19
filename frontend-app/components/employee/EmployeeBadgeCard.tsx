import { Image, StyleSheet, Text, View } from 'react-native';

import type { EmployeeBadge } from '../../types/domain';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';
import { formatDateTime, formatShift } from '../../utils/employeeFormatting';
import { DetailRow } from './DetailRow';
import { StatusPill } from '../feedback/StatusPill';

type Props = {
  badge: EmployeeBadge;
  compact?: boolean;
};

export function EmployeeBadgeCard({ badge, compact = false }: Props) {
  const layout = useResponsiveLayout();

  return (
    <View style={[styles.card, { padding: layout.cardPadding }, compact ? styles.cardCompact : null]}>
      <View style={[styles.header, layout.isSmallPhone ? styles.headerCompact : null]}>
        <View style={[styles.identityRow, layout.isSmallPhone ? styles.identityRowCompact : null]}>
          {badge.employeePhotoUrl ? <Image source={{ uri: badge.employeePhotoUrl }} style={styles.avatar} /> : <AvatarFallback fullName={badge.fullName} />}
          <View style={styles.identityCopy}>
            <Text maxFontSizeMultiplier={1.1} style={[styles.name, layout.isSmallPhone ? styles.nameCompact : null]}>{badge.fullName}</Text>
            <Text maxFontSizeMultiplier={1.08} style={styles.meta}>{badge.department || badge.designation || 'Operational employee'}</Text>
            <Text maxFontSizeMultiplier={1.06} style={styles.organization}>{badge.organizationName || badge.organizationCode || 'AccessFlow'}</Text>
          </View>
        </View>
        <StatusPill label={badge.active ? 'Active' : 'Revoked'} tone={badge.active ? 'success' : 'danger'} />
      </View>

      <View style={styles.qrShell}>
        {badge.qrImageDataUri ? <Image source={{ uri: badge.qrImageDataUri }} style={[styles.qrImage, { maxHeight: layout.isTablet ? 360 : 280 }]} fadeDuration={0} /> : null}
        <Text style={styles.qrCaption}>Static credential QR</Text>
      </View>

      <View style={styles.detailList}>
        <DetailRow label="Employee ID" value={badge.employeeId || 'Pending'} />
        <DetailRow label="Designation" value={badge.designation || 'Assigned by admin'} muted={!badge.designation} />
        <DetailRow label="Shift" value={formatShift(badge.shiftName, badge.shiftStartTime, badge.shiftEndTime)} muted={!badge.shiftName} />
        <DetailRow label="Issued" value={formatDateTime(badge.issuedAt, badge.organizationTimezone)} muted={!badge.issuedAt} />
      </View>

      {!compact ? <Text style={styles.footerNote}>This reusable QR remains valid until the backend revokes or rotates the credential.</Text> : null}
    </View>
  );
}

function AvatarFallback({ fullName }: { fullName: string }) {
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarFallbackLabel}>{initials || 'AF'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radii.xl,
    backgroundColor: '#0F2031',
    gap: theme.spacing.lg,
  },
  cardCompact: {
    paddingTop: theme.spacing.xl,
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
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#D7E2EE',
  },
  avatarFallback: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F415E',
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
    fontSize: 22,
    fontWeight: '800',
  },
  nameCompact: {
    fontSize: 20,
  },
  meta: {
    color: '#D6E7F6',
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.body.fontWeight,
  },
  organization: {
    color: '#98B6D3',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  qrShell: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  qrImage: {
    width: '100%',
    aspectRatio: 1,
    alignSelf: 'center',
  },
  qrCaption: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailList: {
    gap: theme.spacing.sm,
  },
  footerNote: {
    color: '#C7D8E7',
    fontSize: 13,
    lineHeight: 20,
  },
});
