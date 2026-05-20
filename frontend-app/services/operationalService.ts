import { request } from '../api/apiClient';
import type {
  DeviceIntegritySignals,
  DiagnosticEvent,
  MobileSessionPolicy,
  OperationalMetric,
  TrustedDeviceCategory,
  TrustedDeviceListResponse,
  TrustedDeviceRecord,
  TrustedDeviceStatus,
  TrustedOperationalRole,
} from '../types/runtime';

type TelemetryPayload = {
  diagnostics: DiagnosticEvent[];
  metrics: OperationalMetric[];
};

export async function submitMobileTelemetry(payload: TelemetryPayload) {
  return request<{ accepted: number }>({
    url: '/mobile/telemetry',
    method: 'POST',
    data: payload,
  });
}

export async function getMobileSessionPolicy(deviceId: string | null) {
  return request<MobileSessionPolicy>({
    url: '/mobile/session-policy',
    method: 'GET',
    params: deviceId ? { deviceId } : undefined,
  });
}

export type TrustedDeviceRegistrationPayload = {
  deviceId: string;
  installationId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  platformVersion?: string | null;
  appVersion: string;
  runtimeVersion: string;
  fingerprint: string;
  biometricEnabled: boolean;
  integritySignals: DeviceIntegritySignals;
};

export type TrustedDeviceUpdatePayload = {
  deviceName?: string | null;
  deviceCategory?: TrustedDeviceCategory;
  operationalRole?: TrustedOperationalRole;
  checkpointId?: string | null;
  checkpointName?: string | null;
  operationalZone?: string | null;
  trusted?: boolean;
  active?: boolean;
  trustStatus?: TrustedDeviceStatus;
  sharedOperationalDevice?: boolean;
  scannerFirst?: boolean;
  restrictedNavigation?: boolean;
  autoRestoreScanner?: boolean;
  inactivityTimeoutSeconds?: number | null;
  reason?: string | null;
};

export async function registerTrustedDevice(payload: TrustedDeviceRegistrationPayload) {
  return request<TrustedDeviceRecord>({
    url: '/mobile/trusted-devices',
    method: 'POST',
    data: payload,
  });
}

export async function listTrustedDevices(currentDeviceId?: string | null) {
  return request<TrustedDeviceListResponse>({
    url: '/mobile/trusted-devices',
    method: 'GET',
    params: currentDeviceId ? { currentDeviceId } : undefined,
  });
}

export async function revokeTrustedDevice(deviceRegistrationId: string) {
  return request<{ acknowledged: boolean }>({
    url: `/mobile/trusted-devices/${deviceRegistrationId}`,
    method: 'DELETE',
  });
}

export async function updateTrustedDevice(deviceRegistrationId: string, payload: TrustedDeviceUpdatePayload) {
  return request<TrustedDeviceRecord>({
    url: `/mobile/trusted-devices/${deviceRegistrationId}`,
    method: 'PATCH',
    data: payload,
  });
}

export async function logoutTrustedDevice(deviceRegistrationId: string) {
  return request<{ acknowledged: boolean }>({
    url: `/mobile/trusted-devices/${deviceRegistrationId}/logout`,
    method: 'POST',
  });
}
