import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import { Alert, Platform } from 'react-native';

import { apiConfig } from '../api/apiConfig';
import { showPermissionEducation } from '../permissions/permissionEducation';
import { recordDiagnosticEvent } from '../runtime/diagnostics';
import { readOrCreateDeviceId, readOrCreateInstallationId } from '../storage/sessionStorage';
import { readSecureJson, removeSecureValue, writeSecureJson } from '../storage/secureStore';
import type { AuthSession, WorkspaceAudience } from '../types/auth';
import type { DeviceIntegritySignals, TrustedDeviceRecord } from '../types/runtime';

const TRUST_PROFILE_KEY = 'accessflow.mobile.device-trust.profile';
const DEVICE_UNLOCK_PROMPT_DEBOUNCE_MS = 10_000;

let deviceUnlockPromise: Promise<DeviceUnlockResult> | null = null;
let lastDeviceUnlockPromptAt = 0;

export type LocalDeviceTrustProfile = {
  deviceId: string;
  userId: string;
  audience: WorkspaceAudience;
  trusted: boolean;
  biometricEnabled: boolean;
  deviceName: string;
  deviceType: string;
  platform: string;
  appVersion: string;
  runtimeVersion: string;
  trustEstablishedAt: string;
  lastUnlockedAt?: string | null;
};

export type DeviceUnlockResult =
  | { success: true }
  | { success: false; reason: string; interrupted: boolean };

export async function readLocalDeviceTrustProfile() {
  return readSecureJson<LocalDeviceTrustProfile>(TRUST_PROFILE_KEY);
}

export async function writeLocalDeviceTrustProfile(profile: LocalDeviceTrustProfile) {
  await writeSecureJson(TRUST_PROFILE_KEY, profile);
}

export async function clearLocalDeviceTrustProfile() {
  await removeSecureValue(TRUST_PROFILE_KEY);
}

export function isEnterpriseTrustAudience(audience: WorkspaceAudience) {
  return audience === 'security' || audience === 'employee' || audience === 'admin';
}

export async function getCurrentDeviceDescriptor() {
  const [deviceId, installationId] = await Promise.all([
    readOrCreateDeviceId(),
    readOrCreateInstallationId(),
  ]);
  const deviceName = Constants.deviceName
    || Device.deviceName
    || Application.applicationName
    || `${Platform.OS} device`;
  const deviceType = Device.deviceType === Device.DeviceType.TABLET
    ? 'tablet'
    : Device.deviceType === Device.DeviceType.DESKTOP
      ? 'desktop'
      : 'phone';

  return {
    deviceId,
    installationId,
    deviceName,
    deviceType,
    platform: Platform.OS,
    platformVersion: String(Device.osVersion || ''),
    appVersion: apiConfig.appVersion,
    runtimeVersion: apiConfig.runtimeVersion,
    fingerprint: buildDeviceFingerprint(deviceId),
  };
}

export async function collectDeviceIntegritySignals(): Promise<DeviceIntegritySignals> {
  const reasons: string[] = [];
  const debugBuild = Boolean(__DEV__);
  const emulator = !Device.isDevice;
  const rootedOrJailbroken = await detectRootOrJailbreakSignals();
  const tamperedRuntime = detectTamperedRuntime();

  if (debugBuild) {
    reasons.push('debug-build');
  }
  if (emulator) {
    reasons.push('emulator');
  }
  if (rootedOrJailbroken) {
    reasons.push(Platform.OS === 'ios' ? 'jailbreak-indicators' : 'root-indicators');
  }
  if (tamperedRuntime) {
    reasons.push('runtime-tampering-indicators');
  }

  return {
    rootedOrJailbroken,
    emulator,
    debugBuild,
    tamperedRuntime,
    suspicious: rootedOrJailbroken || tamperedRuntime || (apiConfig.environment === 'production' && (emulator || debugBuild)),
    reasons,
  };
}

export async function promptForDeviceTrust(session: AuthSession) {
  if (!isEnterpriseTrustAudience(session.audience)) {
    return { trusted: false, biometricEnabled: false };
  }

  const biometricReady = await isBiometricOrDeviceCredentialReady();
  return new Promise<{ trusted: boolean; biometricEnabled: boolean }>((resolve) => {
    Alert.alert(
      'Trust this device?',
      biometricReady
        ? 'Bind this AccessFlow session to this device and enable biometric or device unlock for future workspace recovery.'
        : 'Bind this AccessFlow session to this device. You can enable biometrics after enrolling device unlock.',
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => resolve({ trusted: false, biometricEnabled: false }),
        },
        {
          text: biometricReady ? 'Trust and enable' : 'Trust device',
          onPress: () => resolve({ trusted: true, biometricEnabled: biometricReady }),
        },
      ],
    );
  });
}

export async function authenticateDeviceUnlock(reason: 'bootstrap' | 'resume' | 'enable' | 'manual'): Promise<DeviceUnlockResult> {
  if (deviceUnlockPromise) {
    return deviceUnlockPromise;
  }

  const now = Date.now();
  if (now - lastDeviceUnlockPromptAt < DEVICE_UNLOCK_PROMPT_DEBOUNCE_MS) {
    return { success: false, reason: 'device-unlock-debounced', interrupted: true };
  }
  lastDeviceUnlockPromptAt = now;

  deviceUnlockPromise = performDeviceUnlock(reason);
  try {
    return await deviceUnlockPromise;
  } finally {
    deviceUnlockPromise = null;
  }
}

async function performDeviceUnlock(reason: 'bootstrap' | 'resume' | 'enable' | 'manual'): Promise<DeviceUnlockResult> {
  const ready = await isBiometricOrDeviceCredentialReady();
  if (!ready) {
    return { success: false, reason: 'device-unlock-unavailable', interrupted: true };
  }

  const accepted = await showPermissionEducation('biometric');
  if (!accepted) {
    return { success: false, reason: 'device-unlock-cancelled', interrupted: true };
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: promptForReason(reason),
    cancelLabel: 'Use password',
    fallbackLabel: 'Use device PIN',
    disableDeviceFallback: false,
    requireConfirmation: false,
  });

  if (!result.success) {
    await recordDiagnosticEvent({
      level: 'warn',
      scope: 'security',
      code: 'DEVICE_UNLOCK_FAILED',
      message: 'Device unlock was not completed.',
      context: {
        reason,
        error: 'error' in result ? result.error : null,
        warning: result.warning ?? null,
      },
    });
  }

  if (result.success) {
    return { success: true };
  }

  const failureReason = 'error' in result ? result.error : 'cancelled';
  return {
    success: false,
    reason: failureReason,
    interrupted: isSoftDeviceUnlockInterruption(failureReason),
  };
}

export async function bindTrustedDeviceLocally(session: AuthSession, biometricEnabled: boolean) {
  const descriptor = await getCurrentDeviceDescriptor();
  const profile: LocalDeviceTrustProfile = {
    deviceId: descriptor.deviceId,
    userId: session.user.id,
    audience: session.audience,
    trusted: true,
    biometricEnabled,
    deviceName: descriptor.deviceName,
    deviceType: descriptor.deviceType,
    platform: descriptor.platform,
    appVersion: descriptor.appVersion,
    runtimeVersion: descriptor.runtimeVersion,
    trustEstablishedAt: new Date().toISOString(),
    lastUnlockedAt: null,
  };
  await writeLocalDeviceTrustProfile(profile);
  return profile;
}

export async function markDeviceUnlocked(profile: LocalDeviceTrustProfile) {
  await writeLocalDeviceTrustProfile({
    ...profile,
    lastUnlockedAt: new Date().toISOString(),
  });
}

export function mergeCurrentDevice(devices: TrustedDeviceRecord[], currentDeviceId: string | null) {
  return devices.map((device) => ({
    ...device,
    currentDevice: Boolean(currentDeviceId && device.deviceId === currentDeviceId) || device.currentDevice,
  }));
}

async function isBiometricOrDeviceCredentialReady() {
  try {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hardware && enrolled;
  } catch {
    return false;
  }
}

function buildDeviceFingerprint(deviceId: string) {
  return [
    deviceId,
    Platform.OS,
    Device.osName || '',
    Device.osVersion || '',
    Device.modelName || '',
    Application.applicationId || '',
  ].join('|');
}

function promptForReason(reason: 'bootstrap' | 'resume' | 'enable' | 'manual') {
  switch (reason) {
    case 'bootstrap':
      return 'Unlock AccessFlow';
    case 'resume':
      return 'Resume AccessFlow workspace';
    case 'enable':
      return 'Enable biometric unlock';
    default:
      return 'Confirm device unlock';
  }
}

export function isSoftDeviceUnlockInterruption(reason?: string | null) {
  const normalized = String(reason || '').toLowerCase();
  return (
    !normalized
    || normalized.includes('cancel')
    || normalized.includes('user_cancel')
    || normalized.includes('system_cancel')
    || normalized.includes('app_cancel')
    || normalized.includes('authentication_failed')
    || normalized.includes('lockout')
    || normalized.includes('not_available')
    || normalized.includes('not_enrolled')
    || normalized.includes('passcode_not_set')
    || normalized.includes('device-unlock')
  );
}

async function detectRootOrJailbreakSignals() {
  if (Platform.OS === 'web') {
    return false;
  }

  const suspiciousPaths = Platform.select({
    android: [
      'file:///system/app/Superuser.apk',
      'file:///system/bin/su',
      'file:///system/xbin/su',
      'file:///sbin/su',
      'file:///vendor/bin/su',
      'file:///su/bin/su',
      'file:///system/bin/magisk',
      'file:///system/xbin/daemonsu',
    ],
    ios: [
      'file:///Applications/Cydia.app',
      'file:///Library/MobileSubstrate/MobileSubstrate.dylib',
      'file:///bin/bash',
      'file:///usr/sbin/sshd',
      'file:///etc/apt',
    ],
    default: [],
  }) ?? [];

  const checks = await Promise.all(
    suspiciousPaths.map((path) => FileSystem.getInfoAsync(path).then((info) => info.exists).catch(() => false)),
  );

  return checks.some(Boolean);
}

function detectTamperedRuntime() {
  const ownership = Constants.executionEnvironment;
  const appOwnership = Constants.appOwnership;
  const applicationId = String(Application.applicationId || '').toLowerCase();
  const expectedId = String(Constants.expoConfig?.android?.package || Constants.expoConfig?.ios?.bundleIdentifier || '').toLowerCase();

  if (apiConfig.environment === 'production' && (appOwnership === 'expo' || ownership === 'storeClient')) {
    return true;
  }

  return Boolean(expectedId && applicationId && expectedId !== applicationId);
}
