import * as Brightness from 'expo-brightness';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ViewShot from 'react-native-view-shot';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmployeeBadgeCard } from '../../components/employee/EmployeeBadgeCard';
import { DetailRow } from '../../components/employee/DetailRow';
import { EmptyState } from '../../components/feedback/EmptyState';
import { AppScreen } from '../../components/layout/AppScreen';
import { useEmployeeBadge } from '../../hooks/useEmployeeWorkspace';
import { theme } from '../../theme';
import { formatShift } from '../../utils/employeeFormatting';

export function BadgeScreen() {
  const badge = useEmployeeBadge();
  const badgeCaptureRef = useRef<ViewShot | null>(null);
  const previousBrightnessRef = useRef<number | null>(null);
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [isBrightnessBoosted, setIsBrightnessBoosted] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSharingBadge, setIsSharingBadge] = useState(false);

  useEffect(() => {
    return () => {
      void restoreBrightness();
    };
  }, []);

  const restoreBrightness = async () => {
    if (previousBrightnessRef.current === null) {
      setIsBrightnessBoosted(false);
      return;
    }

    try {
      await Brightness.setBrightnessAsync(previousBrightnessRef.current);
    } catch {
      // No-op: the app can continue even when brightness restore is unavailable.
    } finally {
      previousBrightnessRef.current = null;
      setIsBrightnessBoosted(false);
    }
  };

  const toggleBrightnessBoost = async () => {
    try {
      if (!isBrightnessBoosted) {
        previousBrightnessRef.current ??= await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(1);
        setIsBrightnessBoosted(true);
        return;
      }

      await restoreBrightness();
    } catch {
      Alert.alert('Brightness unavailable', 'This device did not allow the app to adjust screen brightness.');
    }
  };

  const exportPng = async (mode: 'export' | 'share') => {
    if (!badgeCaptureRef.current) {
      return;
    }

    const setBusy = mode === 'share' ? setIsSharingBadge : setIsExportingPng;
    setBusy(true);

    try {
      const uri = await badgeCaptureRef.current.capture?.();
      if (!uri) {
        throw new Error('The badge preview could not be rendered.');
      }

      await shareFile(uri, mode === 'share' ? 'Share badge image' : 'Export badge PNG', 'image/png');
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'The badge image could not be exported.');
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async () => {
    if (!badge.data) {
      return;
    }

    setIsExportingPdf(true);
    try {
      const pdf = await Print.printToFileAsync({
        html: buildBadgeHtml(badge.data),
      });
      await shareFile(pdf.uri, 'Download badge PDF', 'application/pdf');
    } catch (error) {
      Alert.alert('PDF export failed', error instanceof Error ? error.message : 'The badge PDF could not be generated.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <>
      <AppScreen
        title="Badge"
        subtitle="Your reusable operational credential for quick checkpoint presentation on Android."
        refreshing={badge.isRefetching}
        onRefresh={() => {
          void badge.refetch();
        }}
      >
        {badge.data ? (
          <>
            <ViewShot ref={badgeCaptureRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }} style={styles.captureShell}>
              <EmployeeBadgeCard badge={badge.data} />
            </ViewShot>

            <View style={styles.actionGrid}>
              <PrimaryButton label="Full-screen QR" onPress={() => setIsQrVisible(true)} />
              <PrimaryButton label="Export PNG" onPress={() => void exportPng('export')} tone="secondary" loading={isExportingPng} />
              <PrimaryButton label="Download PDF" onPress={() => void exportPdf()} tone="secondary" loading={isExportingPdf} />
              <PrimaryButton label="Share badge" onPress={() => void exportPng('share')} tone="secondary" loading={isSharingBadge} />
            </View>

            <SurfaceCard title="Access readiness" subtitle="The credential stays static unless the backend revokes or rotates it.">
              <DetailRow label="Organization" value={badge.data.organizationCode || badge.data.organizationName || 'Assigned'} />
              <DetailRow label="Department" value={badge.data.department || 'Assigned by admin'} muted={!badge.data.department} />
              <DetailRow label="Designation" value={badge.data.designation || 'Assigned by admin'} muted={!badge.data.designation} />
              <DetailRow label="Shift" value={formatShift(badge.data.shiftName, badge.data.shiftStartTime, badge.data.shiftEndTime)} muted={!badge.data.shiftName} />
              <DetailRow label="Credential" value={badge.data.active ? 'Ready for checkpoint scan' : 'Revoked or inactive'} muted={!badge.data.active} />
            </SurfaceCard>
          </>
        ) : (
          <EmptyState title="Badge not available" body="Your employee credential has not been provisioned yet. Pull to retry once the backend finishes setup." />
        )}
      </AppScreen>

      <Modal animationType="fade" visible={isQrVisible} onRequestClose={() => void closeQrModal()} transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Present your QR</Text>
                <Text style={styles.modalSubtitle}>Static credential ready for rapid scan.</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => void closeQrModal()} style={styles.closeButton}>
                <Text style={styles.closeButtonLabel}>Close</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              {badge.data?.qrImageDataUri ? (
                <View style={styles.fullscreenQrShell}>
                  <EmployeeBadgeCard badge={badge.data} compact />
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalActions}>
              <PrimaryButton
                label={isBrightnessBoosted ? 'Normal brightness' : 'Brightness boost'}
                onPress={() => void toggleBrightnessBoost()}
                tone="secondary"
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );

  async function closeQrModal() {
    setIsQrVisible(false);
    await restoreBrightness();
  }
}

async function shareFile(uri: string, dialogTitle: string, mimeType: string) {
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    throw new Error('Native sharing is unavailable on this device.');
  }

  await Sharing.shareAsync(uri, {
    mimeType,
    dialogTitle,
  });
}

function buildBadgeHtml(badge: NonNullable<ReturnType<typeof useEmployeeBadge>['data']>) {
  return `
    <html>
      <body style="margin:0;padding:32px;background:#eef3f8;font-family:Arial,sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#0f2031;border-radius:28px;padding:28px;color:#ffffff;">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
            ${badge.employeePhotoUrl ? `<img src="${badge.employeePhotoUrl}" alt="Employee photo" style="width:72px;height:72px;border-radius:20px;object-fit:cover;" />` : ''}
            <div>
              <div style="font-size:28px;font-weight:800;">${escapeHtml(badge.fullName)}</div>
              <div style="font-size:16px;color:#d6e7f6;">${escapeHtml(badge.department || badge.designation || 'Operational employee')}</div>
              <div style="font-size:12px;letter-spacing:1.1px;text-transform:uppercase;color:#98b6d3;">${escapeHtml(
                badge.organizationName || badge.organizationCode || 'AccessFlow',
              )}</div>
            </div>
          </div>
          <div style="background:#ffffff;border-radius:20px;padding:20px;text-align:center;margin-bottom:24px;">
            ${badge.qrImageDataUri ? `<img src="${badge.qrImageDataUri}" alt="Employee QR" style="width:100%;max-width:300px;" />` : ''}
            <div style="margin-top:12px;color:#5a6b7e;font-size:12px;letter-spacing:0.8px;text-transform:uppercase;">Static credential QR</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;row-gap:14px;column-gap:20px;font-size:14px;">
            <div><strong>Employee ID</strong><br />${escapeHtml(badge.employeeId || 'Pending')}</div>
            <div><strong>Status</strong><br />${badge.active ? 'Active' : 'Inactive'}</div>
            <div><strong>Designation</strong><br />${escapeHtml(badge.designation || 'Assigned by admin')}</div>
            <div><strong>Shift</strong><br />${escapeHtml(formatShift(badge.shiftName, badge.shiftStartTime, badge.shiftEndTime))}</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const styles = StyleSheet.create({
  captureShell: {
    borderRadius: theme.radii.xl,
  },
  actionGrid: {
    gap: theme.spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 15, 24, 0.78)',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  modalSheet: {
    maxHeight: '92%',
    borderRadius: theme.radii.xl,
    backgroundColor: '#081523',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  modalTitle: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  modalSubtitle: {
    color: '#A4C2DE',
    fontSize: theme.typography.body.fontSize,
    marginTop: 4,
  },
  closeButton: {
    minHeight: 40,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#163149',
  },
  closeButtonLabel: {
    color: theme.colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  modalContent: {
    paddingVertical: theme.spacing.sm,
  },
  fullscreenQrShell: {
    gap: theme.spacing.md,
  },
  modalActions: {
    gap: theme.spacing.sm,
  },
});
