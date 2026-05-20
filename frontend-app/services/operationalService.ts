import { request } from '../api/apiClient';
import type {
  DeviceIntegritySignals,
  DiagnosticEvent,
  MobileSessionPolicy,
  OperationalMetric,
  TrustedDeviceListResponse,
  TrustedDeviceRecord,
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

export async function logoutTrustedDevice(deviceRegistrationId: string) {
  return request<{ acknowledged: boolean }>({
    url: `/mobile/trusted-devices/${deviceRegistrationId}/logout`,
    method: 'POST',
  });
}
