import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { useOperationalSnackbar } from '../../components/feedback/OperationalSnackbar';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useEmergencyState } from '../../hooks/useEmergencyWorkspace';
import { AppScreen } from '../../components/layout/AppScreen';
import { OperationalFieldList } from '../../components/security/OperationalFieldList';
import { ReasonCaptureModal } from '../../components/security/ReasonCaptureModal';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { recordDiagnosticEvent } from '../../runtime/diagnostics';
import { recordOperationalMetric } from '../../runtime/telemetry';
import {
  buildOfflineEmployeeScan,
  buildOfflineVisitorVerification,
  canUseCachedEmployeeForOfflineOperation,
  canUseCachedVisitorForOfflineOperation,
  enqueueOfflineOperation,
  findCachedEmployeeScan,
  findCachedQrVerification,
  fingerprintPayload,
} from '../../storage/offlineOperationalStore';
import {
  useCheckOutVisitorMutation,
  useDenyVisitorMutation,
  useEmployeeQrScanMutation,
  useEscalateVisitorMutation,
  useManualEmployeeCheckInMutation,
  useManualEmployeeCheckOutMutation,
  useOverrideCheckInMutation,
  useQrCheckInMutation,
  useReportVisitorMismatchMutation,
  useVerifyQrMutation,
} from '../../hooks/useSecurityWorkspace';
import { theme } from '../../theme';
import type { EmployeeScanResult, QrVerificationResult } from '../../types/domain';
import {
  employeePresenceLabel,
  formatDateTime,
  formatTime,
  formatVisitorWindow,
  relativePresenceSummary,
  scanResultLabel,
  statusTone,
  verificationTone,
  visitorStatusLabel,
  visitorTypeLabel,
} from '../../utils/securityFormatting';

type ReasonAction =
  | { type: 'override'; visitorId: string }
  | { type: 'deny'; visitorId: string }
  | { type: 'escalate'; visitorId: string }
  | { type: 'mismatch'; visitorId: string }
  | { type: 'employee-check-in'; employeeId: string }
  | { type: 'employee-check-out'; employeeId: string };

type ScannerMode = 'idle' | 'processing' | 'feedback';

export function ScanScreen() {
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const layout = useResponsiveLayout();
  const runtime = useOperationalRuntime();
  const emergencyState = useEmergencyState();
  const { showSnackbar } = useOperationalSnackbar();
  const cameraRef = useRef<CameraView | null>(null);
  const isMountedRef = useRef(true);
  const lastScanAtRef = useRef(0);
  const lastScannedPayloadRef = useRef('');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guidePulse = useRef(new Animated.Value(0)).current;
  const [permission, requestPermission] = useCameraPermissions();
  const [manualPayload, setManualPayload] = useState('');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [scannerMode, setScannerMode] = useState<ScannerMode>('idle');
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState('');
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [visitorVerification, setVisitorVerification] = useState<QrVerificationResult | null>(null);
  const [employeeScan, setEmployeeScan] = useState<EmployeeScanResult | null>(null);
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');

  const verifyMutation = useVerifyQrMutation();
  const visitorCheckInMutation = useQrCheckInMutation();
  const employeeScanMutation = useEmployeeQrScanMutation();
  const overrideMutation = useOverrideCheckInMutation();
  const denyMutation = useDenyVisitorMutation();
  const escalateMutation = useEscalateVisitorMutation();
  const mismatchMutation = useReportVisitorMismatchMutation();
  const visitorCheckOutMutation = useCheckOutVisitorMutation();
  const manualEmployeeCheckInMutation = useManualEmployeeCheckInMutation();
  const manualEmployeeCheckOutMutation = useManualEmployeeCheckOutMutation();

  const isProcessing =
    verifyMutation.isPending
    || visitorCheckInMutation.isPending
    || employeeScanMutation.isPending
    || overrideMutation.isPending
    || denyMutation.isPending
    || escalateMutation.isPending
    || mismatchMutation.isPending
    || visitorCheckOutMutation.isPending
    || manualEmployeeCheckInMutation.isPending
    || manualEmployeeCheckOutMutation.isPending;

  const cameraActive = Boolean(appIsActive && isFocused && permission?.granted && scannerMode === 'idle' && !reasonAction);
  const scanGuideFrameStyle = useMemo(() => ({
    left: (layout.isTablet ? '24%' : layout.isSmallPhone ? '15%' : '17%') as `${number}%`,
    right: (layout.isTablet ? '24%' : layout.isSmallPhone ? '15%' : '17%') as `${number}%`,
    top: (layout.isSmallPhone ? '15%' : '17%') as `${number}%`,
    bottom: (layout.isTablet ? '24%' : layout.isSmallPhone ? '31%' : '28%') as `${number}%`,
  }), [layout.isSmallPhone, layout.isTablet]);
  const guideScale = guidePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });
  const guideOpacity = guidePulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  const scanLineTranslate = guidePulse.interpolate({ inputRange: [0, 1], outputRange: [8, 116] });
  const scannerCopy = useMemo(
    () => scannerStatusCopy(scannerMode, scanError, visitorVerification, employeeScan, lastActionMessage, runtime.offlineOperationalMode),
    [employeeScan, lastActionMessage, runtime.offlineOperationalMode, scanError, scannerMode, visitorVerification],
  );
  const liveActionsAvailable = runtime.offlineOperationalMode === 'online';
  const emergencyCheckInsBlocked = Boolean(emergencyState.data?.lockdownActive);
  const checkInActionsAvailable = liveActionsAvailable && !emergencyCheckInsBlocked;

  const reasonConfig = useMemo(() => {
    if (!reasonAction) {
      return null;
    }

    switch (reasonAction.type) {
      case 'override':
        return {
          title: 'Manual visitor override',
          helperText: 'Record the identity checks you completed before overriding the failed or blocked scan.',
          confirmLabel: 'Record override',
        };
      case 'deny':
        return {
          title: 'Deny visitor entry',
          helperText: 'This will deny the visit at the checkpoint and preserve the guard audit trail in the backend.',
          confirmLabel: 'Deny entry',
        };
      case 'escalate':
        return {
          title: 'Escalate visitor issue',
          helperText: 'Capture what needs follow-up from the host, admin, or security lead.',
          confirmLabel: 'Escalate',
        };
      case 'mismatch':
        return {
          title: 'Report mismatch',
          helperText: 'Record what did not match between the badge, person, and approved visitor profile.',
          confirmLabel: 'Report mismatch',
        };
      case 'employee-check-in':
        return {
          title: 'Manual workforce check-in',
          helperText: 'Document why the static QR could not be used before you log the assisted workforce check-in.',
          confirmLabel: 'Check in',
        };
      case 'employee-check-out':
        return {
          title: 'Manual workforce check-out',
          helperText: 'Document why the static QR could not be used before you log the assisted workforce check-out.',
          confirmLabel: 'Check out',
        };
    }
  }, [reasonAction]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(guidePulse, {
          toValue: 1,
          duration: 1150,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(guidePulse, {
          toValue: 0,
          duration: 1150,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();

    return () => {
      animation.stop();
    };
  }, [guidePulse]);

  useEffect(() => {
    if (!isFocused) {
      setTorchEnabled(false);
      setScannerMode((current) => (current === 'processing' ? 'feedback' : current));
    }
  }, [isFocused]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active';
      setAppIsActive(active);
      if (!active) {
        setTorchEnabled(false);
        setScannerMode((current) => (current === 'processing' ? 'feedback' : current));
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['security', 'overview'] }),
      queryClient.invalidateQueries({ queryKey: ['security', 'visitors'] }),
      queryClient.invalidateQueries({ queryKey: ['security', 'monitoring'] }),
      queryClient.invalidateQueries({ queryKey: ['security', 'attendance'] }),
      queryClient.invalidateQueries({ queryKey: ['security', 'employees'] }),
    ]);
  };

  const resetScanner = () => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    lastScanAtRef.current = 0;
    lastScannedPayloadRef.current = '';
    setVisitorVerification(null);
    setEmployeeScan(null);
    setScanError(null);
    setLastActionMessage(null);
    setScannerMode('idle');
  };

  const scheduleScannerReset = (delayMs = 1700) => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        resetScanner();
      }
    }, delayMs);
  };

  const processOfflinePayload = async (nextPayload: string) => {
    const payloadFingerprint = fingerprintPayload(nextPayload);
    if (looksLikeEmployeeQr(nextPayload)) {
      const cached = await findCachedEmployeeScan(nextPayload);
      if (!cached) {
        await enqueueOfflineOperation({
          operationType: 'employee-qr-scan',
          kind: 'employee',
          qrPayload: nextPayload,
          payloadFingerprint,
          dedupeKey: `employee-scan:${payloadFingerprint}`,
        });
        setScanError('Offline Mode: this workforce badge is not cached locally. The scan was queued for backend verification only; do not grant access until sync confirms.');
        await refreshWorkspaceStateAfterOfflineQueue();
        return true;
      }

      const policy = canUseCachedEmployeeForOfflineOperation(cached);
      if (!policy.allowed) {
        setEmployeeScan(buildOfflineEmployeeScan({ ...cached, queued: false }));
        setScanError(`Offline Mode: ${policy.reason}`);
        return true;
      }

      const queued = await enqueueOfflineOperation({
        operationType: 'employee-qr-scan',
        kind: 'employee',
        qrPayload: nextPayload,
        payloadFingerprint,
        targetId: cached.employee?.id ?? cached.result.employee?.id ?? null,
        targetLabel: cached.employee?.fullName ?? cached.result.employee?.fullName ?? 'Worker',
        localStatus: cached.employee?.currentlyIn || cached.result.currentlyIn ? 'OFFLINE_CHECK_OUT_PENDING' : 'OFFLINE_CHECK_IN_PENDING',
        dedupeKey: `employee-scan:${payloadFingerprint}`,
      });
      setEmployeeScan(buildOfflineEmployeeScan({ ...cached, queued: true }));
      setLastActionMessage(queued.duplicate ? 'This workforce scan is already queued for sync.' : 'Offline workforce scan queued. Sync will confirm the final presence state.');
      await recordOfflineQueuedMetric('employee-qr-scan', queued.duplicate);
      await refreshWorkspaceStateAfterOfflineQueue();
      return true;
    }

    const cached = await findCachedQrVerification(nextPayload);
    if (!cached) {
      await enqueueOfflineOperation({
        operationType: 'visitor-qr-verify',
        kind: 'visitor',
        qrPayload: nextPayload,
        payloadFingerprint,
        dedupeKey: `visitor-verify:${payloadFingerprint}`,
      });
      setScanError('Offline Mode: this visitor badge is not cached locally. The scan was queued for backend verification only; do not approve entry until sync confirms.');
      await refreshWorkspaceStateAfterOfflineQueue();
      return true;
    }

    const policy = canUseCachedVisitorForOfflineOperation(cached);
    if (!policy.allowed) {
      setVisitorVerification(buildOfflineVisitorVerification({ ...cached, queued: false }));
      setScanError(`Offline Mode: ${policy.reason}`);
      return true;
    }

    const isCheckOut = String(cached.visitor?.status ?? cached.result.status) === 'CHECKED_IN';
    const queued = await enqueueOfflineOperation({
      operationType: isCheckOut ? 'visitor-check-out' : 'visitor-qr-check-in',
      kind: 'visitor',
      qrPayload: isCheckOut ? null : nextPayload,
      payloadFingerprint,
      targetId: cached.result.visitorId ?? cached.visitor?.id ?? null,
      targetLabel: cached.visitor?.fullName ?? cached.result.fullName ?? 'Visitor',
      localStatus: isCheckOut ? 'OFFLINE_CHECK_OUT_PENDING' : 'OFFLINE_CHECK_IN_PENDING',
      dedupeKey: `${isCheckOut ? 'visitor-check-out' : 'visitor-check-in'}:${cached.result.visitorId ?? payloadFingerprint}`,
    });

    setVisitorVerification(buildOfflineVisitorVerification({ ...cached, queued: true }));
    setLastActionMessage(queued.duplicate ? 'This visitor operation is already queued for sync.' : `Offline visitor ${isCheckOut ? 'check-out' : 'check-in'} queued. Sync will reconcile the final record.`);
    await recordOfflineQueuedMetric(isCheckOut ? 'visitor-check-out' : 'visitor-qr-check-in', queued.duplicate);
    await refreshWorkspaceStateAfterOfflineQueue();
    return true;
  };

  const refreshWorkspaceStateAfterOfflineQueue = async () => {
    await runtime.syncNow().catch(() => undefined);
  };

  const recordOfflineQueuedMetric = async (operationType: string, duplicate: boolean) => {
    await recordOperationalMetric({
      name: 'offline_operation_queued',
      tags: {
        operationType,
        duplicate,
      },
    });
    showSnackbar({
      message: duplicate ? 'Queued action already pending' : 'Offline action queued for sync',
      tone: 'warning',
    });
  };

  const processPayload = async (payload: string) => {
    const nextPayload = payload.trim();
    let shouldAutoReset = false;
    if (!nextPayload) {
      if (isMountedRef.current) {
        setScannerMode('idle');
      }
      return;
    }

    setLastPayload(nextPayload);
    setScanError(null);
    setLastActionMessage(null);
    setVisitorVerification(null);
    setEmployeeScan(null);

    try {
      if (runtime.offlineOperationalMode === 'offline') {
        const handledOffline = await processOfflinePayload(nextPayload);
        if (handledOffline) {
          shouldAutoReset = true;
          return;
        }
      }

      if (looksLikeEmployeeQr(nextPayload)) {
        const result = await employeeScanMutation.mutateAsync(nextPayload);
        if (isMountedRef.current) {
          setEmployeeScan(result);
          setLastActionMessage(result.message || result.headline || 'Workforce presence updated.');
        }
        shouldAutoReset = result.valid;
        await recordOperationalMetric({
          name: 'workforce_presence',
          tags: {
            action: result.action ?? 'UNKNOWN',
            valid: result.valid,
          },
        });
      } else {
        const result = await verifyMutation.mutateAsync(nextPayload);
        if (isMountedRef.current) {
          setVisitorVerification(result);
          setLastActionMessage(result.message || result.headline || 'Visitor badge verified.');
        }
        shouldAutoReset = Boolean(result.valid && !result.canCheckIn && !result.canCheckOut);
        await recordOperationalMetric({
          name: result.valid ? 'visitor_verification' : 'qr_validation_issue',
          tags: {
            valid: result.valid,
            recognized: result.recognized,
            resultCode: result.resultCode ?? null,
          },
        });
      }
      await recordOperationalMetric({ name: 'scanner_success', tags: { mode: looksLikeEmployeeQr(nextPayload) ? 'employee' : 'visitor' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The QR scan could not be completed.';
      const kind = typeof error === 'object' && error && 'kind' in error ? String((error as { kind?: string }).kind) : 'unknown';
      if (kind === 'network') {
        const handledOffline = await processOfflinePayload(nextPayload);
        await recordDiagnosticEvent({
          level: 'warn',
          scope: 'scanner',
          code: 'SCAN_QUEUED_OFFLINE',
          message: 'A scan was processed through Offline Operational Mode because the backend was unreachable.',
          context: {
            handledOffline,
            kind: looksLikeEmployeeQr(nextPayload) ? 'employee' : 'visitor',
          },
        });
        if (isMountedRef.current && !handledOffline) {
          setScanError('Network is degraded. The scan was queued locally for a supervised retry when connectivity returns.');
        }
        return;
      }

      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'scanner',
        code: looksLikeEmployeeQr(nextPayload) ? 'EMPLOYEE_SCAN_FAILED' : 'VISITOR_SCAN_FAILED',
        message,
        context: {
          kind,
          mode: looksLikeEmployeeQr(nextPayload) ? 'employee' : 'visitor',
        },
      });
      if (isMountedRef.current) {
        setScanError(message);
      }
    } finally {
      if (isMountedRef.current) {
        setScannerMode('feedback');
        if (shouldAutoReset) {
          scheduleScannerReset();
        }
      }
    }
  };

  const onScannedPayload = (payload: string) => {
    if (scannerMode !== 'idle' || isProcessing) {
      return;
    }

    const normalized = payload.trim();
    const now = Date.now();
    if (
      normalized
      && normalized === lastScannedPayloadRef.current
      && now - lastScanAtRef.current < 1800
    ) {
      return;
    }

    lastScannedPayloadRef.current = normalized;
    lastScanAtRef.current = now;
    setScannerMode('processing');
    void processPayload(normalized);
  };

  const handleVisitorCheckIn = async () => {
    if (!lastPayload) {
      return;
    }

    const visitor = await visitorCheckInMutation.mutateAsync(lastPayload);
    setLastActionMessage(`${visitor.fullName} checked in successfully.`);
    setScannerMode('feedback');
    scheduleScannerReset();
    await recordOperationalMetric({ name: 'scan_throughput', tags: { action: 'visitor-check-in' } });
    await refreshWorkspace();
  };

  const handleVisitorCheckOut = async (visitorId: string) => {
    const visitor = await visitorCheckOutMutation.mutateAsync(visitorId);
    setVisitorVerification((current) => current && current.visitorId === visitorId ? {
      ...current,
      status: visitor.status,
      checkOutTime: visitor.checkOutTime,
      canCheckIn: false,
      canCheckOut: false,
      statusLabel: visitorStatusLabel(visitor.status),
    } : current);
    setLastActionMessage(`${visitor.fullName} checked out successfully.`);
    setScannerMode('feedback');
    scheduleScannerReset();
    await recordOperationalMetric({ name: 'scan_throughput', tags: { action: 'visitor-check-out' } });
    await refreshWorkspace();
  };

  const handleReasonConfirm = async (reason: string) => {
    if (!reasonAction) {
      return;
    }

    switch (reasonAction.type) {
      case 'override': {
        const visitor = await overrideMutation.mutateAsync({ visitorId: reasonAction.visitorId, reason });
        setLastActionMessage(`Manual override recorded for ${visitor.fullName}.`);
        break;
      }
      case 'deny': {
        const visitor = await denyMutation.mutateAsync({ visitorId: reasonAction.visitorId, reason });
        setVisitorVerification((current) => current && current.visitorId === reasonAction.visitorId ? {
          ...current,
          valid: false,
          status: visitor.status,
          statusLabel: visitorStatusLabel(visitor.status),
          message: visitor.rejectionReason || current.message,
          canCheckIn: false,
          canCheckOut: false,
        } : current);
        setLastActionMessage(`Entry denied for ${visitor.fullName}.`);
        await recordOperationalMetric({ name: 'denied_access', tags: { source: 'security-scan' } });
        break;
      }
      case 'escalate': {
        const visitor = await escalateMutation.mutateAsync({ visitorId: reasonAction.visitorId, reason });
        setLastActionMessage(`Issue escalated for ${visitor.fullName}.`);
        break;
      }
      case 'mismatch': {
        const visitor = await mismatchMutation.mutateAsync({ visitorId: reasonAction.visitorId, reason });
        setLastActionMessage(`Mismatch recorded for ${visitor.fullName}.`);
        break;
      }
      case 'employee-check-in': {
        const record = await manualEmployeeCheckInMutation.mutateAsync({ employeeId: reasonAction.employeeId, reason });
        setEmployeeScan((current) => current ? {
          ...current,
          valid: true,
          action: 'CHECKED_IN',
          currentlyIn: true,
          message: `${record.employeeName} checked in with security assistance.`,
          attendance: record,
        } : current);
        setLastActionMessage(`${record.employeeName} checked in manually.`);
        break;
      }
      case 'employee-check-out': {
        const record = await manualEmployeeCheckOutMutation.mutateAsync({ employeeId: reasonAction.employeeId, reason });
        setEmployeeScan((current) => current ? {
          ...current,
          valid: true,
          action: 'CHECKED_OUT',
          currentlyIn: false,
          message: `${record.employeeName} checked out with security assistance.`,
          attendance: record,
        } : current);
        setLastActionMessage(`${record.employeeName} checked out manually.`);
        break;
      }
    }

    setReasonAction(null);
    await refreshWorkspace();
  };

  return (
    <>
      <AppScreen
        title="Security Scan"
        subtitle="Fast QR verification for visitors, employees, recurring badges, and manual checkpoint recovery."
        contentMaxWidth={layout.isLargeTablet ? 1280 : undefined}
      >
        <View style={[styles.workspaceGrid, layout.isTwoColumn ? styles.workspaceGridWide : null]}>
          <View style={[styles.primaryColumn, layout.isTwoColumn ? styles.primaryColumnWide : null]}>
          <SurfaceCard title="Checkpoint scanner" subtitle="Designed for reception desks, guard tablets, and one-hand Android workflows.">
              {runtime.offlineScanQueueSize > 0 || runtime.runtimeHealth === 'degraded' ? (
                <View style={styles.degradedState}>
                  <StatusPill
                    label={runtime.offlineScanQueueSize > 0 ? `${runtime.offlineScanQueueSize} queued` : 'Degraded sync'}
                    tone="warning"
                  />
                  <Text style={styles.helperText}>
                    {runtime.offlineScanQueueSize > 0
                      ? 'Offline scans are preserved for supervised retry. Backend validation is still required before access is granted.'
                      : 'Network conditions are degraded. Scans remain online-validated whenever connectivity is available.'}
                  </Text>
                </View>
              ) : null}

              {!permission ? (
                <Text style={styles.helperText}>Loading camera permission…</Text>
              ) : !permission.granted ? (
                <View style={styles.permissionState}>
                  <Text style={styles.permissionTitle}>Camera access is required</Text>
                  <Text style={styles.helperText}>AccessFlow needs the camera to scan visitor and workforce QR badges in real time.</Text>
                  <PrimaryButton label="Enable camera" onPress={() => void requestPermission()} />
                </View>
              ) : (
                <>
                  <View style={[styles.cameraFrame, { height: layout.scannerHeight }]}>
                    <CameraView
                      ref={cameraRef}
                      style={styles.camera}
                      active={cameraActive}
                      facing="back"
                      enableTorch={torchEnabled}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={cameraActive ? ({ data }) => onScannedPayload(data) : undefined}
                    />
                    <View pointerEvents="none" style={styles.scanGuide}>
                      <Animated.View style={[styles.scanTarget, scanGuideFrameStyle, { opacity: guideOpacity, transform: [{ scale: guideScale }] }]}>
                        <View style={styles.scanTargetBorder} />
                        <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineTranslate }] }]} />
                        <View style={[styles.scanCorner, styles.scanCornerTopLeft]} />
                        <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                        <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
                        <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
                        <View style={[styles.alignmentTick, styles.alignmentTickTop]} />
                        <View style={[styles.alignmentTick, styles.alignmentTickBottom]} />
                        <View style={[styles.alignmentTickVertical, styles.alignmentTickLeft]} />
                        <View style={[styles.alignmentTickVertical, styles.alignmentTickRight]} />
                      </Animated.View>
                      <View style={styles.scanHintPill}>
                        <Ionicons name="scan-outline" size={14} color={theme.colors.textInverse} />
                        <Text style={styles.scanHintText}>Fit QR inside frame</Text>
                      </View>
                    </View>
                    {scannerMode === 'feedback' ? (
                      <View pointerEvents="none" style={[styles.scanFeedback, scannerCopy.tone === 'danger' ? styles.scanFeedbackDanger : styles.scanFeedbackSuccess]}>
                        <Ionicons name={scannerCopy.icon} size={28} color={scannerCopy.tone === 'danger' ? theme.colors.danger : theme.colors.success} />
                        <Text maxFontSizeMultiplier={1.05} style={styles.scanFeedbackTitle}>{scannerCopy.title}</Text>
                      </View>
                    ) : null}
                    <View style={styles.cameraOverlay}>
                      <Text maxFontSizeMultiplier={1.08} style={styles.overlayEyebrow}>{scannerCopy.eyebrow}</Text>
                      <Text maxFontSizeMultiplier={1.08} style={styles.overlayTitle}>{scannerCopy.title}</Text>
                      {layout.isSmallPhone ? null : (
                        <Text maxFontSizeMultiplier={1.06} style={styles.overlayBody}>{scannerCopy.body}</Text>
                      )}
                    </View>
                  </View>

                  <View style={[styles.controlRow, layout.fieldStacked ? styles.controlRowStacked : null]}>
                    <Pressable accessibilityRole="button" onPress={() => setTorchEnabled((current) => !current)} style={styles.iconControl}>
                      <Ionicons name={torchEnabled ? 'flash' : 'flash-off'} size={22} color={theme.colors.textPrimary} />
                      <Text style={styles.iconControlText}>{torchEnabled ? 'Torch on' : 'Torch off'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={resetScanner} style={styles.iconControl}>
                      <Ionicons name="refresh" size={22} color={theme.colors.textPrimary} />
                      <Text style={styles.iconControlText}>{scannerMode === 'idle' ? 'Reset scanner' : 'Scan next'}</Text>
                    </Pressable>
                  </View>
                </>
              )}

              <AppTextField
                label="Manual QR fallback"
                multiline
                helperText="Use this if the camera is blocked, the code is damaged, or the checkpoint needs an offline-safe retry path."
                onChangeText={setManualPayload}
                value={manualPayload}
                placeholder="Paste a QR payload, verification link, or employee badge token."
              />
              <View style={[styles.buttonGrid, layout.isTablet ? styles.buttonGridWide : null]}>
                <PrimaryButton
                  label="Verify payload"
                  onPress={() => {
                    lastScannedPayloadRef.current = manualPayload.trim();
                    lastScanAtRef.current = Date.now();
                    setScannerMode('processing');
                    void processPayload(manualPayload);
                  }}
                  loading={isProcessing}
                  disabled={!manualPayload.trim()}
                />
                <PrimaryButton label="Clear result" onPress={resetScanner} tone="secondary" />
              </View>
            </SurfaceCard>

            {scanError ? (
              <SurfaceCard title="Scan issue">
                <StatusPill label="Action needed" tone="danger" />
                <Text style={styles.bodyText}>{scanError}</Text>
                <Text style={styles.helperText}>The app stayed responsive. Security can retry the scan, paste the payload manually, or use a logged override from the screens below.</Text>
              </SurfaceCard>
            ) : null}
          </View>

          <View style={styles.secondaryColumn}>
            {visitorVerification ? (
              <SurfaceCard title={visitorVerification.headline || 'Visitor verification'} subtitle={visitorVerification.recommendedAction || 'Security can now decide the next checkpoint action.'}>
                <View style={styles.verificationHeader}>
                  {visitorVerification.photoUrl ? <Image source={{ uri: visitorVerification.photoUrl }} style={styles.identityImage} /> : null}
                  <View style={styles.verificationMeta}>
                    <Text style={styles.identityName}>{visitorVerification.fullName || 'Visitor not identified'}</Text>
                    <Text style={styles.identitySubline}>
                      {[visitorVerification.companyName, visitorVerification.organizationName, visitorTypeLabel(visitorVerification.visitorType)].filter(Boolean).join(' · ')}
                    </Text>
                    <StatusPill
                      label={visitorVerification.statusLabel || (visitorVerification.valid ? 'Validated' : 'Blocked')}
                      tone={verificationTone(visitorVerification)}
                    />
                  </View>
                </View>

                <OperationalFieldList
                  items={[
                    { label: 'Approval status', value: visitorVerification.statusLabel || visitorStatusLabel(visitorVerification.status) },
                    { label: 'Visit type', value: visitorTypeLabel(visitorVerification.visitorType) },
                    { label: 'Access window', value: formatVisitorWindow(visitorVerification) },
                    { label: 'Host employee', value: visitorVerification.hostEmployee || 'Unassigned' },
                    { label: 'Host department', value: visitorVerification.hostEmployeeDepartment || 'Not recorded' },
                    { label: 'Badge status', value: visitorVerification.validityStatus || 'Pending' },
                    { label: 'Badge ID', value: visitorVerification.badgeId || 'Not issued' },
                    { label: 'Expires', value: formatDateTime(visitorVerification.expiresAt) },
                  ]}
                />

                <Text style={styles.bodyText}>{visitorVerification.message || 'Visitor verification completed.'}</Text>

                <View style={[styles.buttonGrid, layout.isTablet ? styles.buttonGridWide : null]}>
                  {checkInActionsAvailable && visitorVerification.valid && visitorVerification.canCheckIn ? (
                    <PrimaryButton label="Approve check-in" onPress={() => void handleVisitorCheckIn()} loading={visitorCheckInMutation.isPending} />
                  ) : null}
                  {liveActionsAvailable && visitorVerification.canCheckOut && visitorVerification.visitorId ? (
                    <PrimaryButton
                      label="Check out visitor"
                      onPress={() => void handleVisitorCheckOut(visitorVerification.visitorId as string)}
                      loading={visitorCheckOutMutation.isPending}
                      tone="secondary"
                    />
                  ) : null}
                  {liveActionsAvailable && visitorVerification.visitorId ? (
                    <PrimaryButton label="Deny entry" onPress={() => setReasonAction({ type: 'deny', visitorId: visitorVerification.visitorId as string })} tone="danger" />
                  ) : null}
                  {liveActionsAvailable && visitorVerification.visitorId ? (
                    <PrimaryButton label="Escalate issue" onPress={() => setReasonAction({ type: 'escalate', visitorId: visitorVerification.visitorId as string })} tone="secondary" />
                  ) : null}
                  {liveActionsAvailable && visitorVerification.visitorId ? (
                    <PrimaryButton label="Report mismatch" onPress={() => setReasonAction({ type: 'mismatch', visitorId: visitorVerification.visitorId as string })} tone="secondary" />
                  ) : null}
                  {liveActionsAvailable && visitorVerification.visitorId && !visitorVerification.valid && !visitorVerification.canCheckOut ? (
                    <PrimaryButton label="Manual override" onPress={() => setReasonAction({ type: 'override', visitorId: visitorVerification.visitorId as string })} tone="secondary" />
                  ) : null}
                  {!liveActionsAvailable || (emergencyCheckInsBlocked && visitorVerification.canCheckIn) ? (
                    <PrimaryButton
                      label={emergencyCheckInsBlocked && visitorVerification.canCheckIn ? 'Check-ins blocked by lockdown' : 'Live actions require connectivity'}
                      onPress={() => showSnackbar({ message: emergencyCheckInsBlocked && visitorVerification.canCheckIn ? 'Emergency lockdown is active. New check-ins are suspended.' : 'Privileged actions are disabled in Offline Mode', tone: 'warning' })}
                      tone="secondary"
                    />
                  ) : null}
                </View>
              </SurfaceCard>
            ) : null}

            {employeeScan ? (
              <SurfaceCard title={employeeScan.headline || 'Workforce verification'} subtitle={employeeScan.recommendedAction || 'Security visibility updated for access operations.'}>
                <View style={styles.verificationHeader}>
                  <View style={styles.employeeBadge}>
                    <Ionicons name="shield-checkmark" size={24} color={theme.colors.primary} />
                  </View>
                  <View style={styles.verificationMeta}>
                    <Text style={styles.identityName}>{employeeScan.employee?.fullName || 'Employee not identified'}</Text>
                    <Text style={styles.identitySubline}>
                      {[employeeScan.employee?.organizationName, employeeScan.employee?.department, employeeScan.employee?.designation].filter(Boolean).join(' · ')}
                    </Text>
                    <StatusPill
                      label={scanResultLabel(employeeScan.action || employeePresenceLabel(employeeScan.attendance || employeeScan.employee))}
                      tone={employeeScan.valid ? 'success' : 'danger'}
                    />
                  </View>
                </View>

                <OperationalFieldList
                  items={[
                    { label: 'Employee ID', value: employeeScan.employee?.employeeId || 'Pending' },
                    { label: 'Access state', value: employeeScan.employee?.accountStatus || 'Active' },
                    { label: 'Presence', value: employeePresenceLabel(employeeScan.attendance || employeeScan.employee) },
                    { label: 'Shift', value: employeeScan.employee?.shiftName || 'Not assigned' },
                    { label: 'Shift window', value: [formatTime(employeeScan.employee?.shiftStartTime), formatTime(employeeScan.employee?.shiftEndTime)].join(' - ') },
                    { label: 'Last event', value: relativePresenceSummary(employeeScan.attendance) },
                  ]}
                />

                <Text style={styles.bodyText}>{employeeScan.message || 'Workforce badge processed successfully.'}</Text>

                <View style={[styles.buttonGrid, layout.isTablet ? styles.buttonGridWide : null]}>
                  {liveActionsAvailable && employeeScan.employee?.id && (!emergencyCheckInsBlocked || employeeScan.currentlyIn) ? (
                    <PrimaryButton
                      label={employeeScan.currentlyIn ? 'Manual check-out' : 'Manual check-in'}
                      onPress={() => setReasonAction({
                        type: employeeScan.currentlyIn ? 'employee-check-out' : 'employee-check-in',
                        employeeId: employeeScan.employee?.id as string,
                      })}
                      tone="secondary"
                    />
                  ) : null}
                  {!liveActionsAvailable || (emergencyCheckInsBlocked && !employeeScan.currentlyIn) ? (
                    <PrimaryButton
                      label={emergencyCheckInsBlocked && !employeeScan.currentlyIn ? 'Workforce check-ins blocked' : 'Assisted actions require connectivity'}
                      onPress={() => showSnackbar({ message: emergencyCheckInsBlocked && !employeeScan.currentlyIn ? 'Emergency lockdown is active. New workforce check-ins are suspended.' : 'Manual workforce overrides are disabled in Offline Mode', tone: 'warning' })}
                      tone="secondary"
                    />
                  ) : null}
                  <PrimaryButton label="Resume scanning" onPress={resetScanner} tone="secondary" />
                </View>
              </SurfaceCard>
            ) : null}

            {lastActionMessage ? (
              <SurfaceCard title="Checkpoint update">
                <StatusPill label="Recorded" tone="success" />
                <Text style={styles.bodyText}>{lastActionMessage}</Text>
                {lastPayload ? <Text style={styles.helperText}>Last payload: {truncatePayload(lastPayload)}</Text> : null}
              </SurfaceCard>
            ) : null}
          </View>
        </View>
      </AppScreen>

      {reasonConfig ? (
        <ReasonCaptureModal
          visible={Boolean(reasonAction)}
          title={reasonConfig.title}
          helperText={reasonConfig.helperText}
          confirmLabel={reasonConfig.confirmLabel}
          loading={isProcessing}
          onCancel={() => setReasonAction(null)}
          onConfirm={handleReasonConfirm}
        />
      ) : null}
    </>
  );
}

function looksLikeEmployeeQr(value: string) {
  const normalized = value.trim();
  return normalized.startsWith('ACCESSFLOW_EMPLOYEE:') || normalized.includes('employeeToken=');
}

function truncatePayload(value: string) {
  return value.length > 48 ? `${value.slice(0, 45)}...` : value;
}

function scannerStatusCopy(
  scannerMode: ScannerMode,
  scanError: string | null,
  visitorVerification: QrVerificationResult | null,
  employeeScan: EmployeeScanResult | null,
  lastActionMessage: string | null,
  offlineMode: 'online' | 'degraded' | 'offline',
) {
  if (offlineMode === 'offline' && scannerMode === 'idle') {
    return {
      eyebrow: 'Offline Mode',
      title: 'Ready for cached badge scan',
      body: 'Known visitors and workforce can be processed provisionally. Unknown or stale badges are queued for backend verification.',
      icon: 'cloud-offline-outline' as const,
      tone: 'info' as const,
    };
  }

  if (scannerMode === 'processing') {
    return {
      eyebrow: offlineMode === 'online' ? 'Validating' : 'Offline check',
      title: offlineMode === 'online' ? 'Checking badge...' : 'Checking local cache...',
      body: offlineMode === 'online'
        ? 'Hold steady for backend verification. Access is granted only after the secure validation response.'
        : 'AccessFlow is matching the badge against bounded local operational records.',
      icon: 'sync-circle-outline' as const,
      tone: 'info' as const,
    };
  }

  if (scanError || visitorVerification?.valid === false || employeeScan?.valid === false) {
    return {
      eyebrow: 'Review needed',
      title: 'Scan needs attention',
      body: 'Use the result panel to retry, deny, escalate, or record a supervised override when policy allows.',
      icon: 'alert-circle-outline' as const,
      tone: 'danger' as const,
    };
  }

  if (lastActionMessage?.toLowerCase().includes('checked in')) {
    return {
      eyebrow: 'Approved',
      title: 'Check-in Successful',
      body: 'Recorded by the backend. The scanner will ready itself for the next badge.',
      icon: 'checkmark-circle-outline' as const,
      tone: 'success' as const,
    };
  }

  if (lastActionMessage?.toLowerCase().includes('checked out')) {
    return {
      eyebrow: 'Recorded',
      title: 'Check-out Successful',
      body: 'The exit event was saved. The scanner will be ready for the next operation.',
      icon: 'checkmark-circle-outline' as const,
      tone: 'success' as const,
    };
  }

  if (employeeScan?.valid) {
    return {
      eyebrow: 'Workforce',
      title: scanResultLabel(employeeScan.action || employeePresenceLabel(employeeScan.attendance || employeeScan.employee)),
      body: 'Presence updated securely. The camera will resume automatically for rapid checkpoint flow.',
      icon: 'checkmark-circle-outline' as const,
      tone: 'success' as const,
    };
  }

  if (visitorVerification?.valid) {
    return {
      eyebrow: 'Badge verified',
      title: visitorVerification.canCheckOut ? 'Ready for check-out' : visitorVerification.canCheckIn ? 'Access Approved' : 'Badge Valid',
      body: visitorVerification.canCheckIn
        ? 'Confirm the visitor and approve check-in from the result panel.'
        : 'Visitor credentials are valid. The scanner will reset when no further action is needed.',
      icon: 'checkmark-circle-outline' as const,
      tone: 'success' as const,
    };
  }

  return {
    eyebrow: 'Live scan',
    title: 'Ready for badge scan',
    body: 'Center the QR in the illuminated frame and hold steady for a quick secure read.',
    icon: 'scan-outline' as const,
    tone: 'info' as const,
  };
}

const styles = StyleSheet.create({
  permissionState: {
    gap: theme.spacing.md,
  },
  degradedState: {
    gap: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.28)',
    backgroundColor: theme.colors.warningSoft,
    padding: theme.spacing.md,
  },
  workspaceGrid: {
    gap: theme.spacing.lg,
  },
  workspaceGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  primaryColumn: {
    gap: theme.spacing.lg,
  },
  primaryColumnWide: {
    flex: 1.05,
  },
  secondaryColumn: {
    flex: 0.95,
    gap: theme.spacing.lg,
  },
  permissionTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  cameraFrame: {
    borderRadius: theme.radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  camera: {
    flex: 1,
  },
  scanGuide: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  scanTarget: {
    position: 'absolute',
    minHeight: 148,
  },
  scanTargetBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(237, 243, 251, 0.42)',
    backgroundColor: 'rgba(8, 15, 28, 0.08)',
  },
  scanLine: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 0,
    height: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.success,
    shadowColor: theme.colors.success,
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  scanCorner: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderColor: theme.colors.textInverse,
  },
  scanCornerTopLeft: {
    left: 0,
    top: 0,
    borderLeftWidth: 4,
    borderTopWidth: 4,
  },
  scanCornerTopRight: {
    right: 0,
    top: 0,
    borderRightWidth: 4,
    borderTopWidth: 4,
  },
  scanCornerBottomLeft: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
  },
  scanCornerBottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
  },
  alignmentTick: {
    position: 'absolute',
    left: '42%',
    right: '42%',
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(237, 243, 251, 0.82)',
  },
  alignmentTickTop: {
    top: 10,
  },
  alignmentTickBottom: {
    bottom: 10,
  },
  alignmentTickVertical: {
    position: 'absolute',
    top: '40%',
    bottom: '40%',
    width: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(237, 243, 251, 0.82)',
  },
  alignmentTickLeft: {
    left: 10,
  },
  alignmentTickRight: {
    right: 10,
  },
  scanHintPill: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(8, 15, 28, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  scanHintText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  scanFeedback: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '34%',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  scanFeedbackSuccess: {
    borderColor: 'rgba(34, 197, 94, 0.34)',
    backgroundColor: 'rgba(5, 46, 22, 0.82)',
  },
  scanFeedbackDanger: {
    borderColor: 'rgba(248, 113, 113, 0.38)',
    backgroundColor: 'rgba(69, 10, 10, 0.82)',
  },
  scanFeedbackTitle: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
    textAlign: 'center',
  },
  cameraOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    gap: theme.spacing.xs,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(191, 219, 254, 0.20)',
    backgroundColor: 'rgba(8, 15, 28, 0.78)',
    padding: theme.spacing.md,
  },
  overlayEyebrow: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  overlayTitle: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  overlayBody: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
  controlRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  controlRowStacked: {
    flexDirection: 'column',
  },
  iconControl: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    minHeight: 52,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
  },
  iconControlText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  buttonGrid: {
    gap: theme.spacing.sm,
  },
  buttonGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  verificationHeader: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  identityImage: {
    width: 82,
    height: 82,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceMuted,
  },
  employeeBadge: {
    width: 82,
    height: 82,
    borderRadius: 20,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verificationMeta: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  identityName: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  identitySubline: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
