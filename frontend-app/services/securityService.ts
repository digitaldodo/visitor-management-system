import { request } from '../api/apiClient';
import type {
  EmployeeAttendanceRecord,
  EmployeeDirectoryEntry,
  QrVerificationResult,
  SecurityMonitoring,
  SecurityOverview,
  VisitorRecord,
} from '../types/domain';
import type { PageResponse } from '../types/api';

export async function getSecurityOverview() {
  return request<SecurityOverview>({
    url: '/security/overview',
    method: 'GET',
  });
}

export async function getSecurityVisitors(params?: { query?: string; page?: number; size?: number }) {
  return request<PageResponse<VisitorRecord>>({
    url: '/security/visitors',
    method: 'GET',
    params: {
      page: params?.page ?? 0,
      size: params?.size ?? 20,
      query: params?.query,
    },
  });
}

export async function getSecurityMonitoring(query?: string) {
  return request<SecurityMonitoring>({
    url: '/security/monitoring',
    method: 'GET',
    params: query ? { query } : undefined,
  });
}

export async function getSecurityAttendance() {
  return request<EmployeeAttendanceRecord[]>({
    url: '/security/employees/attendance',
    method: 'GET',
  });
}

export async function getSecurityEmployees(query?: string) {
  return request<EmployeeDirectoryEntry[]>({
    url: '/security/employees',
    method: 'GET',
    params: query ? { query } : undefined,
  });
}

export async function verifyQrPayload(qrPayload: string) {
  return request<QrVerificationResult>({
    url: '/security/qr-verification',
    method: 'POST',
    data: {
      qrPayload,
    },
  });
}

export async function checkInWithQr(qrPayload: string) {
  return request<VisitorRecord>({
    url: '/security/qr-check-in',
    method: 'POST',
    data: {
      qrPayload,
    },
  });
}
