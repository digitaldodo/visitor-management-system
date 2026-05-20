import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../components/buttons/PrimaryButton';
import { theme } from '../theme';

export type PermissionEducationKind = 'camera' | 'notifications' | 'files' | 'biometric';

type PermissionCopy = {
  title: string;
  body: string;
  bullets: string[];
  icon: keyof typeof Ionicons.glyphMap;
  actionLabel: string;
};

const STORAGE_PREFIX = 'accessflow.mobile.permission-education.v1.';

const permissionCopy: Record<PermissionEducationKind, PermissionCopy> = {
  camera: {
    title: 'Camera access for QR verification',
    body: 'AccessFlow uses the camera only when you scan badges or capture verification photos.',
    bullets: [
      'Scan visitor and workforce QR badges at checkpoints.',
      'Capture identity photos when your workflow requires verification.',
      'No audio recording permission is requested.',
    ],
    icon: 'qr-code-outline',
    actionLabel: 'Continue to camera permission',
  },
  notifications: {
    title: 'Notifications for operational updates',
    body: 'Push notifications keep security and workforce teams aware of approvals, incidents, and sync status.',
    bullets: [
      'Receive approval and incident alerts without keeping the screen open.',
      'Keep private details protected through Android notification controls.',
      'You can continue with in-app alerts if you decline.',
    ],
    icon: 'notifications-outline',
    actionLabel: 'Continue to notification permission',
  },
  files: {
    title: 'Files access for trusted uploads',
    body: 'Photo library access is used only when you choose a profile, visitor, or credential image.',
    bullets: [
      'Select verification photos for identity workflows.',
      'Export operational reports and credentials when requested.',
      'AccessFlow does not browse unrelated files in the background.',
    ],
    icon: 'images-outline',
    actionLabel: 'Continue to files permission',
  },
  biometric: {
    title: 'Biometric unlock for trusted sessions',
    body: 'Fingerprint, face unlock, or device PIN helps protect trusted devices after app restarts or inactivity.',
    bullets: [
      'Unlock the saved session without exposing credentials.',
      'Use Android device security; biometric data stays on the device.',
      'Password sign-in remains available if you decline.',
    ],
    icon: 'finger-print-outline',
    actionLabel: 'Continue to device unlock',
  },
};

export async function showPermissionEducation(kind: PermissionEducationKind) {
  const key = `${STORAGE_PREFIX}${kind}`;
  const alreadyShown = await AsyncStorage.getItem(key).catch(() => null);
  if (alreadyShown === 'true') {
    return true;
  }

  const copy = permissionCopy[kind];
  const accepted = await new Promise<boolean>((resolve) => {
    Alert.alert(
      copy.title,
      `${copy.body}\n\n${copy.bullets.map((bullet) => `- ${bullet}`).join('\n')}`,
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: copy.actionLabel, onPress: () => resolve(true) },
      ],
    );
  });

  if (accepted) {
    await AsyncStorage.setItem(key, 'true').catch(() => undefined);
  }

  return accepted;
}

export function PermissionEducationPanel({
  kind,
  onContinue,
  loading,
  secondaryAction,
}: {
  kind: PermissionEducationKind;
  onContinue: () => void;
  loading?: boolean;
  secondaryAction?: { label: string; onPress: () => void; loading?: boolean };
}) {
  const copy = permissionCopy[kind];

  return (
    <View style={styles.panel}>
      <View style={styles.iconWrap}>
        <Ionicons name={copy.icon} size={28} color={theme.colors.info} />
      </View>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <View style={styles.bulletList}>
        {copy.bullets.map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <Ionicons name="checkmark-circle-outline" size={17} color={theme.colors.success} />
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
      </View>
      <PrimaryButton label={copy.actionLabel} onPress={onContinue} loading={loading} />
      {secondaryAction ? (
        <PrimaryButton
          label={secondaryAction.label}
          onPress={secondaryAction.onPress}
          tone="secondary"
          loading={secondaryAction.loading}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.lg,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: theme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  bulletList: {
    gap: theme.spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  bulletText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
});
