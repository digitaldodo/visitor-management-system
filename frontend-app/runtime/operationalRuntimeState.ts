import { apiConfig } from '../api/apiConfig';
import type { OperationalSyncConnectionState } from '../types/operationalSync';
import type {
  DevicePostureState,
  NetworkReachabilityState,
  SessionLockState,
} from '../types/runtime';

export const defaultLockState: SessionLockState = {
  isLocked: false,
  reason: null,
  lockedAt: null,
  screenshotProtectionEnabled: apiConfig.security.screenshotProtectionEnabled,
};

export const defaultDevicePosture: DevicePostureState = {
  deviceId: null,
  managedMode: apiConfig.deviceManagement.managedMode,
  kioskModeReady: apiConfig.deviceManagement.kioskModeReady,
  remoteLogoutSupported: true,
  checkpointId: null,
  checkpointName: null,
  operationalZone: null,
  operationalModeEnabled: false,
  scannerFirst: false,
  restrictedNavigation: false,
  autoRestoreScanner: false,
  sharedOperationalDevice: false,
  inactivityTimeoutSeconds: null,
  suspicious: false,
  rootedOrJailbroken: false,
  emulator: false,
  debugBuild: false,
  integrityReasons: [],
  sensitiveOperationsRestricted: false,
  concurrentSessionCount: 0,
  lastPolicySyncAt: null,
};

export const initialNetworkState: NetworkReachabilityState = {
  isConnected: null,
  isInternetReachable: null,
  isApiReachable: true,
  lastOnlineAt: null,
  lastOfflineAt: null,
  lastApiReachableAt: null,
  consecutiveFailures: 0,
};

export const initialSyncConnection: OperationalSyncConnectionState = {
  status: 'idle',
  cursor: null,
  lastEventAt: null,
  lastConnectedAt: null,
  lastError: null,
  reconnectAttempt: 0,
  pendingEventCount: 0,
};

export function isSameSessionLock(left: SessionLockState, right: SessionLockState) {
  return left.isLocked === right.isLocked
    && left.reason === right.reason
    && left.lockedAt === right.lockedAt
    && left.screenshotProtectionEnabled === right.screenshotProtectionEnabled;
}

export function isSameDevicePosture(left: DevicePostureState, right: DevicePostureState) {
  return left.deviceId === right.deviceId
    && left.managedMode === right.managedMode
    && left.kioskModeReady === right.kioskModeReady
    && left.remoteLogoutSupported === right.remoteLogoutSupported
    && left.checkpointId === right.checkpointId
    && left.checkpointName === right.checkpointName
    && left.operationalZone === right.operationalZone
    && left.operationalModeEnabled === right.operationalModeEnabled
    && left.scannerFirst === right.scannerFirst
    && left.restrictedNavigation === right.restrictedNavigation
    && left.autoRestoreScanner === right.autoRestoreScanner
    && left.sharedOperationalDevice === right.sharedOperationalDevice
    && left.inactivityTimeoutSeconds === right.inactivityTimeoutSeconds
    && left.suspicious === right.suspicious
    && left.rootedOrJailbroken === right.rootedOrJailbroken
    && left.emulator === right.emulator
    && left.debugBuild === right.debugBuild
    && left.sensitiveOperationsRestricted === right.sensitiveOperationsRestricted
    && left.concurrentSessionCount === right.concurrentSessionCount
    && left.lastPolicySyncAt === right.lastPolicySyncAt
    && areStringArraysEqual(left.integrityReasons, right.integrityReasons);
}

export function isSameNetworkState(left: NetworkReachabilityState, right: NetworkReachabilityState) {
  return left.isConnected === right.isConnected
    && left.isInternetReachable === right.isInternetReachable
    && left.isApiReachable === right.isApiReachable
    && left.lastOnlineAt === right.lastOnlineAt
    && left.lastOfflineAt === right.lastOfflineAt
    && left.lastApiReachableAt === right.lastApiReachableAt
    && left.consecutiveFailures === right.consecutiveFailures;
}

export function isOfflineNetworkState(state: NetworkReachabilityState) {
  return state.isConnected === false
    || state.isInternetReachable === false
    || (!state.isApiReachable && state.consecutiveFailures >= 2);
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}
