import { request } from '../api/apiClient';
import type {
  DiagnosticEvent,
  MobileSessionPolicy,
  OperationalMetric,
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
