import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { PermissionEducationPanel, showPermissionEducation } from '../../permissions/permissionEducation';
import { theme } from '../../theme';
import { PrimaryButton } from '../buttons/PrimaryButton';
import { OperationalLoadingState } from '../feedback/LoadingState';

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
  const layout = useResponsiveLayout();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [preview, setPreview] = useState<CameraCapturedPicture | null>(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setPreview(null);
      setIsTakingPhoto(false);
      setIsPickingPhoto(false);
      setCaptureError(null);
    }
  }, [visible]);

  const capturePhoto = async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      setIsTakingPhoto(true);
      setCaptureError(null);
      const nextPreview = await cameraRef.current.takePictureAsync({
        quality: 0.68,
        base64: false,
        exif: false,
        skipProcessing: true,
      });
      setPreview(nextPreview);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'Photo capture failed. Try again or upload an image.');
    } finally {
      setIsTakingPhoto(false);
    }
  };

  const choosePhoto = async () => {
    try {
      setIsPickingPhoto(true);
      setCaptureError(null);
      const accepted = await showPermissionEducation('files');
      if (!accepted) {
        return;
      }
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        setCaptureError('Photo library access is required to upload an identity image.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.68,
      });

      if (pickerResult.canceled || !pickerResult.assets.length) {
        return;
      }

      const asset = pickerResult.assets[0];
      onCapture({
        uri: asset.uri,
        name: asset.fileName || `security-upload-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      onCancel();
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'Photo upload failed. Try again.');
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const enableCamera = async () => {
    const accepted = await showPermissionEducation('camera');
    if (accepted) {
      await requestPermission();
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
      <SafeAreaView style={[styles.screen, { paddingHorizontal: layout.contentPadding }]}>
        <View style={styles.header}>
          <Text maxFontSizeMultiplier={1.12} style={styles.title}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        {!permission ? (
          <View style={styles.centerState}>
            <OperationalLoadingState title="Preparing camera" body="Checking Android permission state before opening the verification camera." />
          </View>
        ) : !permission.granted ? (
          <PermissionEducationPanel
            kind="camera"
            onContinue={() => void enableCamera()}
            secondaryAction={{ label: 'Upload photo instead', onPress: () => void choosePhoto(), loading: isPickingPhoto }}
          />
        ) : preview ? (
          <>
            <View style={styles.previewShell}>
              <Image source={{ uri: preview.uri }} style={styles.preview} />
              <View style={styles.previewBadge}>
                <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                <Text style={styles.previewBadgeText}>Ready for verification</Text>
              </View>
            </View>
            <View style={[styles.footer, layout.fieldStacked ? styles.footerStacked : null]}>
              <PrimaryButton label="Retake" onPress={() => setPreview(null)} tone="secondary" />
              <PrimaryButton label="Use photo" onPress={confirmPhoto} loading={isTakingPhoto || isPickingPhoto} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.cameraShell}>
              <CameraView ref={cameraRef} style={styles.camera} facing="front">
                <View pointerEvents="none" style={styles.cameraOverlay}>
                  <View style={styles.faceGuide}>
                    <View style={[styles.corner, styles.cornerTopLeft]} />
                    <View style={[styles.corner, styles.cornerTopRight]} />
                    <View style={[styles.corner, styles.cornerBottomLeft]} />
                    <View style={[styles.corner, styles.cornerBottomRight]} />
                  </View>
                  <View style={styles.guidancePanel}>
                    <Text style={styles.guidanceTitle}>Center face and shoulders</Text>
                    <Text style={styles.guidanceText}>Use clear light, remove masks or glare, and keep the badge identity photo current.</Text>
                  </View>
                </View>
              </CameraView>
            </View>
            {captureError ? (
              <View style={styles.errorPanel}>
                <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
                <Text style={styles.errorText}>{captureError}</Text>
              </View>
            ) : null}
            <View style={[styles.footer, layout.fieldStacked ? styles.footerStacked : null]}>
              <PrimaryButton label="Cancel" onPress={onCancel} tone="secondary" />
              <PrimaryButton label="Capture photo" onPress={() => void capturePhoto()} loading={isTakingPhoto} />
              <PrimaryButton label="Upload fallback" onPress={() => void choosePhoto()} tone="secondary" loading={isPickingPhoto} />
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
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
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
  },
  cameraShell: {
    flex: 1,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.10)',
  },
  faceGuide: {
    alignSelf: 'center',
    marginTop: theme.spacing.xxl,
    width: '72%',
    maxWidth: 320,
    aspectRatio: 0.78,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: theme.colors.textInverse,
  },
  cornerTopLeft: {
    top: -1,
    left: -1,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 22,
  },
  cornerTopRight: {
    top: -1,
    right: -1,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 22,
  },
  cornerBottomLeft: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 22,
  },
  cornerBottomRight: {
    right: -1,
    bottom: -1,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 22,
  },
  guidancePanel: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(6, 10, 18, 0.70)',
    padding: theme.spacing.md,
  },
  guidanceTitle: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  guidanceText: {
    color: '#DCE6F5',
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
  previewShell: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  preview: {
    flex: 1,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  previewBadge: {
    minHeight: 42,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  previewBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  footerStacked: {
    flexDirection: 'column',
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
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  errorPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.dangerSoft,
    backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.md,
  },
  errorText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
});
