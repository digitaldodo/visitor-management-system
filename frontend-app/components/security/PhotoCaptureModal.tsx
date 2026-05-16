import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../theme';
import { PrimaryButton } from '../buttons/PrimaryButton';

type CapturedAsset = {
  uri: string;
  name: string;
  type: string;
};

type Props = {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onCapture: (asset: CapturedAsset) => void;
};

export function PhotoCaptureModal({ visible, title, onCancel, onCapture }: Props) {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [preview, setPreview] = useState<CameraCapturedPicture | null>(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission, visible]);

  useEffect(() => {
    if (!visible) {
      setPreview(null);
      setIsTakingPhoto(false);
    }
  }, [visible]);

  const capturePhoto = async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      setIsTakingPhoto(true);
      const nextPreview = await cameraRef.current.takePictureAsync({
        quality: 0.72,
        base64: false,
      });
      setPreview(nextPreview);
    } finally {
      setIsTakingPhoto(false);
    }
  };

  const confirmPhoto = () => {
    if (!preview?.uri) {
      return;
    }

    const extension = preview.uri.endsWith('.png') ? 'png' : 'jpg';
    onCapture({
      uri: preview.uri,
      name: `security-capture-${Date.now()}.${extension}`,
      type: extension === 'png' ? 'image/png' : 'image/jpeg',
    });
    onCancel();
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onCancel}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        {!permission ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : !permission.granted ? (
          <View style={styles.centerState}>
            <Text style={styles.centerTitle}>Camera access is needed</Text>
            <Text style={styles.centerBody}>AccessFlow uses a live photo for visitor and worker identity verification.</Text>
            <PrimaryButton label="Enable camera" onPress={() => void requestPermission()} />
          </View>
        ) : preview ? (
          <>
            <Image source={{ uri: preview.uri }} style={styles.preview} />
            <View style={styles.footer}>
              <PrimaryButton label="Retake" onPress={() => setPreview(null)} tone="secondary" />
              <PrimaryButton label="Use photo" onPress={confirmPhoto} />
            </View>
          </>
        ) : (
          <>
            <CameraView ref={cameraRef} style={styles.camera} facing="front" />
            <View style={styles.footer}>
              <PrimaryButton label="Cancel" onPress={onCancel} tone="secondary" />
              <PrimaryButton label="Capture photo" onPress={() => void capturePhoto()} loading={isTakingPhoto} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
    paddingTop: Platform.select({ ios: 64, default: 24 }),
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  title: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  camera: {
    flex: 1,
    borderRadius: theme.radii.xl,
    overflow: 'hidden',
  },
  preview: {
    flex: 1,
    borderRadius: theme.radii.xl,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  centerTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  centerBody: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
    maxWidth: 320,
  },
});
