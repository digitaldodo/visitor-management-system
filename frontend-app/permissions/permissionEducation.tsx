import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/buttons/PrimaryButton';
import { theme } from '../theme';

export type PermissionEducationKind = 'camera' | 'notifications' | 'files';
export type PermissionLifecycleStatus = 'not-requested' | 'granted' | 'denied' | 'permanently-denied';

type PermissionCopy = {
  title: string;
  body: string;
  bullets: string[];
  icon: keyof typeof Ionicons.glyphMap;
  actionLabel: string;
};

const STORAGE_PREFIX = 'accessflow.mobile.permission-education.v1.';
const LIFECYCLE_PREFIX = 'accessflow.mobile.permission-lifecycle.v1.';
const PermissionEducationContext = createContext<null>(null);

let presentPermissionEducation: ((kind: PermissionEducationKind) => Promise<boolean>) | null = null;

const permissionCopy: Record<PermissionEducationKind, PermissionCopy> = {
  camera: {
    title: 'Camera for secure verification',
    body: 'AccessFlow uses camera access for secure QR badge scanning and checkpoint verification.',
    bullets: [
      'Scan visitor and workforce QR badges at checkpoints.',
      'Capture identity photos when your workflow requires verification.',
      'No audio recording permission is requested.',
    ],
    icon: 'qr-code-outline',
    actionLabel: 'Continue',
  },
  notifications: {
    title: 'Operational notifications',
    body: 'Receive real-time operational alerts, approvals, and security updates.',
    bullets: [
      'Receive approval and incident alerts without keeping the screen open.',
      'Keep private details protected through Android notification controls.',
      'You can continue with in-app alerts if you decline.',
    ],
    icon: 'notifications-outline',
    actionLabel: 'Enable notifications',
  },
  files: {
    title: 'Files access for verified uploads',
    body: 'Photo library access is used only when you choose a profile, visitor, or credential image.',
    bullets: [
      'Select verification photos for identity workflows.',
      'Export operational reports and credentials when requested.',
      'AccessFlow does not browse unrelated files in the background.',
    ],
    icon: 'images-outline',
    actionLabel: 'Continue',
  },
};

export async function showPermissionEducation(kind: PermissionEducationKind) {
  const key = `${STORAGE_PREFIX}${kind}`;
  const lifecycle = await readPermissionLifecycle(kind);
  if (kind === 'notifications' && (lifecycle.status === 'denied' || lifecycle.status === 'permanently-denied')) {
    return false;
  }

  const alreadyShown = await AsyncStorage.getItem(key).catch(() => null);
  if (alreadyShown === 'true') {
    return true;
  }

  const copy = permissionCopy[kind];
  if (presentPermissionEducation) {
    const accepted = await presentPermissionEducation(kind);
    if (accepted) {
      await AsyncStorage.setItem(key, 'true').catch(() => undefined);
    }
    return accepted;
  }

  const accepted = await new Promise<boolean>((resolve) => {
    Alert.alert(
      copy.title,
      copy.body,
      [
        { text: kind === 'notifications' ? 'Enable later' : 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: copy.actionLabel, onPress: () => resolve(true) },
      ],
    );
  });

  if (accepted) {
    await AsyncStorage.setItem(key, 'true').catch(() => undefined);
  } else if (kind === 'notifications') {
    await writePermissionLifecycle(kind, 'denied');
  }

  return accepted;
}

export async function readPermissionLifecycle(kind: PermissionEducationKind) {
  const value = await AsyncStorage.getItem(`${LIFECYCLE_PREFIX}${kind}`).catch(() => null);
  if (value === 'granted' || value === 'denied' || value === 'permanently-denied' || value === 'not-requested') {
    return { status: value as PermissionLifecycleStatus };
  }
  return { status: 'not-requested' as PermissionLifecycleStatus };
}

export async function writePermissionLifecycle(kind: PermissionEducationKind, status: PermissionLifecycleStatus) {
  await AsyncStorage.setItem(`${LIFECYCLE_PREFIX}${kind}`, status).catch(() => undefined);
  if (status === 'granted') {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${kind}`, 'true').catch(() => undefined);
  }
}

export async function resetPermissionLifecycleForManualEnable(kind: PermissionEducationKind) {
  await Promise.all([
    AsyncStorage.removeItem(`${LIFECYCLE_PREFIX}${kind}`).catch(() => undefined),
    AsyncStorage.removeItem(`${STORAGE_PREFIX}${kind}`).catch(() => undefined),
  ]);
}

export function PermissionEducationProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const [activeKind, setActiveKind] = useState<PermissionEducationKind | null>(null);

  const present = useCallback((kind: PermissionEducationKind) => {
    if (resolverRef.current) {
      resolverRef.current(false);
    }

    setActiveKind(kind);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const complete = useCallback((accepted: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setActiveKind(null);
    resolve?.(accepted);
  }, []);

  useEffect(() => {
    presentPermissionEducation = present;
    return () => {
      if (presentPermissionEducation === present) {
        presentPermissionEducation = null;
      }
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, [present]);

  const copy = activeKind ? permissionCopy[activeKind] : null;
  const contextValue = useMemo(() => null, []);

  return (
    <PermissionEducationContext.Provider value={contextValue}>
      {children}
      {copy ? (
        <Modal animationType="fade" transparent visible onRequestClose={() => complete(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetIconWrap}>
                <Ionicons name={copy.icon} size={30} color={theme.colors.info} />
              </View>
              <Text style={styles.sheetTitle}>{copy.title}</Text>
              <Text style={styles.sheetBody}>{copy.body}</Text>
              <View style={styles.bulletList}>
                {copy.bullets.map((bullet) => (
                  <View key={bullet} style={styles.bulletRow}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.accent} />
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.sheetActions}>
                <PrimaryButton label={copy.actionLabel} onPress={() => complete(true)} />
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => complete(false)}
                  style={styles.declineButton}
                >
                  <Text style={styles.declineText}>{activeKind === 'notifications' ? 'Enable later' : 'Not now'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </PermissionEducationContext.Provider>
  );
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
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    width: '100%',
    gap: theme.spacing.md,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  sheetHandle: {
    width: 48,
    height: 4,
    borderRadius: theme.radii.pill,
    alignSelf: 'center',
    backgroundColor: theme.colors.borderStrong,
  },
  sheetIconWrap: {
    width: 58,
    height: 58,
    borderRadius: theme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.infoSoft,
  },
  sheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  sheetBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  sheetActions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  declineButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
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
