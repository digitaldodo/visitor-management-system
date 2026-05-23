import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { apiConfig } from '../api/apiConfig';
import { readOrCreateDeviceId, readOrCreateInstallationId } from '../storage/sessionStorage';
import type { DeviceIntegritySignals } from '../types/runtime';

async function getCurrentDeviceDescriptor() {
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
