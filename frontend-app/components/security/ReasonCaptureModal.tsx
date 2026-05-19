import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';
import { PrimaryButton } from '../buttons/PrimaryButton';
import { AppTextField } from '../form/AppTextField';

type Props = {
  visible: boolean;
  title: string;
  helperText: string;
  confirmLabel: string;
  minLength?: number;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
};

export function ReasonCaptureModal({
  visible,
  title,
  helperText,
  confirmLabel,
  minLength = 8,
  loading,
  onCancel,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!visible) {
      setReason('');
      setSubmitted(false);
    }
  }, [visible]);

  const tooShort = reason.trim().length < minLength;

  return (
    <Modal animationType="slide" visible={visible} transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={[styles.sheet, { paddingHorizontal: layout.contentPadding, paddingBottom: insets.bottom + theme.spacing.lg }]}>
          <Text maxFontSizeMultiplier={1.12} style={styles.title}>{title}</Text>
          <Text maxFontSizeMultiplier={1.08} style={styles.helper}>{helperText}</Text>
          <AppTextField
            label="Reason"
            multiline
            value={reason}
            onChangeText={setReason}
            placeholder="Record what happened, who was verified, and why security took this action."
            errorText={submitted && tooShort ? `Enter at least ${minLength} characters.` : undefined}
          />
          <View style={[styles.actions, layout.fieldStacked ? styles.actionsStacked : null]}>
            <PrimaryButton label="Cancel" onPress={onCancel} tone="secondary" />
            <PrimaryButton
              label={confirmLabel}
              onPress={async () => {
                setSubmitted(true);
                if (tooShort) {
                  return;
                }
                await onConfirm(reason.trim());
              }}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    gap: theme.spacing.md,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    paddingTop: theme.spacing.lg,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  helper: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionsStacked: {
    flexDirection: 'column',
  },
});
